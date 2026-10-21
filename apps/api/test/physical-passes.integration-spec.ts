import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import jsQR from 'jsqr';
import { Client as PgClient } from 'pg';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../src/common/database/transaction-policy';
import {
  ClientOperatingProfile,
  ClientStatus,
  ClientType,
  CommercialChannel,
  EventSocialType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  FloorplanGeometry,
  FloorplanShapeKind,
  InvitationResponseStatus,
  AssistantResponseStatus,
  LedgerMovementType,
  ServiceCode,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';
import { PhysicalPassTokenService } from '../src/physical-passes/physical-pass-token.service';
import { resolvePhysicalPassReadiness } from '../src/physical-passes/physical-pass-readiness.service';
import { createOpenApiDocument } from '../src/openapi/openapi';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('PhysicalPasses', () => {
  let app: INestApplication;
  let audit: AuditService;
  let prisma: PrismaService;
  let tokens: PhysicalPassTokenService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'physical-pass-integration-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    audit = app.get(AuditService);
    prisma = app.get(PrismaService);
    tokens = app.get(PhysicalPassTokenService);
  });

  beforeEach(resetDatabase, 60_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('generates Provider-owned anonymous batches without commercial or nominal aggregates and keeps activation blocked', async () => {
    const f = await anonymousFixture(3);
    const first = await adminGenerate(f, 'anonymous-provider-001', 2).expect(200);
    expect(first.body).toMatchObject({ firstPassNumber: 1, lastPassNumber: 2, quantity: 2, table: null });
    expect((await adminGenerate(f, 'anonymous-provider-001', 2).expect(200)).body).toEqual(first.body);
    expect(
      (
        await adminGenerate(
          { ...f, eventId: f.eventId.toUpperCase(), clientId: f.clientId.toUpperCase() },
          'anonymous-provider-001',
          2
        ).expect(200)
      ).body
    ).toEqual(first.body);
    await adminGenerate(f, 'anonymous-provider-001', 1).expect(409);
    const otherProvider = await createUser(UserRole.PLATFORM_ADMIN, null);
    await adminGenerate({ ...f, providerCookie: await login(otherProvider.email) }, 'anonymous-provider-001', 2).expect(
      409
    );
    expect(
      (await prisma.physicalPass.findMany({ where: { eventId: f.eventId } })).every(
        (p) => p.createdByUserId === f.userId
      )
    ).toBe(true);
    for (const cookie of [f.cookie, f.adminCookie])
      await generate(f.eventId, cookie, randomUUID(), 1)
        .expect(403)
        .expect(({ body }) => expect(body.code).toBe('CLIENT_MANAGED_CAPABILITY_FORBIDDEN'));
    await adminGenerate({ ...f, providerCookie: f.cookie }, randomUUID(), 1).expect(403);
    await generate(f.eventId, f.providerCookie, randomUUID(), 1).expect(403);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: f.eventId } });
    expect(event.status).toBe(EventStatus.CONFIGURED);
    expect(await prisma.$transaction((tx) => resolvePhysicalPassReadiness(tx, f.eventId))).toMatchObject({
      complete: false,
      activePassCount: 2,
      blockers: ['EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED']
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.event.update({ where: { id: f.eventId }, data: { status: EventStatus.READY_TO_ACTIVATE } });
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${f.clientId}/events/${f.eventId}/activate`)
      .set('Origin', origin)
      .set('Cookie', f.providerCookie)
      .set('Idempotency-Key', 'anonymous-activation-blocked')
      .send({})
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_ACCESS_CONTROL_READINESS_NOT_IMPLEMENTED'));
    await assertNoSyntheticDomainWrites();
    expect(await prisma.auditLog.count({ where: { eventId: f.eventId, action: 'PHYSICAL_PASS_GENERATE' } })).toBe(1);
    const document = createOpenApiDocument(app);
    for (const path of [
      '/api/v1/admin/clients/{clientId}/events/{eventId}/physical-passes/generate',
      '/api/v1/events/{eventId}/physical-passes/{passId}/revoke'
    ])
      expect(document.paths[path]?.post?.parameters).toContainEqual(
        expect.objectContaining({ name: 'Idempotency-Key', required: true })
      );
  });

  it('authorizes anonymous reads and SVG by assigned Planner/Organization and enforces exact tenant and modality', async () => {
    const f = await anonymousFixture(3),
      foreign = await anonymousFixture(3);
    const issued = await adminGenerate(f, 'anonymous-reads', 1).expect(200),
      passId = issued.body.passes[0].id as string;
    for (const cookie of [f.cookie, f.adminCookie]) {
      const list = await request(app.getHttpServer())
        .get(`/api/v1/events/${f.eventId}/physical-passes`)
        .set('Cookie', cookie)
        .expect(200);
      expect(list.body).toEqual(issued.body.passes);
      const svg = await getSvg(f.eventId, passId, cookie).expect(200);
      const repeat = await getSvg(f.eventId, passId, cookie).expect(200);
      expect(repeat.body).toEqual(svg.body);
      expect(svg.headers).toMatchObject({
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'"
      });
      const stored = await prisma.physicalPass.findUniqueOrThrow({ where: { id: passId } });
      expect(await decodeSvgQr(svg.body as Buffer)).toBe(tokens.issue(stored.id, stored.qrTokenNonce));
      expect(JSON.stringify(list.body)).not.toMatch(/nonce|token|signature|snapshot|phone|finance/iu);
    }
    const colleague = await createUser(UserRole.ORGANIZATION_PLANNER, f.clientId);
    for (const cookie of [foreign.cookie, await login(colleague.email)]) {
      await request(app.getHttpServer())
        .get(`/api/v1/events/${f.eventId}/physical-passes`)
        .set('Cookie', cookie)
        .expect(404);
      await getSvg(f.eventId, passId, cookie).expect(404);
      await revokeAnonymous(f, passId, randomUUID(), cookie).expect(404);
    }
    await getSvg(f.eventId, passId, f.providerCookie).expect(403);
    await getSvg(foreign.eventId, passId, foreign.cookie).expect(404);
    await adminGenerate({ ...f, clientId: foreign.clientId }, randomUUID(), 1).expect(404);
    for (const [code, accessMode] of [
      ['ACCESS_CONTROL', 'NOMINAL'],
      ['PHYSICAL_QR', null],
      ['FLYER', null]
    ] as const) {
      const service = await prisma.service.upsert({ where: { code }, create: { code }, update: {} });
      const event = await prisma.event.create({
        data: {
          clientId: f.clientId,
          createdByUserId: f.userId,
          assignedPlannerUserId: f.plannerId,
          serviceId: service.id,
          accessMode,
          capacity: 3
        }
      });
      await adminGenerate({ ...f, eventId: event.id }, randomUUID(), 1).expect(409);
      if (accessMode)
        await request(app.getHttpServer())
          .get(`/api/v1/events/${event.id}/physical-passes`)
          .set('Cookie', f.cookie)
          .expect(409);
    }
    await prisma.event.update({ where: { id: f.eventId }, data: { assignedPlannerUserId: colleague.id } });
    await getSvg(f.eventId, passId, f.cookie).expect(404);
    await getSvg(f.eventId, passId, await login(colleague.email)).expect(200);
  }, 60_000);

  it('revokes unused anonymous passes exactly once, invalidates old SVG tokens and releases capacity without recycling folios', async () => {
    const f = await anonymousFixture(2);
    const issued = await adminGenerate(f, 'anonymous-full', 2).expect(200),
      passId = issued.body.passes[1].id as string;
    const before = await prisma.physicalPass.findUniqueOrThrow({ where: { id: passId } });
    const svg = await getSvg(f.eventId, passId, f.cookie).expect(200),
      token = await decodeSvgQr(svg.body as Buffer);
    const first = await revokeAnonymous(f, passId, 'anonymous-revoke-one').expect(200);
    expect(first.body).toMatchObject({
      status: 'REVOKED',
      physicalPassId: passId,
      passNumber: 2,
      revocationReasonCode: 'OPERATOR_REQUEST'
    });
    expect((await revokeAnonymous(f, passId, 'anonymous-revoke-one').expect(200)).body).toEqual(first.body);
    expect(
      (
        await revokeAnonymous(
          { ...f, eventId: f.eventId.toUpperCase() },
          passId.toUpperCase(),
          'anonymous-revoke-one'
        ).expect(200)
      ).body
    ).toEqual(first.body);
    await revokeAnonymous(f, passId, 'anonymous-revoke-again').expect(409);
    await revokeAnonymous(f, passId, 'anonymous-revoke-one', f.adminCookie).expect(409);
    await revokeAnonymous(f, issued.body.passes[0].id as string, 'anonymous-revoke-one').expect(409);
    await revokeAnonymous(f, passId, 'anonymous-revoke-one', f.cookie, 'REPLACED').expect(409);
    expect((await adminGenerate(f, 'anonymous-full', 2).expect(200)).body).toEqual(issued.body);
    const next = await adminGenerate(f, 'anonymous-next', 1).expect(200);
    expect(next.body).toMatchObject({ firstPassNumber: 3, lastPassNumber: 3 });
    await adminGenerate(f, 'anonymous-over-capacity', 1).expect(409);
    await getSvg(f.eventId, passId, f.cookie).expect(404);
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/events/${f.eventId}/physical-passes`)
      .set('Cookie', f.cookie)
      .expect(200);
    expect(listed.body.map((p: { status: string }) => p.status)).toEqual(['UNUSED', 'REVOKED', 'UNUSED']);
    const stored = await prisma.physicalPass.findUniqueOrThrow({ where: { id: passId } });
    expect(stored).toMatchObject({
      qrTokenNonce: before.qrTokenNonce,
      qrTokenVersion: before.qrTokenVersion,
      passNumber: before.passNumber,
      createdByUserId: f.userId,
      revokedByUserId: f.plannerId
    });
    expect(stored.revokeResultSnapshot).toEqual(first.body);
    const staff = await anonymousStaff(f);
    await scan(staff, 'anonymous-revoked-token', token)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('PHYSICAL_PASS_NOT_FOUND'));
    expect(await prisma.auditLog.count({ where: { eventId: f.eventId, action: 'PHYSICAL_PASS_REVOKE' } })).toBe(1);
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toMatch(/pp1\.|nonce|qrToken|phone|signature/iu);
  });

  it('checks in anonymous passes once with current Staff, stable snapshots and no nominal or financial writes', async () => {
    const f = await anonymousFixture(3);
    const generated = await adminGenerate(f, 'anonymous-scan-batch', 3).expect(200);
    const pass = await prisma.physicalPass.findUniqueOrThrow({ where: { id: generated.body.passes[0].id as string } });
    const token = tokens.issue(pass.id, pass.qrTokenNonce),
      staff = await anonymousStaff(f);
    const secondStaff = await createStaff(f.eventId, f.adminCookie, 'Second anonymous door');
    for (const bad of [token.slice(0, -1) + '!', 'qr1.invalid', 'na1.invalid'])
      await scan(staff, randomUUID(), bad).expect(404);
    const foreign = await anonymousFixture(1),
      foreignPass = await adminGenerate(foreign, 'anonymous-foreign', 1).expect(200);
    const material = await prisma.physicalPass.findUniqueOrThrow({
      where: { id: foreignPass.body.passes[0].id as string }
    });
    await scan(staff, randomUUID(), tokens.issue(material.id, material.qrTokenNonce)).expect(404);
    const responses = await startBehindVerifiedEventLock(f.eventId, () => [
      scan(staff, 'anonymous-use-a', token),
      scan(secondStaff, 'anonymous-use-b', token)
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner =
      responses[0].status === 200
        ? { staff, key: 'anonymous-use-a', response: responses[0] }
        : { staff: secondStaff, key: 'anonymous-use-b', response: responses[1] };
    expect((await scan(winner.staff, winner.key, token).expect(200)).body).toEqual(winner.response.body);
    expect(Object.keys(winner.response.body).sort()).toEqual(
      ['status', 'physicalPassId', 'passNumber', 'usedAt', 'table'].sort()
    );
    await scan(staff === winner.staff ? secondStaff : staff, winner.key, token).expect(409);
    await revokeAnonymous(f, pass.id, 'anonymous-used-revoke')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PHYSICAL_PASS_ALREADY_USED'));
    const other = await prisma.physicalPass.findUniqueOrThrow({ where: { id: generated.body.passes[1].id as string } });
    await scan(staff, winner.key, tokens.issue(other.id, other.qrTokenNonce)).expect(409);
    const staffRow = await prisma.staffToken.findFirstOrThrow({
      where: { eventId: f.eventId, tokenDigestSha256: createHash('sha256').update(staff).digest('hex') }
    });
    await prisma.staffToken.update({ where: { id: staffRow.id }, data: { expiredAt: new Date() } });
    await scan(staff, 'anonymous-expired', tokens.issue(other.id, other.qrTokenNonce)).expect(401);
    for (const status of [EventStatus.CLOSED, EventStatus.CANCELLED]) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        await tx.event.update({ where: { id: f.eventId }, data: { status } });
      });
      await scan(secondStaff, randomUUID(), tokens.issue(other.id, other.qrTokenNonce))
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('STAFF_EVENT_NOT_OPERATIONAL'));
    }
    expect(await prisma.auditLog.count({ where: { eventId: f.eventId, action: 'PHYSICAL_PASS_USE' } })).toBe(1);
    await assertNoSyntheticDomainWrites();
  }, 60_000);

  it('serializes anonymous batches, last capacity and generation versus revocation with historical numbering', async () => {
    const f = await anonymousFixture(6);
    const ranges = await startBehindVerifiedEventLock(f.eventId, () => [
      adminGenerate(f, 'anonymous-range-a', 3),
      adminGenerate(f, 'anonymous-range-b', 3)
    ]);
    expect(ranges.map((r) => r.status)).toEqual([200, 200]);
    expect(ranges.map((r) => r.body.firstPassNumber as number).sort((a, b) => a - b)).toEqual([1, 4]);
    const shared = await anonymousFixture(1);
    const same = await startBehindVerifiedEventLock(shared.eventId, () => [
      adminGenerate(shared, 'anonymous-same-key', 1),
      adminGenerate(shared, 'anonymous-same-key', 1)
    ]);
    expect(same.map((r) => r.status)).toEqual([200, 200]);
    expect(same[0].body).toEqual(same[1].body);
    for (const revokeFirst of [true, false]) {
      const last = await anonymousFixture(1);
      const pass = await adminGenerate(last, `anonymous-one-existing-${revokeFirst}`, 1).expect(200),
        id = pass.body.passes[0].id as string;
      const key = `anonymous-generate-race-${revokeFirst}`;
      const result = revokeFirst
        ? await startBehindVerifiedEventLock(last.eventId, () => [
            revokeAnonymous(last, id, `anonymous-release-one-${revokeFirst}`),
            adminGenerate(last, key, 1)
          ])
        : await startBehindVerifiedEventLock(last.eventId, () => [
            adminGenerate(last, key, 1),
            revokeAnonymous(last, id, `anonymous-release-one-${revokeFirst}`)
          ]);
      expect(result[revokeFirst ? 0 : 1].status).toBe(200);
      const generated = result[revokeFirst ? 1 : 0];
      expect([200, 409]).toContain(generated.status);
      const final = await adminGenerate(last, key, 1).expect(200);
      expect(final.body).toMatchObject({ firstPassNumber: 2, lastPassNumber: 2 });
      expect(
        await prisma.physicalPass.count({ where: { eventId: last.eventId, revokedAt: null, deletedAt: null } })
      ).toBe(1);
    }
  }, 60_000);

  it('serializes scan/revoke in both orders and rolls back all anonymous operations when audit fails', async () => {
    for (const scanFirst of [true, false]) {
      const f = await anonymousFixture(1),
        issued = await adminGenerate(f, `anonymous-race-material-${scanFirst}`, 1).expect(200);
      const id = issued.body.passes[0].id as string,
        pass = await prisma.physicalPass.findUniqueOrThrow({ where: { id } });
      const staff = await anonymousStaff(f),
        token = tokens.issue(pass.id, pass.qrTokenNonce);
      const gate = auditBarrier(scanFirst ? 'PHYSICAL_PASS_USE' : 'PHYSICAL_PASS_REVOKE');
      const first = (
        scanFirst
          ? scan(staff, `anonymous-race-scan-${scanFirst}`, token)
          : revokeAnonymous(f, id, `anonymous-race-revoke-${scanFirst}`)
      ).then((r) => r);
      let second: Promise<request.Response> | undefined;
      try {
        await gate.entered.promise;
        second = (
          scanFirst
            ? revokeAnonymous(f, id, `anonymous-race-revoke-${scanFirst}`)
            : scan(staff, `anonymous-race-scan-${scanFirst}`, token)
        ).then((r) => r);
        await waitForVerifiedLockWaiters(1);
      } finally {
        gate.release.resolve();
      }
      expect((await first).status).toBe(200);
      expect((await second!).status).toBe(scanFirst ? 409 : 404);
      gate.restore();
      const stored = await prisma.physicalPass.findUniqueOrThrow({ where: { id } });
      expect(stored.usedAt !== null).toBe(scanFirst);
      expect(stored.revokedAt !== null).toBe(!scanFirst);
    }
    const rollback = await anonymousFixture(2),
      original = audit.record.bind(audit);
    for (const action of ['PHYSICAL_PASS_GENERATE', 'PHYSICAL_PASS_REVOKE', 'PHYSICAL_PASS_USE']) {
      let id: string | undefined, staff: string | undefined, token: string | undefined;
      if (action !== 'PHYSICAL_PASS_GENERATE') {
        const batch = await adminGenerate(rollback, `anonymous-audit-${action}`, 1).expect(200);
        id = batch.body.passes[0].id as string;
        const pass = await prisma.physicalPass.findUniqueOrThrow({ where: { id } });
        token = tokens.issue(pass.id, pass.qrTokenNonce);
        if (action === 'PHYSICAL_PASS_USE') staff = await anonymousStaff(rollback);
      }
      const before = await prisma.physicalPass.findMany({ where: { eventId: rollback.eventId } });
      const fail = vi.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
        if (input.action === action) throw new Error('anonymous audit unavailable');
        return original(input, tx);
      });
      try {
        if (action === 'PHYSICAL_PASS_GENERATE')
          await adminGenerate(rollback, 'anonymous-rollback-generate', 1).expect(500);
        if (action === 'PHYSICAL_PASS_REVOKE')
          await revokeAnonymous(rollback, id!, 'anonymous-rollback-revoke').expect(500);
        if (action === 'PHYSICAL_PASS_USE') await scan(staff!, 'anonymous-rollback-use', token!).expect(500);
      } finally {
        fail.mockRestore();
      }
      expect(await prisma.physicalPass.findMany({ where: { eventId: rollback.eventId } })).toEqual(before);
    }
  }, 60_000);

  it('counts nonrevoked anonymous table occupancy, protects used capacity and rejects exact-seat mode', async () => {
    const f = await anonymousFixture(3, true),
      table = await createFloorplanTable(f, 2);
    const batch = await adminGenerate(f, 'anonymous-table-full', 2, table.id).expect(200),
      first = batch.body.passes[0].id as string;
    await adminGenerate(f, 'anonymous-table-over', 1, table.id).expect(409);
    await expect(prisma.floorplanShape.update({ where: { id: table.id }, data: { capacity: 1 } })).rejects.toThrow();
    await revokeAnonymous(f, first, 'anonymous-table-release').expect(200);
    await prisma.floorplanShape.update({ where: { id: table.id }, data: { capacity: 1 } });
    const view = await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${f.clientId}/events/${f.eventId}/floorplan`)
      .set('Cookie', f.providerCookie)
      .expect(200);
    expect(view.body.shapes[0]).toMatchObject({ id: table.id, occupancy: 1, availableCapacity: 0 });
    const floorplan = await prisma.floorplan.findFirstOrThrow({ where: { eventId: f.eventId } });
    await expect(
      prisma.floorplan.update({ where: { id: floorplan.id }, data: { seatingMode: 'SEAT' } })
    ).rejects.toThrow(/PHYSICAL_PASS_TABLE_INVALID/u);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${f.clientId}/events/${f.eventId}/floorplan/seating-mode`)
      .set('Origin', origin)
      .set('Cookie', f.providerCookie)
      .send({ seatingMode: 'SEAT' })
      .expect(409);
    await prisma.floorplanShape.update({ where: { id: table.id }, data: { capacity: 2 } });
    const replacement = await adminGenerate(f, 'anonymous-table-replacement', 1, table.id).expect(200);
    expect(replacement.body.firstPassNumber).toBe(3);
    const staff = await anonymousStaff(f),
      id = replacement.body.passes[0].id as string;
    const material = await prisma.physicalPass.findUniqueOrThrow({ where: { id } });
    const used = await scan(staff, 'anonymous-table-used', tokens.issue(id, material.qrTokenNonce)).expect(200);
    expect(used.body.table).toEqual({ id: table.id, name: 'Mesa 1' });
    await expect(prisma.event.update({ where: { id: f.eventId }, data: { capacity: 1 } })).rejects.toThrow();
    await expect(prisma.floorplanShape.update({ where: { id: table.id }, data: { capacity: 1 } })).rejects.toThrow();
    await expect(prisma.physicalPass.update({ where: { id }, data: { deletedAt: new Date() } })).rejects.toThrow();
    await revokeAnonymous(f, id, 'anonymous-used-table-revoke').expect(409);
  }, 60_000);

  it('rejects invalid anonymous mutations through SQL and keeps legacy revocation forbidden', async () => {
    const f = await anonymousFixture(2),
      other = await anonymousFixture(1);
    const batch = await adminGenerate(f, 'anonymous-sql-batch', 1).expect(200),
      id = batch.body.passes[0].id as string;
    await expect(insertPhysicalPass({ ...f, userId: f.plannerId }, 2)).rejects.toThrow(
      /PHYSICAL_PASS_PROVIDER_REQUIRED/u
    );
    await expect(insertPhysicalPass(f, 3)).rejects.toThrow(/PHYSICAL_PASS_NUMBER_NOT_CONSECUTIVE/u);
    const future = {
      ...f,
      eventId: (
        await prisma.event.create({
          data: {
            clientId: f.clientId,
            createdByUserId: f.userId,
            assignedPlannerUserId: f.plannerId,
            serviceId: f.serviceId,
            accessMode: 'NOMINAL',
            capacity: 2
          }
        })
      ).id
    };
    await expect(insertPhysicalPass(future, 1)).rejects.toThrow(/PHYSICAL_PASS_SERVICE_MISMATCH/u);
    for (const sql of [
      'DELETE FROM physical_pass WHERE id = $1::uuid',
      'UPDATE physical_pass SET deleted_at = NOW() WHERE id = $1::uuid',
      'UPDATE physical_pass SET qr_token_version = 2 WHERE id = $1::uuid',
      'UPDATE physical_pass SET pass_number = 9 WHERE id = $1::uuid'
    ])
      await expect(prisma.$executeRawUnsafe(sql, id)).rejects.toThrow();
    await expect(sqlRevoke(id, f.userId, 'anonymous-sql-provider')).rejects.toThrow(
      /PHYSICAL_PASS_REVOKER_NOT_AUTHORIZED/u
    );
    await expect(sqlRevoke(id, other.plannerId, 'anonymous-sql-foreign')).rejects.toThrow(
      /PHYSICAL_PASS_REVOKER_NOT_AUTHORIZED/u
    );
    await expect(prisma.$executeRawUnsafe('TRUNCATE physical_pass')).rejects.toThrow(
      /PHYSICAL_PASS.*HISTORY_IMMUTABLE/u
    );
    const legacy = await createFixture(EventStatus.CONFIGURED, 2);
    await insertPhysicalPass(legacy, 1);
    const legacyPass = await prisma.physicalPass.findFirstOrThrow({ where: { eventId: legacy.eventId } });
    await expect(sqlRevoke(legacyPass.id, f.plannerId, 'anonymous-sql-legacy')).rejects.toThrow(
      /PHYSICAL_PASS_REVOCATION_NOT_ALLOWED/u
    );
    await revokeAnonymous(
      { ...f, eventId: legacy.eventId },
      legacyPass.id,
      'anonymous-legacy-revoke',
      await login(legacy.email)
    ).expect(403);
    await sqlRevoke(id, f.plannerId, 'anonymous-sql-valid');
    for (const sql of [
      'UPDATE physical_pass SET revoked_at=NULL, revoked_by_user_id=NULL, revocation_reason_code=NULL, revoke_idempotency_key=NULL, revoke_request_signature=NULL, revoke_result_snapshot=NULL WHERE id=$1::uuid',
      "UPDATE physical_pass SET revoke_result_snapshot='{}'::jsonb WHERE id=$1::uuid",
      'DELETE FROM physical_pass WHERE id=$1::uuid'
    ])
      await expect(prisma.$executeRawUnsafe(sql, id)).rejects.toThrow();
    const staff = await anonymousStaff(f),
      storedStaff = await prisma.staffToken.findFirstOrThrow({ where: { eventId: f.eventId } });
    await expect(setUseBySql(id, storedStaff.id, 'anonymous-sql-revoked-use', new Date())).rejects.toThrow();
    const usedBatch = await adminGenerate(f, 'anonymous-sql-next', 1).expect(200),
      usedId = usedBatch.body.passes[0].id as string;
    const usedPass = await prisma.physicalPass.findUniqueOrThrow({ where: { id: usedId } });
    await scan(staff, 'anonymous-sql-used', tokens.issue(usedId, usedPass.qrTokenNonce)).expect(200);
    await expect(sqlRevoke(usedId, f.plannerId, 'anonymous-sql-used-revoke')).rejects.toThrow();
    await expect(prisma.physicalPass.delete({ where: { id: usedId } })).rejects.toThrow();
  }, 60_000);

  it('serializes anonymous table reduction and relocation against the last available table capacity', async () => {
    for (const generateFirst of [true, false]) {
      const f = await anonymousFixture(2, true),
        table = await createFloorplanTable(f, 2);
      const change = () =>
        request(app.getHttpServer())
          .patch(`/api/v1/admin/clients/${f.clientId}/events/${f.eventId}/floorplan/shapes/${table.id}`)
          .set('Origin', origin)
          .set('Cookie', f.providerCookie)
          .send({ capacity: 1 });
      const gen = () => adminGenerate(f, `anonymous-table-race-${generateFirst}`, 2, table.id);
      const result = generateFirst
        ? await startBehindVerifiedEventLock(f.eventId, () => [gen(), change()])
        : await startBehindVerifiedEventLock(f.eventId, () => [change(), gen()]);
      expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
      const stored = await prisma.floorplanShape.findUniqueOrThrow({ where: { id: table.id } });
      expect(
        await prisma.physicalPass.count({ where: { floorplanShapeId: table.id, deletedAt: null, revokedAt: null } })
      ).toBeLessThanOrEqual(stored.capacity);
    }
    const f = await anonymousFixture(2, true),
      source = await createFloorplanTable(f, 1);
    const target = await prisma.floorplanShape.create({
      data: {
        eventId: f.eventId,
        floorplanId: source.floorplanId,
        kind: FloorplanShapeKind.TABLE,
        geometry: FloorplanGeometry.CIRCLE,
        name: 'Target',
        normalizedName: 'target',
        capacity: 1,
        x: 0.5,
        y: 0.5,
        width: 0.2,
        height: 0.2
      }
    });
    const existing = await adminGenerate(f, 'anonymous-move-source', 1, source.id).expect(200);
    const id = existing.body.passes[0].id as string;
    const [generated, moved] = await startBehindVerifiedEventLock(f.eventId, () => [
      adminGenerate(f, 'anonymous-move-target', 1, target.id),
      capture(
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM event WHERE id=${f.eventId}::uuid FOR UPDATE`;
          return tx.physicalPass.update({ where: { id }, data: { floorplanShapeId: target.id } });
        }, CRITICAL_TRANSACTION_OPTIONS)
      )
    ]);
    expect(Number(generated.status === 200) + Number(moved.ok)).toBe(1);
    expect(
      await prisma.physicalPass.count({ where: { floorplanShapeId: target.id, deletedAt: null, revokedAt: null } })
    ).toBe(1);
  }, 60_000);

  it('binds anonymous revocation receipts globally and reauthorizes all retries', async () => {
    const f = await anonymousFixture(2),
      batch = await adminGenerate(f, 'anonymous-double-revoke-material', 2).expect(200);
    const id = batch.body.passes[0].id as string;
    const result = await startBehindVerifiedEventLock(f.eventId, () => [
      revokeAnonymous(f, id, 'anonymous-double-revoke'),
      revokeAnonymous(f, id, 'anonymous-double-revoke')
    ]);
    expect(result.map((r) => r.status)).toEqual([200, 200]);
    expect(result[0].body).toEqual(result[1].body);
    expect(await prisma.auditLog.count({ where: { eventId: f.eventId, action: 'PHYSICAL_PASS_REVOKE' } })).toBe(1);
    const foreign = await anonymousFixture(1),
      otherBatch = await adminGenerate(foreign, 'anonymous-other-revoke-material', 1).expect(200);
    await revokeAnonymous(foreign, otherBatch.body.passes[0].id as string, 'anonymous-double-revoke').expect(409);
    await revokeAnonymous(f, otherBatch.body.passes[0].id as string, 'anonymous-cross-pass').expect(404);
    await revokeAnonymous(f, id, 'anonymous-provider-revoke', f.providerCookie).expect(403);
    const legacyService = await prisma.service.upsert({
      where: { code: ServiceCode.PHYSICAL_QR },
      create: { code: ServiceCode.PHYSICAL_QR },
      update: {}
    });
    const legacy = await prisma.event.create({
      data: {
        clientId: f.clientId,
        createdByUserId: f.userId,
        assignedPlannerUserId: f.plannerId,
        serviceId: legacyService.id,
        capacity: 2
      }
    });
    await insertPhysicalPass({ ...f, eventId: legacy.id }, 1);
    const legacyPass = await prisma.physicalPass.findFirstOrThrow({ where: { eventId: legacy.id } });
    await revokeAnonymous({ ...f, eventId: legacy.id }, legacyPass.id, 'anonymous-org-legacy-revoke').expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${f.eventId}/physical-passes/${id}/revoke`)
      .set('Origin', origin)
      .set('Cookie', f.cookie)
      .send({ revocationReasonCode: 'OPERATOR_REQUEST' })
      .expect(400);
    await prisma.client.update({
      where: { id: f.clientId },
      data: { status: ClientStatus.SUSPENDED, suspendedAt: new Date(), suspensionReason: 'Test' }
    });
    await adminGenerate(f, 'anonymous-double-revoke-material', 2).expect(409);
  }, 60_000);

  it('rejects TRUNCATE even when its transaction predates the anonymous history', async () => {
    const observer = new PgClient({ connectionString: process.env.DATABASE_URL! });
    await observer.connect();
    try {
      await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      expect((await observer.query('SELECT count(*)::int AS total FROM physical_pass')).rows).toEqual([{ total: 0 }]);
      const f = await anonymousFixture(1);
      await adminGenerate(f, 'anonymous-truncate-stale-snapshot', 1).expect(200);
      await expect(observer.query('TRUNCATE physical_pass')).rejects.toThrow(/PHYSICAL_PASS.*HISTORY_IMMUTABLE/u);
    } finally {
      // The probe never commits, including when testing an insufficient guard.
      await observer.query('ROLLBACK');
      await observer.end();
    }
    expect(await prisma.physicalPass.count()).toBe(1);
  });

  it('generates consecutive batches, replays exactly, lists safely and renders a private deterministic SVG', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 5);
    const cookie = await login(fixture.email);
    const first = await generate(fixture.eventId, cookie, 'physical-generate-001', 2).expect(200);
    expect(first.body).toMatchObject({
      eventId: fixture.eventId,
      quantity: 2,
      firstPassNumber: 1,
      lastPassNumber: 2,
      table: null
    });
    expect(first.body.passes.map((pass: { passNumber: number }) => pass.passNumber)).toEqual([1, 2]);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).status).toBe(
      EventStatus.READY_TO_ACTIVATE
    );

    const replay = await generate(fixture.eventId, cookie, 'physical-generate-001', 2).expect(200);
    expect(replay.body).toEqual(first.body);
    expect(await prisma.physicalPass.count({ where: { eventId: fixture.eventId } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'PHYSICAL_PASS_GENERATE' } })).toBe(
      1
    );
    await generate(fixture.eventId, cookie, 'physical-generate-001', 1).expect(409);

    const second = await generate(fixture.eventId, cookie, 'physical-generate-002', 2).expect(200);
    expect(second.body).toMatchObject({ firstPassNumber: 3, lastPassNumber: 4 });
    await generate(fixture.eventId, cookie, 'physical-generate-003', 2)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PHYSICAL_PASS_CAPACITY_EXCEEDED'));

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/physical-passes`)
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body.map((pass: { passNumber: number }) => pass.passNumber)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(listed.body)).not.toMatch(/nonce|qrToken|idempotency|signature|snapshot|staff/iu);

    const passId = first.body.passes[0].id as string;
    const svg = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/physical-passes/${passId}/svg`)
      .set('Cookie', cookie)
      .expect(200);
    expect(svg.headers['content-type']).toContain('image/svg+xml');
    expect(svg.headers['cache-control']).toBe('private, no-store');
    expect(svg.headers['x-content-type-options']).toBe('nosniff');
    expect(svg.headers['referrer-policy']).toBe('no-referrer');
    expect(svg.headers['content-security-policy']).toBe("default-src 'none'");
    expect(svg.headers.etag).toMatch(/^"sha256-[0-9a-f]{64}"$/u);
    const svgText = (svg.body as Buffer).toString('utf8');
    expect(svgText).toContain('Evento pases');
    expect(svgText).toContain('Pase 1');
    expect(await prisma.fileAsset.count()).toBe(0);
  }, 60_000);

  it('blocks Managed generation from the current DB profile while leaving reads and Self-Service intact', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 2);
    const cookie = await login(fixture.email);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } });
    await prisma.client.update({
      where: { id: event.clientId },
      data: { operatingProfile: ClientOperatingProfile.MANAGED }
    });

    await generate(fixture.eventId, cookie, 'managed-physical-forbidden', 1)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('CLIENT_MANAGED_CAPABILITY_FORBIDDEN'));
    expect(await prisma.physicalPass.count({ where: { eventId: fixture.eventId } })).toBe(0);
    expect(await prisma.physicalPassGenerationOperation.count({ where: { eventId: fixture.eventId } })).toBe(0);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/physical-passes`)
      .set('Cookie', cookie)
      .expect(200, []);

    await prisma.client.update({
      where: { id: event.clientId },
      data: { operatingProfile: ClientOperatingProfile.SELF_SERVICE }
    });
    await generate(fixture.eventId, cookie, 'self-service-physical-allowed', 1).expect(200);
  }, 60_000);

  it('serializes concurrent generation into unique non-overlapping ranges', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 10);
    const cookie = await login(fixture.email);
    const [left, right] = await startBehindVerifiedEventLock(fixture.eventId, () => [
      generate(fixture.eventId, cookie, 'physical-concurrent-a', 3),
      generate(fixture.eventId, cookie, 'physical-concurrent-b', 3)
    ]);
    expect([left.status, right.status]).toEqual([200, 200]);
    const ranges = [left.body, right.body]
      .map(
        ({ firstPassNumber, lastPassNumber }) =>
          [firstPassNumber as number, lastPassNumber as number] as [number, number]
      )
      .sort((a, b) => a[0] - b[0]);
    expect(ranges).toEqual([
      [1, 3],
      [4, 6]
    ]);
    expect(
      (await prisma.physicalPass.findMany({ where: { eventId: fixture.eventId }, orderBy: { passNumber: 'asc' } })).map(
        ({ passNumber }) => passNumber
      )
    ).toEqual([1, 2, 3, 4, 5, 6]);
  }, 60_000);

  it('serializes two batches over the final Event capacity without partial ranges', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 1);
    const cookie = await login(fixture.email);
    const results = await startBehindVerifiedEventLock(fixture.eventId, () => [
      generate(fixture.eventId, cookie, 'physical-last-event-capacity-a', 1),
      generate(fixture.eventId, cookie, 'physical-last-event-capacity-b', 1)
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.physicalPass.count({ where: { eventId: fixture.eventId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'PHYSICAL_PASS_GENERATE' } })).toBe(
      1
    );
  }, 60_000);

  it('serializes two batches over the final table capacity without partial ranges', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 2, true);
    const table = await createFloorplanTable(fixture, 1);
    const cookie = await login(fixture.email);
    const results = await startBehindVerifiedEventLock(fixture.eventId, () => [
      generate(fixture.eventId, cookie, 'physical-last-table-capacity-a', 1, table.id),
      generate(fixture.eventId, cookie, 'physical-last-table-capacity-b', 1, table.id)
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.physicalPass.count({ where: { eventId: fixture.eventId, floorplanShapeId: table.id } })).toBe(
      1
    );
  }, 60_000);

  it('serializes generation against table reduction and deletion in both winning orders', async () => {
    const generationWins = await createFixture(EventStatus.CONFIGURED, 2, true);
    const generationWinsTable = await createFloorplanTable(generationWins, 2);
    const generationWinsCookie = await login(generationWins.email);
    const generationBarrier = auditBarrier('PHYSICAL_PASS_GENERATE');
    const generatedPromise = Promise.resolve(
      generate(
        generationWins.eventId,
        generationWinsCookie,
        'physical-table-reduction-generation-wins',
        2,
        generationWinsTable.id
      )
    );
    await generationBarrier.entered.promise;
    const rejectedReductionPromise = capture(
      prisma.floorplanShape.update({ where: { id: generationWinsTable.id }, data: { capacity: 1 } })
    );
    await waitForVerifiedLockWaiters(1);
    generationBarrier.release.resolve();
    const [generated, rejectedReduction] = await Promise.all([generatedPromise, rejectedReductionPromise]);
    generationBarrier.restore();
    expect(generated.status).toBe(200);
    expect(rejectedReduction.ok).toBe(false);
    expect((await prisma.floorplanShape.findUniqueOrThrow({ where: { id: generationWinsTable.id } })).capacity).toBe(2);

    const reductionWins = await createFixture(EventStatus.CONFIGURED, 2, true);
    const reductionWinsTable = await createFloorplanTable(reductionWins, 2);
    const reductionWinsCookie = await login(reductionWins.email);
    const [reduced, rejectedGeneration] = await startBehindVerifiedRowLock(
      'floorplan_shape',
      reductionWinsTable.id,
      () => [
        capture(prisma.floorplanShape.update({ where: { id: reductionWinsTable.id }, data: { capacity: 1 } })),
        generate(
          reductionWins.eventId,
          reductionWinsCookie,
          'physical-table-reduction-mutation-wins',
          2,
          reductionWinsTable.id
        )
      ]
    );
    expect(reduced.ok).toBe(true);
    expect(rejectedGeneration.status).toBe(409);
    expect(await prisma.physicalPass.count({ where: { eventId: reductionWins.eventId } })).toBe(0);

    const generationBeforeDelete = await createFixture(EventStatus.CONFIGURED, 1, true);
    const generationBeforeDeleteTable = await createFloorplanTable(generationBeforeDelete, 1);
    const generationBeforeDeleteCookie = await login(generationBeforeDelete.email);
    const deleteGenerationBarrier = auditBarrier('PHYSICAL_PASS_GENERATE');
    const generatedBeforeDeletePromise = Promise.resolve(
      generate(
        generationBeforeDelete.eventId,
        generationBeforeDeleteCookie,
        'physical-table-delete-generation-wins',
        1,
        generationBeforeDeleteTable.id
      )
    );
    await deleteGenerationBarrier.entered.promise;
    const rejectedDeletePromise = capture(
      prisma.floorplanShape.update({
        where: { id: generationBeforeDeleteTable.id },
        data: { deletedAt: new Date() }
      })
    );
    await waitForVerifiedLockWaiters(1);
    deleteGenerationBarrier.release.resolve();
    const [generatedBeforeDelete, rejectedDelete] = await Promise.all([
      generatedBeforeDeletePromise,
      rejectedDeletePromise
    ]);
    deleteGenerationBarrier.restore();
    expect(generatedBeforeDelete.status).toBe(200);
    expect(rejectedDelete.ok).toBe(false);

    const deleteWins = await createFixture(EventStatus.CONFIGURED, 1, true);
    const deleteWinsTable = await createFloorplanTable(deleteWins, 1);
    const deleteWinsCookie = await login(deleteWins.email);
    const [deleted, rejectedAfterDelete] = await startBehindVerifiedRowLock(
      'floorplan_shape',
      deleteWinsTable.id,
      () => [
        capture(prisma.floorplanShape.update({ where: { id: deleteWinsTable.id }, data: { deletedAt: new Date() } })),
        generate(deleteWins.eventId, deleteWinsCookie, 'physical-table-delete-mutation-wins', 1, deleteWinsTable.id)
      ]
    );
    expect(deleted.ok).toBe(true);
    expect(rejectedAfterDelete.status).toBe(409);
    expect(await prisma.physicalPass.count({ where: { eventId: deleteWins.eventId } })).toBe(0);
  }, 60_000);

  it('replays the same concurrent generation key exactly once behind a verified lock barrier', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 2);
    const cookie = await login(fixture.email);
    const [left, right] = await startBehindVerifiedEventLock(fixture.eventId, () => [
      generate(fixture.eventId, cookie, 'physical-same-generation-key', 1),
      generate(fixture.eventId, cookie, 'physical-same-generation-key', 1)
    ]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    expect(left.body).toEqual(right.body);
    expect(await prisma.physicalPass.count({ where: { eventId: fixture.eventId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'PHYSICAL_PASS_GENERATE' } })).toBe(
      1
    );
  }, 60_000);

  it('serializes generation against activation in both winning orders', async () => {
    const generationWins = await createFixture(EventStatus.CONFIGURED, 1);
    await ensureFreeActivationPrice(generationWins.eventId);
    const generationWinsCookie = await login(generationWins.email);
    const [generated, activatedAfterGeneration] = await startBehindVerifiedEventLock(generationWins.eventId, () => [
      generate(generationWins.eventId, generationWinsCookie, 'physical-race-generation-before-activation', 1),
      activate(generationWins.eventId, generationWinsCookie, 'physical-race-activation-after-generation')
    ]);
    expect(generated.status).toBe(200);
    expect(activatedAfterGeneration.status).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: generationWins.eventId } })).status).toBe(
      EventStatus.ACTIVE
    );

    const activationWinsLock = await createFixture(EventStatus.CONFIGURED, 1);
    await ensureFreeActivationPrice(activationWinsLock.eventId);
    const activationWinsLockCookie = await login(activationWinsLock.email);
    const [rejectedActivation, generatedAfterPreflight] = await startBehindVerifiedEventLock(
      activationWinsLock.eventId,
      () => [
        activate(activationWinsLock.eventId, activationWinsLockCookie, 'physical-race-activation-before-generation'),
        generate(
          activationWinsLock.eventId,
          activationWinsLockCookie,
          'physical-race-generation-after-activation-preflight',
          1
        )
      ]
    );
    expect(rejectedActivation.status).toBe(409);
    expect(generatedAfterPreflight.status).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: activationWinsLock.eventId } })).status).toBe(
      EventStatus.READY_TO_ACTIVATE
    );
  }, 60_000);

  it('records only one first use, replays exactly, blocks second use and protects the confirmed row in PostgreSQL', async () => {
    const fixture = await createFixture(EventStatus.ACTIVE, 4);
    const cookie = await login(fixture.email);
    const generated = await generate(fixture.eventId, cookie, 'physical-use-generation', 2).expect(200);
    const createdStaff = await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/staff-tokens`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ alias: 'Puerta física' })
      .expect(201);
    const staffToken = createdStaff.body.token as string;
    const pass = await prisma.physicalPass.findUniqueOrThrow({ where: { id: generated.body.passes[0].id as string } });
    const qrToken = tokens.issue(pass.id, pass.qrTokenNonce, pass.qrTokenVersion);

    const first = await scan(staffToken, 'physical-use-001', qrToken).expect(200);
    expect(first.body).toMatchObject({
      status: 'USED',
      physicalPassId: pass.id,
      passNumber: 1,
      table: null
    });
    const replay = await scan(staffToken, 'physical-use-001', qrToken).expect(200);
    expect(replay.body).toEqual(first.body);
    await scan(staffToken, 'physical-use-002', qrToken)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PHYSICAL_PASS_ALREADY_USED'));
    expect(await prisma.auditLog.count({ where: { resourceId: pass.id, action: 'PHYSICAL_PASS_USE' } })).toBe(1);

    const secondPass = await prisma.physicalPass.findUniqueOrThrow({
      where: { id: generated.body.passes[1].id as string }
    });
    await scan(staffToken, 'physical-use-001', tokens.issue(secondPass.id, secondPass.qrTokenNonce)).expect(409);
    await scan(staffToken, 'physical-invalid-001', `${qrToken.slice(0, -1)}x`).expect(404);

    await expect(prisma.physicalPass.update({ where: { id: pass.id }, data: { passNumber: 99 } })).rejects.toThrow();
    await expect(prisma.physicalPass.delete({ where: { id: pass.id } })).rejects.toThrow();
    const stored = await prisma.physicalPass.findUniqueOrThrow({ where: { id: pass.id } });
    expect(stored.usedAt?.toISOString()).toBe(first.body.usedAt);
    expect(stored.useResultSnapshot).toEqual(first.body);
    const staff = await prisma.staffToken.findFirstOrThrow({ where: { eventId: fixture.eventId } });
    await expect(
      prisma.$executeRaw`
        INSERT INTO "physical_pass" (
          "id", "event_id", "pass_number", "qr_token_nonce", "qr_token_version",
          "used_at", "used_by_staff_token_id", "use_idempotency_key",
          "use_request_signature", "use_result_snapshot", "created_by_user_id", "updated_at"
        )
        VALUES (
          gen_random_uuid(), ${fixture.eventId}::uuid, 99, ${'c'.repeat(64)}, 1,
          clock_timestamp(), ${staff.id}::uuid, 'physical-direct-used',
          ${'d'.repeat(64)}, '{}'::jsonb, ${fixture.userId}::uuid, clock_timestamp()
        )
      `
    ).rejects.toThrow('PHYSICAL_PASS_USED_IMMUTABLE');
  }, 60_000);

  it('allows exact replay after close and serializes two StaffTokens against the same unused pass', async () => {
    const fixture = await createFixture(EventStatus.ACTIVE, 4);
    const cookie = await login(fixture.email);
    const generated = await generate(fixture.eventId, cookie, 'physical-race-generation', 2).expect(200);
    const leftStaff = await createStaff(fixture.eventId, cookie, 'Puerta izquierda');
    const rightStaff = await createStaff(fixture.eventId, cookie, 'Puerta derecha');
    const firstPass = await prisma.physicalPass.findUniqueOrThrow({
      where: { id: generated.body.passes[0].id as string }
    });
    const qrToken = tokens.issue(firstPass.id, firstPass.qrTokenNonce);
    const [left, right] = await startBehindVerifiedEventLock(fixture.eventId, () => [
      scan(leftStaff, 'physical-race-left', qrToken),
      scan(rightStaff, 'physical-race-right', qrToken)
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 409]);
    expect(await prisma.auditLog.count({ where: { resourceId: firstPass.id, action: 'PHYSICAL_PASS_USE' } })).toBe(1);

    const winner =
      left.status === 200
        ? { response: left, token: leftStaff, key: 'physical-race-left' }
        : {
            response: right,
            token: rightStaff,
            key: 'physical-race-right'
          };
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.event.update({ where: { id: fixture.eventId }, data: { status: EventStatus.CLOSED } });
      await tx.staffToken.updateMany({ where: { eventId: fixture.eventId }, data: { expiredAt: now } });
    });
    const replay = await scan(winner.token, winner.key, qrToken).expect(200);
    expect(replay.body).toEqual(winner.response.body);

    const secondPass = await prisma.physicalPass.findUniqueOrThrow({
      where: { id: generated.body.passes[1].id as string }
    });
    await scan(winner.token, 'physical-after-close', tokens.issue(secondPass.id, secondPass.qrTokenNonce))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('STAFF_EVENT_NOT_OPERATIONAL'));
  }, 60_000);

  it('replays the same concurrent use key exactly once behind a verified lock barrier', async () => {
    const fixture = await createFixture(EventStatus.ACTIVE, 1);
    const cookie = await login(fixture.email);
    const generated = await generate(fixture.eventId, cookie, 'physical-same-use-generation', 1).expect(200);
    const staffToken = await createStaff(fixture.eventId, cookie, 'Misma puerta');
    const pass = await prisma.physicalPass.findUniqueOrThrow({
      where: { id: generated.body.passes[0].id as string }
    });
    const qrToken = tokens.issue(pass.id, pass.qrTokenNonce);
    const [left, right] = await startBehindVerifiedEventLock(fixture.eventId, () => [
      scan(staffToken, 'physical-same-use-key', qrToken),
      scan(staffToken, 'physical-same-use-key', qrToken)
    ]);
    expect(left.status).toBe(200);
    expect(right.status).toBe(200);
    expect(left.body).toEqual(right.body);
    expect(await prisma.auditLog.count({ where: { resourceId: pass.id, action: 'PHYSICAL_PASS_USE' } })).toBe(1);
  }, 60_000);

  it.each(['close', 'cancel'] as const)(
    'serializes use against %s in both winning orders',
    async (action) => {
      const useWins = await createUseRaceFixture(`${action}-use-wins`);
      const [used, transitionedAfterUse] = await startBehindVerifiedEventLock(useWins.eventId, () => [
        scan(useWins.staffToken, `physical-race-${action}-use-wins`, useWins.qrToken),
        transition(useWins.eventId, useWins.cookie, action, `physical-race-${action}-after-use`)
      ]);
      expect(used.status).toBe(200);
      expect(transitionedAfterUse.status).toBe(200);
      expect((await prisma.physicalPass.findUniqueOrThrow({ where: { id: useWins.pass.id } })).usedAt).not.toBeNull();
      expect((await prisma.event.findUniqueOrThrow({ where: { id: useWins.eventId } })).status).toBe(
        action === 'close' ? EventStatus.CLOSED : EventStatus.CANCELLED
      );

      const lifecycleWins = await createUseRaceFixture(`${action}-lifecycle-wins`);
      const [transitionedBeforeUse, rejectedUse] = await startBehindVerifiedEventLock(lifecycleWins.eventId, () => [
        transition(lifecycleWins.eventId, lifecycleWins.cookie, action, `physical-race-${action}-before-use`),
        scan(lifecycleWins.staffToken, `physical-race-${action}-rejected`, lifecycleWins.qrToken)
      ]);
      expect(transitionedBeforeUse.status).toBe(200);
      expect(rejectedUse.status).toBe(409);
      expect((await prisma.physicalPass.findUniqueOrThrow({ where: { id: lifecycleWins.pass.id } })).usedAt).toBeNull();
      expect(
        await prisma.auditLog.count({ where: { resourceId: lifecycleWins.pass.id, action: 'PHYSICAL_PASS_USE' } })
      ).toBe(0);
    },
    60_000
  );

  it('serializes first use against StaffToken expiration and pass soft delete in both winning orders', async () => {
    const useBeforeExpiration = await createUseRaceFixture('use-before-expiration');
    const useBarrier = auditBarrier('PHYSICAL_PASS_USE');
    const usedBeforeExpirationPromise = Promise.resolve(
      scan(useBeforeExpiration.staffToken, 'physical-race-use-before-expiration', useBeforeExpiration.qrToken)
    );
    await useBarrier.entered.promise;
    const expiredAfterUsePromise = capture(
      prisma.staffToken.update({
        where: { id: useBeforeExpiration.staff.id },
        data: { expiredAt: new Date() }
      })
    );
    await waitForVerifiedLockWaiters(1);
    useBarrier.release.resolve();
    const [usedBeforeExpiration, expiredAfterUse] = await Promise.all([
      usedBeforeExpirationPromise,
      expiredAfterUsePromise
    ]);
    useBarrier.restore();
    expect(usedBeforeExpiration.status).toBe(200);
    expect(expiredAfterUse.ok).toBe(true);

    const expirationBeforeUse = await createUseRaceFixture('expiration-before-use');
    const [expiredBeforeUse, rejectedExpiredUse] = await startBehindVerifiedRowLock(
      'staff_token',
      expirationBeforeUse.staff.id,
      () => [
        capture(
          prisma.staffToken.update({
            where: { id: expirationBeforeUse.staff.id },
            data: { expiredAt: new Date() }
          })
        ),
        scan(expirationBeforeUse.staffToken, 'physical-race-expired-before-use', expirationBeforeUse.qrToken)
      ]
    );
    expect(expiredBeforeUse.ok).toBe(true);
    expect(rejectedExpiredUse.status).toBe(401);
    expect(
      (await prisma.physicalPass.findUniqueOrThrow({ where: { id: expirationBeforeUse.pass.id } })).usedAt
    ).toBeNull();

    const useBeforeDelete = await createUseRaceFixture('use-before-delete');
    const deleteUseBarrier = auditBarrier('PHYSICAL_PASS_USE');
    const usedBeforeDeletePromise = Promise.resolve(
      scan(useBeforeDelete.staffToken, 'physical-race-use-before-delete', useBeforeDelete.qrToken)
    );
    await deleteUseBarrier.entered.promise;
    const rejectedDeletePromise = capture(
      prisma.physicalPass.update({
        where: { id: useBeforeDelete.pass.id },
        data: { deletedAt: new Date() }
      })
    );
    await waitForVerifiedLockWaiters(1);
    deleteUseBarrier.release.resolve();
    const [usedBeforeDelete, rejectedDelete] = await Promise.all([usedBeforeDeletePromise, rejectedDeletePromise]);
    deleteUseBarrier.restore();
    expect(usedBeforeDelete.status).toBe(200);
    expect(rejectedDelete.ok).toBe(false);

    const deleteBeforeUse = await createUseRaceFixture('delete-before-use');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    const deleter = new PgClient({ connectionString: databaseUrl });
    await deleter.connect();
    let deleteCommitted = false;
    let rejectedDeletedUse: Awaited<ReturnType<typeof scan>> | undefined;
    try {
      await deleter.query('BEGIN');
      await deleter.query(
        'UPDATE "physical_pass" SET "deleted_at" = clock_timestamp(), "updated_at" = clock_timestamp() WHERE "id" = $1::uuid',
        [deleteBeforeUse.pass.id]
      );
      const rejectedDeletedUsePromise = Promise.resolve(
        scan(deleteBeforeUse.staffToken, 'physical-race-delete-before-use', deleteBeforeUse.qrToken)
      );
      await waitForVerifiedLockWaiters(1);
      await deleter.query('COMMIT');
      deleteCommitted = true;
      rejectedDeletedUse = await rejectedDeletedUsePromise;
    } finally {
      if (!deleteCommitted) await deleter.query('ROLLBACK').catch(() => undefined);
      await deleter.end();
    }
    if (!rejectedDeletedUse) throw new Error('The concurrent scan did not complete.');
    expect(rejectedDeletedUse.status).toBe(404);
    expect(
      await prisma.auditLog.count({ where: { resourceId: deleteBeforeUse.pass.id, action: 'PHYSICAL_PASS_USE' } })
    ).toBe(0);
  }, 60_000);

  it('serializes first use against table modification and deletion without invalidating the used pass', async () => {
    const useBeforeTableMutation = await createUseRaceFixture('use-before-table-mutation', true);
    const [used, tableReduced] = await startBehindVerifiedRowLock(
      'floorplan_shape',
      useBeforeTableMutation.table!.id,
      () => [
        scan(
          useBeforeTableMutation.staffToken,
          'physical-race-use-before-table-mutation',
          useBeforeTableMutation.qrToken
        ),
        capture(
          prisma.floorplanShape.update({
            where: { id: useBeforeTableMutation.table!.id },
            data: { capacity: 1 }
          })
        )
      ]
    );
    expect(used.status).toBe(200);
    expect(tableReduced.ok).toBe(true);

    const deleteBeforeUse = await createUseRaceFixture('table-delete-before-use', true);
    const [rejectedTableDelete, usedAfterRejectedDelete] = await startBehindVerifiedRowLock(
      'floorplan_shape',
      deleteBeforeUse.table!.id,
      () => [
        capture(
          prisma.floorplanShape.update({
            where: { id: deleteBeforeUse.table!.id },
            data: { deletedAt: new Date() }
          })
        ),
        scan(deleteBeforeUse.staffToken, 'physical-race-use-after-rejected-table-delete', deleteBeforeUse.qrToken)
      ]
    );
    expect(rejectedTableDelete.ok).toBe(false);
    expect(usedAfterRejectedDelete.status).toBe(200);
    expect(
      (await prisma.physicalPass.findUniqueOrThrow({ where: { id: deleteBeforeUse.pass.id } })).usedAt
    ).not.toBeNull();
  }, 60_000);

  it('counts PhysicalPass and Assistant occupancy together and rejects table reduction/deletion', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 4, true);
    const table = await createFloorplanTable(fixture, 1);
    const cookie = await login(fixture.email);
    await generate(fixture.eventId, cookie, 'physical-table-generation', 1, table.id).expect(200);
    const floorplan = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/floorplan`)
      .set('Cookie', cookie)
      .expect(200);
    expect(floorplan.body.shapes[0]).toMatchObject({ id: table.id, occupancy: 1, availableCapacity: 0 });
    await expect(prisma.floorplanShape.update({ where: { id: table.id }, data: { capacity: 0 } })).rejects.toThrow();
    await expect(
      prisma.floorplanShape.update({ where: { id: table.id }, data: { deletedAt: new Date() } })
    ).rejects.toThrow();

    const contact = await prisma.contact.create({
      data: { eventId: fixture.eventId, name: 'Persona', whatsappPhoneNormalized: '+5215555555555' }
    });
    await expect(
      prisma.$transaction(async (tx) => {
        const invitation = await tx.invitation.create({
          data: {
            eventId: fixture.eventId,
            contactId: contact.id,
            responseStatus: InvitationResponseStatus.CONFIRMED,
            invitationTokenNonce: 'a'.repeat(64),
            qrTokenNonce: 'b'.repeat(64)
          }
        });
        await tx.assistant.create({
          data: {
            eventId: fixture.eventId,
            invitationId: invitation.id,
            floorplanShapeId: table.id,
            name: 'Persona',
            isPrimary: true,
            responseStatus: AssistantResponseStatus.CONFIRMED
          }
        });
      })
    ).rejects.toThrow();
  }, 60_000);

  it('enforces service, ownership and Platform Admin boundaries', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 2);
    const foreign = await createFixture(EventStatus.CONFIGURED, 2);
    const cookie = await login(fixture.email);
    await generate(foreign.eventId, cookie, 'physical-foreign-001', 1).expect(404);

    const wrongService = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    await prisma.event.update({ where: { id: fixture.eventId }, data: { serviceId: wrongService.id } });
    await generate(fixture.eventId, cookie, 'physical-service-001', 1)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PHYSICAL_PASS_SERVICE_MISMATCH'));

    const foreignOwned = await generate(
      foreign.eventId,
      await login(foreign.email),
      'physical-platform-fixture',
      1
    ).expect(200);
    const platform = await createUser(UserRole.PLATFORM_ADMIN, null);
    const platformCookie = await login(platform.email);
    await generate(foreign.eventId, platformCookie, 'physical-platform-001', 1).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${foreign.eventId}/physical-passes`)
      .set('Cookie', platformCookie)
      .expect(403);
    await getSvg(foreign.eventId, foreignOwned.body.passes[0].id, platformCookie).expect(403);

    await resetDatabase();
    const organization = await prisma.client.create({
      data: {
        type: ClientType.ORGANIZATION,
        operatingProfile: 'SELF_SERVICE',
        name: 'Organización pases',
        status: ClientStatus.ACTIVE
      }
    });
    const admin = await createUser(UserRole.ORGANIZATION_ADMIN, organization.id);
    const plannerOne = await createUser(UserRole.ORGANIZATION_PLANNER, organization.id);
    const plannerTwo = await createUser(UserRole.ORGANIZATION_PLANNER, organization.id);
    const physical = await prisma.service.create({ data: { code: ServiceCode.PHYSICAL_QR } });
    const ownedEvent = await prisma.event.create({
      data: {
        clientId: organization.id,
        createdByUserId: plannerOne.id,
        assignedPlannerUserId: plannerOne.id,
        serviceId: physical.id,
        name: 'Evento organización',
        socialType: EventSocialType.OTHER,
        status: EventStatus.CONFIGURED,
        eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
        timeZone: 'America/Mexico_City',
        capacity: 3
      }
    });
    const plannerOneCookie = await login(plannerOne.email);
    const plannerTwoCookie = await login(plannerTwo.email);
    const adminCookie = await login(admin.email);
    const owned = await generate(ownedEvent.id, plannerOneCookie, 'physical-org-owner', 1).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${ownedEvent.id}/physical-passes`)
      .set('Cookie', plannerOneCookie)
      .expect(200);
    await getSvg(ownedEvent.id, owned.body.passes[0].id, plannerOneCookie).expect(200);
    await generate(ownedEvent.id, plannerTwoCookie, 'physical-org-foreign', 1).expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${ownedEvent.id}/physical-passes`)
      .set('Cookie', plannerTwoCookie)
      .expect(404);
    await getSvg(ownedEvent.id, owned.body.passes[0].id, plannerTwoCookie).expect(404);
    await generate(ownedEvent.id, adminCookie, 'physical-org-admin', 1).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${ownedEvent.id}/physical-passes`)
      .set('Cookie', adminCookie)
      .expect(200);
    await getSvg(ownedEvent.id, owned.body.passes[0].id, adminCookie).expect(200);
  }, 60_000);

  it('runs the real HTTP lifecycle without a Floorplan and repairs readiness from Event updates and generation replay', async () => {
    const owner = await createClientOwner(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const service = await createPhysicalServiceWithPrice(ClientType.PLANNER);
    const cookie = await login(owner.email);
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ serviceId: service.id, capacity: 2 })
      .expect(201);
    await ensureFreeActivationPrice(created.body.id as string);
    expect(created.body.status).toBe(EventStatus.DRAFT);

    const generated = await generate(created.body.id, cookie, 'physical-e2e-without-floorplan', 2).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe(EventStatus.DRAFT);
    const ready = await updateEvent(created.body.id, cookie, {
      name: 'Acceso físico sin Croquis',
      socialType: EventSocialType.OTHER,
      eventDateTime: '2030-01-01T18:00:00.000Z',
      timeZone: 'America/Mexico_City'
    }).expect(200);
    expect(ready.body.status).toBe(EventStatus.READY_TO_ACTIVATE);
    await updateEvent(created.body.id, cookie, { name: 'Acceso físico actualizado' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe(EventStatus.READY_TO_ACTIVATE));

    await prisma.event.update({ where: { id: created.body.id }, data: { status: EventStatus.CONFIGURED } });
    const replay = await generate(created.body.id, cookie, 'physical-e2e-without-floorplan', 2).expect(200);
    expect(replay.body).toEqual(generated.body);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe(
      EventStatus.READY_TO_ACTIVATE
    );
    expect(await prisma.auditLog.count({ where: { eventId: created.body.id, action: 'PHYSICAL_PASS_GENERATE' } })).toBe(
      1
    );

    await activate(created.body.id, cookie, 'physical-e2e-activate-without-floorplan').expect(200);
    const svg = await getSvg(created.body.id, generated.body.passes[0].id, cookie).expect(200);
    const decodedToken = await decodeSvgQr(svg.body as Buffer);
    const staffToken = await createStaff(created.body.id, cookie, 'Acceso sin Croquis');
    await scan(staffToken, 'physical-e2e-use-without-floorplan', decodedToken)
      .expect(200)
      .expect(({ body }) => expect(body.table).toBeNull());
    expect(await prisma.contact.count({ where: { eventId: created.body.id } })).toBe(0);
    expect(await prisma.invitation.count({ where: { eventId: created.body.id } })).toBe(0);
    expect(await prisma.assistant.count({ where: { eventId: created.body.id } })).toBe(0);
    expect(await prisma.invitationDesign.count({ where: { eventId: created.body.id } })).toBe(0);
    expect(await prisma.hotspot.count({ where: { eventId: created.body.id } })).toBe(0);
  }, 60_000);

  it('runs the real HTTP lifecycle with upload, Floorplan, table, decoded QR, use, replay and close', async () => {
    const owner = await createClientOwner(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const service = await createPhysicalServiceWithPrice(ClientType.PLANNER);
    const cookie = await login(owner.email);
    const providerCookie = await login((await createUser(UserRole.PLATFORM_ADMIN, null)).email);
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({
        name: 'Acceso físico con Croquis',
        serviceId: service.id,
        socialType: EventSocialType.WEDDING,
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City',
        capacity: 2,
        floorplanEnabled: true
      })
      .expect(201);
    await ensureFreeActivationPrice(created.body.id as string);
    const image = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#334155' }
    })
      .png()
      .toBuffer();
    const providerBase = `/api/v1/admin/clients/${owner.clientId}/events/${created.body.id}`;
    const asset = await request(app.getHttpServer())
      .post(`${providerBase}/floorplan/file-assets`)
      .set('Cookie', providerCookie)
      .set('Origin', origin)
      .attach('file', image, { filename: 'croquis.png', contentType: 'image/png' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${providerBase}/floorplan`)
      .set('Cookie', providerCookie)
      .set('Origin', origin)
      .send({ imageAssetId: asset.body.id })
      .expect(201);
    const table = await request(app.getHttpServer())
      .post(`${providerBase}/floorplan/shapes`)
      .set('Cookie', providerCookie)
      .set('Origin', origin)
      .send({
        kind: FloorplanShapeKind.TABLE,
        geometry: FloorplanGeometry.CIRCLE,
        name: 'Mesa E2E',
        capacity: 2,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        rotation: 0,
        polygonPoints: null
      })
      .expect(201);
    const generated = await generate(created.body.id, cookie, 'physical-e2e-with-floorplan', 2, table.body.id).expect(
      200
    );
    expect((await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe(
      EventStatus.READY_TO_ACTIVATE
    );
    await activate(created.body.id, cookie, 'physical-e2e-activate-with-floorplan').expect(200);
    const staffToken = await createStaff(created.body.id, cookie, 'Acceso Croquis');
    const firstSvg = await getSvg(created.body.id, generated.body.passes[0].id, cookie).expect(200);
    const firstToken = await decodeSvgQr(firstSvg.body as Buffer);
    const used = await scan(staffToken, 'physical-e2e-use-with-floorplan', firstToken).expect(200);
    expect(used.body.table).toEqual({ id: table.body.id, name: 'Mesa E2E' });
    expect((await scan(staffToken, 'physical-e2e-use-with-floorplan', firstToken).expect(200)).body).toEqual(used.body);
    await scan(staffToken, 'physical-e2e-use-with-floorplan-second', firstToken)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PHYSICAL_PASS_ALREADY_USED'));
    await request(app.getHttpServer())
      .post(`/api/v1/events/${created.body.id}/close`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Idempotency-Key', 'physical-e2e-close')
      .expect(200);
    const secondSvg = await getSvg(created.body.id, generated.body.passes[1].id, cookie).expect(200);
    await scan(staffToken, 'physical-e2e-after-close', await decodeSvgQr(secondSvg.body as Buffer))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('STAFF_EVENT_NOT_OPERATIONAL'));
  }, 60_000);

  it('keeps incomplete physical Events configured and leaves Flyer and Flipbook preparation behavior unchanged', async () => {
    const owner = await createClientOwner(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const physical = await createPhysicalServiceWithPrice(ClientType.PLANNER);
    const flyer = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    const flipbook = await prisma.service.create({ data: { code: ServiceCode.FLIPBOOK } });
    const cookie = await login(owner.email);
    const complete = {
      name: 'Evento preparado',
      socialType: EventSocialType.OTHER,
      eventDateTime: '2030-01-01T18:00:00.000Z',
      timeZone: 'America/Mexico_City',
      capacity: 2
    };
    for (const [serviceId, expected] of [
      [physical.id, EventStatus.CONFIGURED],
      [flyer.id, EventStatus.CONFIGURED],
      [flipbook.id, EventStatus.CONFIGURED]
    ] as const) {
      const event = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set('Cookie', cookie)
        .set('Origin', origin)
        .send({ serviceId })
        .expect(201);
      await updateEvent(event.body.id, cookie, complete)
        .expect(200)
        .expect(({ body }) => expect(body.status).toBe(expected));
    }

    const inconsistent = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ ...complete, serviceId: physical.id })
      .expect(201);
    await insertPhysicalPass({ eventId: inconsistent.body.id, userId: owner.userId }, 2);
    await updateEvent(inconsistent.body.id, cookie, { name: 'Numeración inconsistente' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe(EventStatus.CONFIGURED));

    const incompleteFloorplan = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ ...complete, serviceId: physical.id, floorplanEnabled: true })
      .expect(201);
    await updateEvent(incompleteFloorplan.body.id, cookie, { name: 'Croquis incompleto' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe(EventStatus.CONFIGURED));
  }, 60_000);

  it('enforces generation state, first-use operational checks and identity immutability in PostgreSQL', async () => {
    for (const status of [EventStatus.CLOSED, EventStatus.CANCELLED, EventStatus.ARCHIVED]) {
      const fixture = await createFixture(EventStatus.ACTIVE, 2);
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        await tx.event.update({ where: { id: fixture.eventId }, data: { status } });
      });
      await expect(insertPhysicalPass(fixture, 1)).rejects.toThrow('PHYSICAL_PASS_EVENT_NOT_MUTABLE');
    }
    const active = await createFixture(EventStatus.ACTIVE, 3);
    await insertPhysicalPass(active, 1);
    const cookie = await login(active.email);
    const staffToken = await createStaff(active.eventId, cookie, 'SQL válido');
    const staff = await prisma.staffToken.findFirstOrThrow({ where: { eventId: active.eventId } });
    const pass = await prisma.physicalPass.findFirstOrThrow({ where: { eventId: active.eventId } });
    const usedAt = new Date();
    await setUseBySql(pass.id, staff.id, 'physical-sql-valid', usedAt);
    await expect(prisma.physicalPass.update({ where: { id: pass.id }, data: { passNumber: 8 } })).rejects.toThrow(
      'PHYSICAL_PASS_IDENTITY_IMMUTABLE'
    );
    await expect(prisma.physicalPass.update({ where: { id: pass.id }, data: { usedAt: new Date() } })).rejects.toThrow(
      'PHYSICAL_PASS_USED_IMMUTABLE'
    );

    const beforeUse = await createFixture(EventStatus.ACTIVE, 3);
    await insertPhysicalPass(beforeUse, 1);
    const unused = await prisma.physicalPass.findFirstOrThrow({ where: { eventId: beforeUse.eventId } });
    await expect(
      prisma.physicalPass.update({ where: { id: unused.id }, data: { qrTokenNonce: 'f'.repeat(64) } })
    ).rejects.toThrow('PHYSICAL_PASS_IDENTITY_IMMUTABLE');

    for (const status of [EventStatus.CLOSED, EventStatus.CANCELLED]) {
      const fixture = await createFixture(EventStatus.ACTIVE, 2);
      await insertPhysicalPass(fixture, 1);
      const fixtureCookie = await login(fixture.email);
      await createStaff(fixture.eventId, fixtureCookie, `SQL ${status}`);
      const fixtureStaff = await prisma.staffToken.findFirstOrThrow({ where: { eventId: fixture.eventId } });
      const fixturePass = await prisma.physicalPass.findFirstOrThrow({ where: { eventId: fixture.eventId } });
      await prisma.event.update({ where: { id: fixture.eventId }, data: { status } });
      await expect(setUseBySql(fixturePass.id, fixtureStaff.id, `physical-sql-${status}`, new Date())).rejects.toThrow(
        'PHYSICAL_PASS_USE_EVENT_NOT_OPERATIONAL'
      );
    }

    const expired = await createFixture(EventStatus.ACTIVE, 2);
    await insertPhysicalPass(expired, 1);
    const expiredCookie = await login(expired.email);
    await createStaff(expired.eventId, expiredCookie, 'SQL expirado');
    const expiredStaff = await prisma.staffToken.findFirstOrThrow({ where: { eventId: expired.eventId } });
    const expiredPass = await prisma.physicalPass.findFirstOrThrow({ where: { eventId: expired.eventId } });
    await prisma.staffToken.update({ where: { id: expiredStaff.id }, data: { expiredAt: new Date() } });
    await expect(setUseBySql(expiredPass.id, expiredStaff.id, 'physical-sql-expired', new Date())).rejects.toThrow(
      'PHYSICAL_PASS_USE_STAFF_EXPIRED'
    );

    const other = await createFixture(EventStatus.ACTIVE, 2);
    const otherCookie = await login(other.email);
    await createStaff(other.eventId, otherCookie, 'SQL otro Evento');
    const otherStaff = await prisma.staffToken.findFirstOrThrow({ where: { eventId: other.eventId } });
    await expect(setUseBySql(unused.id, otherStaff.id, 'physical-sql-other-event', new Date())).rejects.toThrow(
      'PHYSICAL_PASS_STAFF_INVALID'
    );
    expect(staffToken).toMatch(/^st1\./u);
  }, 60_000);

  function generate(
    eventId: string,
    cookie: string[],
    key: string,
    quantity: number,
    tableShapeId: string | null = null
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/physical-passes/generate`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Idempotency-Key', key)
      .send({ quantity, tableShapeId });
  }

  function scan(staffToken: string, key: string, qrToken: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(staffToken)}/physical-passes/scan`)
      .set('Idempotency-Key', key)
      .send({ qrToken });
  }

  function updateEvent(eventId: string, cookie: string[], body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send(body);
  }

  function activate(eventId: string, cookie: string[], key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/activate`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Idempotency-Key', key);
  }

  function getSvg(eventId: string, passId: string, cookie: string[]) {
    return request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/physical-passes/${passId}/svg`)
      .set('Cookie', cookie);
  }

  async function decodeSvgQr(svg: Buffer): Promise<string> {
    const raster = await sharp(svg).ensureAlpha().raw().toBuffer({
      resolveWithObject: true
    });
    const decoded = jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height);
    if (!decoded?.data) throw new Error('PhysicalPass SVG QR could not be decoded.');
    return decoded.data;
  }

  async function createStaff(eventId: string, cookie: string[], alias: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ alias })
      .expect(201);
    return response.body.token as string;
  }

  async function createUseRaceFixture(label: string, floorplanEnabled = false) {
    const fixture = await createFixture(EventStatus.ACTIVE, 2, floorplanEnabled);
    const cookie = await login(fixture.email);
    const table = floorplanEnabled ? await createFloorplanTable(fixture, 2) : null;
    const generated = await generate(
      fixture.eventId,
      cookie,
      `physical-race-generation-${label}`,
      1,
      table?.id ?? null
    ).expect(200);
    const staffToken = await createStaff(fixture.eventId, cookie, `Puerta ${label}`);
    const staff = await prisma.staffToken.findFirstOrThrow({ where: { eventId: fixture.eventId, expiredAt: null } });
    const pass = await prisma.physicalPass.findUniqueOrThrow({
      where: { id: generated.body.passes[0].id as string }
    });
    return {
      ...fixture,
      cookie,
      table,
      staff,
      staffToken,
      pass,
      qrToken: tokens.issue(pass.id, pass.qrTokenNonce)
    };
  }

  function transition(eventId: string, cookie: string[], action: 'close' | 'cancel', key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/${action}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .set('Idempotency-Key', key);
  }

  function auditBarrier(action: 'PHYSICAL_PASS_GENERATE' | 'PHYSICAL_PASS_USE' | 'PHYSICAL_PASS_REVOKE') {
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = audit.record.bind(audit);
    let intercepted = false;
    const spy = vi.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
      if (!intercepted && input.action === action) {
        intercepted = true;
        entered.resolve();
        await release.promise;
      }
      return original(input, tx);
    });
    return { entered, release, restore: () => spy.mockRestore() };
  }

  async function createClientOwner(type: ClientType, role: UserRole) {
    const client = await prisma.client.create({
      data: { type, operatingProfile: 'SELF_SERVICE', name: `Cliente ${randomUUID()}`, status: ClientStatus.ACTIVE }
    });
    const user = await createUser(role, client.id);
    return { clientId: client.id, userId: user.id, email: user.email };
  }

  async function createPhysicalServiceWithPrice(clientType: ClientType) {
    const service = await prisma.service.create({ data: { code: ServiceCode.PHYSICAL_QR } });
    await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType,
        credits: 0,
        validFrom: new Date('2020-01-01T00:00:00.000Z')
      }
    });
    return service;
  }

  async function insertPhysicalPass(fixture: { eventId: string; userId: string }, passNumber: number): Promise<void> {
    const nonce = randomUUID().replaceAll('-', '').repeat(2);
    await prisma.$executeRaw`
      INSERT INTO "physical_pass" (
        "id", "event_id", "pass_number", "qr_token_nonce", "qr_token_version",
        "created_by_user_id", "updated_at"
      )
      VALUES (
        gen_random_uuid(), ${fixture.eventId}::uuid, ${passNumber}, ${nonce}, 1,
        ${fixture.userId}::uuid, clock_timestamp()
      )
    `;
  }

  async function setUseBySql(passId: string, staffTokenId: string, key: string, usedAt: Date): Promise<void> {
    const snapshot = JSON.stringify({
      status: 'USED',
      physicalPassId: passId,
      passNumber: 1,
      usedAt: usedAt.toISOString(),
      table: null
    });
    await prisma.$executeRaw`
      UPDATE "physical_pass"
      SET
        "used_at" = ${usedAt},
        "used_by_staff_token_id" = ${staffTokenId}::uuid,
        "use_idempotency_key" = ${key},
        "use_request_signature" = ${'e'.repeat(64)},
        "use_result_snapshot" = ${snapshot}::jsonb
      WHERE "id" = ${passId}::uuid
    `;
  }

  async function assertNoSyntheticDomainWrites() {
    expect(
      await Promise.all([
        prisma.contact.count(),
        prisma.invitation.count(),
        prisma.assistant.count(),
        prisma.checkIn.count(),
        prisma.ledgerEntry.count(),
        prisma.receipt.count(),
        prisma.servicePrice.count(),
        prisma.payment.count()
      ])
    ).toEqual(Array(8).fill(0));
  }

  async function anonymousFixture(capacity: number, floorplanEnabled = false) {
    const client = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, operatingProfile: 'MANAGED', name: randomUUID() }
    });
    const provider = await createUser(UserRole.PLATFORM_ADMIN, null);
    const planner = await createUser(UserRole.ORGANIZATION_PLANNER, client.id);
    const admin = await createUser(UserRole.ORGANIZATION_ADMIN, client.id);
    const service = await prisma.service.upsert({
      where: { code: ServiceCode.ACCESS_CONTROL },
      create: { code: ServiceCode.ACCESS_CONTROL },
      update: {}
    });
    const event = await prisma.event.create({
      data: {
        clientId: client.id,
        createdByUserId: provider.id,
        assignedPlannerUserId: planner.id,
        serviceId: service.id,
        accessMode: 'ANONYMOUS',
        capacity,
        floorplanEnabled,
        status: EventStatus.CONFIGURED,
        name: 'Anonymous passes',
        socialType: EventSocialType.OTHER,
        eventDateTime: new Date('2035-01-01T18:00:00Z'),
        timeZone: 'America/Mexico_City',
        confirmationEnabled: false
      }
    });
    return {
      clientId: client.id,
      userId: provider.id,
      email: provider.email,
      plannerId: planner.id,
      adminId: admin.id,
      serviceId: service.id,
      eventId: event.id,
      providerCookie: await login(provider.email),
      cookie: await login(planner.email),
      adminCookie: await login(admin.email)
    };
  }

  function adminGenerate(
    f: Awaited<ReturnType<typeof anonymousFixture>>,
    key: string,
    quantity: number,
    tableShapeId: string | null = null
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${f.clientId}/events/${f.eventId}/physical-passes/generate`)
      .set('Origin', origin)
      .set('Cookie', f.providerCookie)
      .set('Idempotency-Key', key)
      .send({ quantity, tableShapeId });
  }

  function revokeAnonymous(
    f: { eventId: string; cookie: string[] },
    passId: string,
    key: string,
    cookie = f.cookie,
    reason = 'OPERATOR_REQUEST'
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${f.eventId}/physical-passes/${passId}/revoke`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({ revocationReasonCode: reason });
  }

  async function anonymousStaff(f: Awaited<ReturnType<typeof anonymousFixture>>) {
    // Isolated fixture only. Production ACCESS_CONTROL activation remains closed until DT06.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.event.update({
        where: { id: f.eventId },
        data: {
          status: EventStatus.ACTIVE,
          activatedAt: new Date(),
          activatedByUserId: f.userId,
          activatedServiceId: f.serviceId,
          activationIdempotencyKey: randomUUID()
        }
      });
    });
    return createStaff(f.eventId, f.adminCookie, 'Anonymous door');
  }

  async function sqlRevoke(passId: string, actor: string, key: string) {
    return prisma.$executeRaw`UPDATE physical_pass SET revoked_at=clock_timestamp(),revoked_by_user_id=${actor}::uuid,
      revocation_reason_code='OPERATOR_REQUEST',revoke_idempotency_key=${key},revoke_request_signature=${'a'.repeat(64)},
      revoke_result_snapshot='{}'::jsonb WHERE id=${passId}::uuid`;
  }

  async function createFixture(status: EventStatus, capacity: number, floorplanEnabled = false) {
    const client = await prisma.client.create({
      data: {
        type: ClientType.PLANNER,
        operatingProfile: 'SELF_SERVICE',
        name: `Cliente ${randomUUID()}`,
        status: ClientStatus.ACTIVE
      }
    });
    const user = await createUser(UserRole.INDEPENDENT_PLANNER, client.id);
    const serviceRecord =
      (await prisma.service.findUnique({ where: { code: ServiceCode.PHYSICAL_QR } })) ??
      (await prisma.service.create({ data: { code: ServiceCode.PHYSICAL_QR } }));
    if (status === EventStatus.ACTIVE) {
      const event = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        const price =
          (await tx.servicePrice.findFirst({
            where: {
              serviceId: serviceRecord.id,
              clientType: ClientType.PLANNER,
              validFrom: new Date('2020-01-01T00:00:00.000Z')
            }
          })) ??
          (await tx.servicePrice.create({
            data: {
              serviceId: serviceRecord.id,
              clientType: ClientType.PLANNER,
              credits: 0,
              validFrom: new Date('2020-01-01T00:00:00.000Z')
            }
          }));
        const key = `physical-activation-${randomUUID()}`;
        const receipt = await tx.receipt.create({
          data: {
            folio: 9_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000)),
            clientId: client.id,
            operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
            operationReference: key,
            idempotencyKey: key
          }
        });
        return tx.event.create({
          data: {
            clientId: client.id,
            createdByUserId: user.id,
            serviceId: serviceRecord.id,
            name: 'Evento pases',
            socialType: EventSocialType.WEDDING,
            status,
            eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
            timeZone: 'America/Mexico_City',
            capacity,
            floorplanEnabled,
            activatedAt: new Date(),
            activatedByUserId: user.id,
            activatedServiceId: serviceRecord.id,
            activatedServicePriceId: price.id,
            baseCostCredits: 0,
            promotionDiscountCredits: 0,
            finalCostCredits: 0,
            purchasedCreditsUsed: 0,
            creditLineCreditsUsed: 0,
            activationReceiptId: receipt.id,
            activationIdempotencyKey: key
          }
        });
      });
      return { clientId: client.id, userId: user.id, email: user.email, eventId: event.id };
    }
    const event = await prisma.event.create({
      data: {
        clientId: client.id,
        createdByUserId: user.id,
        serviceId: serviceRecord.id,
        name: 'Evento pases',
        socialType: EventSocialType.WEDDING,
        status,
        eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
        timeZone: 'America/Mexico_City',
        capacity,
        floorplanEnabled
      }
    });
    return { clientId: client.id, userId: user.id, email: user.email, eventId: event.id };
  }

  async function createFloorplanTable(
    fixture: { clientId: string; userId: string; eventId: string },
    capacity: number
  ) {
    return prisma.$transaction(async (tx) => {
      const floorplanId = randomUUID();
      const asset = await tx.fileAsset.create({
        data: {
          clientId: fixture.clientId,
          eventId: fixture.eventId,
          ownerType: FileAssetOwnerType.FLOORPLAN,
          ownerId: floorplanId,
          fileType: FileAssetType.FLOORPLAN_IMAGE,
          storageProvider: StorageProvider.LOCAL,
          storageKey: `physical-test/${randomUUID()}.png`,
          originalName: 'floorplan.png',
          mimeType: 'image/png',
          sizeBytes: 100,
          checksumSha256: 'c'.repeat(64),
          width: 100,
          height: 100,
          createdByUserId: fixture.userId,
          status: FileAssetStatus.READY,
          associatedAt: new Date()
        }
      });
      await tx.floorplan.create({
        data: { id: floorplanId, eventId: fixture.eventId, imageAssetId: asset.id }
      });
      return tx.floorplanShape.create({
        data: {
          floorplanId,
          eventId: fixture.eventId,
          kind: FloorplanShapeKind.TABLE,
          geometry: FloorplanGeometry.RECTANGLE,
          name: 'Mesa 1',
          normalizedName: 'mesa 1',
          capacity,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          rotation: 0
        }
      });
    });
  }

  async function ensureFreeActivationPrice(eventId: string): Promise<void> {
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { client: { select: { type: true } } }
    });
    if (!event.serviceId) throw new Error('Physical Event service is required.');
    const existing = await prisma.servicePrice.findFirst({
      where: {
        serviceId: event.serviceId,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 150,
        validUntil: null
      }
    });
    const price =
      existing ??
      (await prisma.servicePrice.create({
        data: {
          serviceId: event.serviceId,
          pricingVersion: 2,
          commercialChannel: CommercialChannel.STANDARD,
          capacityMin: 1,
          capacityMax: 150,
          credits: 0,
          validFrom: new Date('2021-01-01T00:00:00.000Z')
        }
      }));
    const admin = await createUser(UserRole.PLATFORM_ADMIN, null);
    const lockedAt = new Date();
    await prisma.event.update({
      where: { id: eventId },
      data: {
        commercialAuthorizedAt: lockedAt,
        commercialAuthorizedByUserId: admin.id,
        commercialPriceLockedAt: lockedAt,
        commercialServicePriceId: price.id,
        commercialBaseCostCredits: price.credits,
        commercialPromotionDiscountCredits: 0,
        commercialFinalCostCredits: price.credits,
        commercialChannelSnapshot: CommercialChannel.STANDARD,
        commercialCapacitySnapshot: event.capacity,
        commercialCapacityMinSnapshot: price.capacityMin,
        commercialCapacityMaxSnapshot: price.capacityMax,
        commercialVenueTierSnapshot: null
      }
    });
  }

  async function createUser(role: UserRole, clientId: string | null) {
    const email = `${randomUUID()}@example.test`;
    return prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
  }

  async function login(email: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    return response.headers['set-cookie'] as unknown as string[];
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "physical_pass_generation_operation", "physical_pass", "staff_token", "hotspot", "flipbook_page",
        "invitation_design", "file_asset", "assistant", "invitation", "contact_import_preview", "contact",
        "contact_group", "event_state_operation", "event", "debt_payment_allocation", "ledger_entry", "payment",
        "receipt", "credit_line", "finance_balance", "promotion", "service_price", "service", "audit_log",
        "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});

async function startBehindVerifiedEventLock<A, B>(
  eventId: string,
  start: () => [PromiseLike<A>, PromiseLike<B>]
): Promise<[Awaited<A>, Awaited<B>]> {
  return startBehindVerifiedLock(
    (client) => client.query('SELECT "id" FROM "event" WHERE "id" = $1::uuid FOR UPDATE', [eventId]),
    start
  );
}

async function startBehindVerifiedRowLock<A, B>(
  table: 'floorplan_shape' | 'physical_pass' | 'staff_token',
  rowId: string,
  start: () => [PromiseLike<A>, PromiseLike<B>]
): Promise<[Awaited<A>, Awaited<B>]> {
  const lock = {
    floorplan_shape: 'SELECT "id" FROM "floorplan_shape" WHERE "id" = $1::uuid FOR UPDATE',
    physical_pass: 'SELECT "id" FROM "physical_pass" WHERE "id" = $1::uuid FOR UPDATE',
    staff_token: 'SELECT "id" FROM "staff_token" WHERE "id" = $1::uuid FOR UPDATE'
  }[table];
  return startBehindVerifiedLock((client) => client.query(lock, [rowId]), start);
}

async function startBehindVerifiedLock<A, B>(
  acquire: (client: PgClient) => Promise<unknown>,
  start: () => [PromiseLike<A>, PromiseLike<B>]
): Promise<[Awaited<A>, Awaited<B>]> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const blocker = new PgClient({ connectionString: databaseUrl });
  const observer = new PgClient({ connectionString: databaseUrl });
  await Promise.all([blocker.connect(), observer.connect()]);
  let committed = false;
  let first: Promise<Awaited<A>> | undefined;
  let second: Promise<Awaited<B>> | undefined;
  try {
    await blocker.query('BEGIN');
    await acquire(blocker);
    const pending = start();
    first = Promise.resolve(pending[0]);
    await waitForLockWaiters(observer, 1);
    second = Promise.resolve(pending[1]);
    await waitForLockWaiters(observer, 2);
    await blocker.query('COMMIT');
    committed = true;
    return await Promise.all([first, second]);
  } finally {
    if (!committed) await blocker.query('ROLLBACK').catch(() => undefined);
    if (!committed) {
      await Promise.allSettled([first, second].filter((operation) => operation !== undefined));
    }
    await Promise.all([blocker.end(), observer.end()]);
  }
}

async function waitForLockWaiters(observer: PgClient, expected: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ count: string }>(`
      SELECT count(*)::text AS "count"
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `);
    if (Number(result.rows[0]?.count ?? 0) >= expected) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Expected ${expected} PostgreSQL lock waiters before releasing the race barrier.`);
}

async function waitForVerifiedLockWaiters(expected: number): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const observer = new PgClient({ connectionString: databaseUrl });
  await observer.connect();
  try {
    await waitForLockWaiters(observer, expected);
  } finally {
    await observer.end();
  }
}

async function capture<T>(operation: PromiseLike<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await operation };
  } catch (error) {
    return { ok: false, error };
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
