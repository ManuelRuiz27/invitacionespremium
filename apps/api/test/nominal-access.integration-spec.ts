import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import jsQR from 'jsqr';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../src/common/database/transaction-policy';
import { ContactsService } from '../src/contacts/contacts.service';
import type { UserRole } from '../src/generated/prisma/client';
import { NominalAccessTokenService } from '../src/nominal-access/nominal-access-token.service';
import { NominalAccessQrService } from '../src/nominal-access/nominal-access-qr.service';
import { NominalAccessService } from '../src/nominal-access/nominal-access.service';
import { createOpenApiDocument } from '../src/openapi/openapi';
import { ScannerService } from '../src/scanner/scanner.service';
import { createNominalAccessFixture, createOperationalNominalAccessFixture } from './nominal-access.fixture';

const origin = 'http://localhost:5173',
  password = 'correct horse battery staple';
type Fixture = Awaited<ReturnType<typeof createNominalAccessFixture>>;
describe('DT03 nominal access credentials', () => {
  let app: INestApplication, prisma: PrismaService, tokens: NominalAccessTokenService, access: NominalAccessService;
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'nominal-integration-secret-with-at-least-32-bytes';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(NominalAccessTokenService);
    access = app.get(NominalAccessService);
  });
  beforeEach(reset, 60_000);
  afterAll(async () => {
    await reset();
    await app.close();
  }, 60_000);

  it('serializes operational scan/revoke/reissue using real Event lock waits in both orders', async () => {
    const scanner = app.get(ScannerService),
      audit = app.get(AuditService);
    // CheckIn wins: revocation observes the committed ingress and cannot invalidate used material.
    const first = await createOperationalNominalAccessFixture(app, origin, password);
    const gate = auditGate('CHECK_IN_CREATE');
    const ingress = scanner.scanNominal(first.staffToken, 'race-scan', { qrToken: first.qrToken });
    let revocation: Promise<request.Response> | undefined;
    try {
      await gate.entered;
      revocation = revoke(first, first.credentialId, 'race-revoke').then((r) => r);
      await waitForEventLock();
    } finally {
      gate.release();
    }
    await ingress;
    expect((await revocation!).status).toBe(409);
    gate.restore();
    expect((await getList(first).expect(200)).body[0]).toMatchObject({ status: 'ISSUED', hasActiveCheckIn: true });

    // Revocation wins: the old token stays invalid even if replacement issuance races the scan.
    const second = await createOperationalNominalAccessFixture(app, origin, password);
    const revokeGate = auditGate('NOMINAL_ACCESS_REVOKE');
    const revokeRequest = revoke(second, second.credentialId, 'revoke-first').then((r) => r);
    let blockedScan: Promise<unknown> | undefined;
    try {
      await revokeGate.entered;
      // Attach rejection handling before releasing the competing transaction.
      blockedScan = scanner.scanNominal(second.staffToken, 'old-material', { qrToken: second.qrToken }).catch((e) => e);
      await waitForEventLock();
    } finally {
      revokeGate.release();
    }
    expect((await revokeRequest).status).toBe(200);
    revokeGate.restore();
    const replacement = await issue(second, second.assistantId, 'replacement').expect(201);
    expect(await blockedScan!).toMatchObject({ response: { code: 'SCANNER_QR_NOT_FOUND' } });
    expect(await prisma.checkIn.count({ where: { eventId: second.event.id } })).toBe(0);
    const material = await prisma.assistantAccessCredential.findUniqueOrThrow({
      where: { id: replacement.body.id as string }
    });
    await scanner.scanNominal(second.staffToken, 'new-material', {
      qrToken: tokens.issue(material.id, material.qrTokenNonce)
    });
    expect(await prisma.checkIn.count({ where: { eventId: second.event.id, revertedAt: null } })).toBe(1);

    function auditGate(action: string) {
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((r) => {
          enter = r;
        }),
        held = new Promise<void>((r) => {
          release = r;
        });
      const original = audit.record.bind(audit);
      let intercepted = false;
      const spy = vi.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
        if (!intercepted && input.action === action) {
          intercepted = true;
          enter();
          await held;
        }
        return original(input, tx);
      });
      return { entered, release, restore: () => spy.mockRestore() };
    }
    async function waitForEventLock() {
      for (let i = 0; i < 1000; i += 1) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()
            AND wait_event_type = 'Lock' AND query ILIKE '%event%'
        ) AS waiting`;
        if (rows[0]?.waiting) return;
        await new Promise<void>((r) => setImmediate(r));
      }
      throw new Error('Concurrent nominal operation did not wait for the Event lock.');
    }
  });

  it('issues individual credentials for repeated names without RSVP and serves authenticated safe SVG', async () => {
    const f = await fixture(),
      firstAssistant = f.invitation.assistants[0]!;
    const second = await addAssistant(f);
    const baseline = await unaffectedSnapshot(f);
    const first = await issue(f, firstAssistant.id, 'issue-first').expect(201);
    const next = await issue(f, second.id, 'issue-second').expect(201);
    expect(first.body).toMatchObject({
      assistantId: firstAssistant.id,
      status: 'ISSUED',
      revokedAt: null,
      hasActiveCheckIn: false
    });
    expect(next.body.id).not.toBe(first.body.id);
    expect(Object.keys(first.body).sort()).toEqual(
      [
        'id',
        'eventId',
        'assistantId',
        'status',
        'issuedAt',
        'revokedAt',
        'revocationReasonCode',
        'hasActiveCheckIn'
      ].sort()
    );
    const stored = await prisma.assistantAccessCredential.findUniqueOrThrow({ where: { id: first.body.id as string } });
    const expectedToken = tokens.issue(stored.id, stored.qrTokenNonce);
    expect(stored.qrTokenNonce).not.toBe(f.invitation.qrTokenNonce);
    expect(stored.qrTokenNonce).not.toBe(f.invitation.invitationTokenNonce);
    const svg = await svgGet(f, stored.id).expect(200);
    expect(svg.headers).toMatchObject({
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'"
    });
    expect(svg.headers['etag']).toBe(
      `"sha256-${createHash('sha256')
        .update(svg.body as Buffer)
        .digest('hex')}"`
    );
    expect((await svgGet(f, stored.id).expect(200)).body).toEqual(svg.body);
    const text = (svg.body as Buffer).toString('utf8');
    for (const secret of [expectedToken, stored.qrTokenNonce, firstAssistant.name!]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/<text|<script|href=|<!DOCTYPE|<\?/iu);
    const image = await sharp(svg.body as Buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(image.data), image.info.width, image.info.height)?.data).toBe(expectedToken);
    expect(await resolve(expectedToken, f.event.id)).toEqual({
      credentialId: stored.id,
      eventId: f.event.id,
      assistantId: firstAssistant.id
    });
    await request(app.getHttpServer())
      .get(`${base(f)}/${stored.id}/svg`)
      .expect(401);
    const listed = await getList(f).expect(200);
    expect(listed.body).toHaveLength(2);
    expect(JSON.stringify(listed.body)).not.toMatch(/nonce|signature|token|phone/iu);
    const audits = JSON.stringify(
      await prisma.auditLog.findMany({ where: { eventId: f.event.id, action: { startsWith: 'NOMINAL_ACCESS_' } } })
    );
    for (const value of [expectedToken, stored.qrTokenNonce, firstAssistant.name!]) expect(audits).not.toContain(value);
    expect(await unaffectedSnapshot(f)).toEqual(baseline);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${f.event.id}/invitations`)
      .set('Cookie', f.cookie)
      .expect(409);
  });

  it('replays equivalent operations, rejects incompatible keys, and reissues with permanently distinct material', async () => {
    const f = await fixture(),
      assistantId = f.invitation.assistants[0]!.id;
    const first = await issue(f, assistantId, 'stable-issue').expect(201);
    expect((await issue(f, assistantId, 'stable-issue').expect(201)).body).toEqual(first.body);
    await issue(f, assistantId, 'another-issue')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('NOMINAL_ACCESS_ALREADY_ISSUED'));
    expect(
      (
        await issue(
          { ...f, event: { ...f.event, id: f.event.id.toUpperCase() } },
          assistantId.toUpperCase(),
          'stable-issue'
        ).expect(201)
      ).body
    ).toEqual(first.body);
    const other = await addAssistant(f);
    await issue(f, other.id, 'stable-issue')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('NOMINAL_ACCESS_IDEMPOTENCY_CONFLICT'));
    const old = await prisma.assistantAccessCredential.findUniqueOrThrow({ where: { id: first.body.id as string } });
    const oldToken = tokens.issue(old.id, old.qrTokenNonce);
    await revoke(f, old.id, 'stable-issue').expect(409);
    const revoked = await revoke(f, old.id, 'stable-revoke').expect(200);
    expect(revoked.body).toMatchObject({ status: 'REVOKED', revocationReasonCode: 'REPLACED' });
    expect((await revoke(f, old.id, 'stable-revoke').expect(200)).body).toEqual(revoked.body);
    await revoke(f, old.id, 'stable-revoke', 'OTHER_REASON')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('NOMINAL_ACCESS_IDEMPOTENCY_CONFLICT'));
    await revoke(f, old.id, 'new-revoke').expect(409);
    expect((await issue(f, assistantId, 'stable-issue').expect(201)).body).toEqual(first.body);
    const reissued = await issue(f, assistantId, 'reissue').expect(201);
    expect(reissued.body.id).not.toBe(old.id);
    const current = await prisma.assistantAccessCredential.findUniqueOrThrow({
      where: { id: reissued.body.id as string }
    });
    expect(current.qrTokenNonce).not.toBe(old.qrTokenNonce);
    expect(await resolve(oldToken, f.event.id)).toBeNull();
    expect(await resolve(tokens.issue(current.id, current.qrTokenNonce), f.event.id)).toMatchObject({
      credentialId: current.id
    });
    await svgGet(f, old.id).expect(409);
    expect((await getList(f).expect(200)).body.map((row: { status: string }) => row.status).sort()).toEqual([
      'ISSUED',
      'REVOKED'
    ]);
    const admin = await user(f.event.clientId, 'ORGANIZATION_ADMIN');
    await issue({ ...f, cookie: await login(admin.email) }, assistantId, 'stable-issue')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('NOMINAL_ACCESS_IDEMPOTENCY_CONFLICT'));
    await prisma.event.update({ where: { id: f.event.id }, data: { status: 'CANCELLED' } });
    expect((await issue(f, assistantId, 'stable-issue').expect(201)).body).toEqual(first.body);
    expect((await revoke(f, old.id, 'stable-revoke').expect(200)).body).toEqual(revoked.body);
    await issue(f, other.id, 'after-cancel').expect(409);
    await svgGet(f, current.id).expect(409);
    await prisma.event.update({ where: { id: f.event.id }, data: { deletedAt: new Date() } });
    expect((await issue(f, assistantId, 'stable-issue').expect(201)).body).toEqual(first.body);
    expect((await revoke(f, old.id, 'stable-revoke').expect(200)).body).toEqual(revoked.body);
    await getList(f).expect(404);
    expect(
      await prisma.auditLog.count({ where: { eventId: f.event.id, action: { startsWith: 'NOMINAL_ACCESS_' } } })
    ).toBe(3);
  });

  it('uses assigned ownership, denies foreign subjects and excludes every other service/profile', async () => {
    const f = await fixture(),
      outsider = await fixture(),
      assistantId = f.invitation.assistants[0]!.id;
    const issued = await issue(f, assistantId, 'own').expect(201);
    const colleague = await user(f.event.clientId, 'ORGANIZATION_PLANNER');
    const admin = await user(f.event.clientId, 'ORGANIZATION_ADMIN');
    const provider = await prisma.user.findUniqueOrThrow({ where: { id: f.event.createdByUserId } });
    for (const cookie of [outsider.cookie, await login(colleague.email)]) {
      const foreign = { ...f, cookie };
      await getList(foreign).expect(404);
      await issue(foreign, assistantId, randomUUID()).expect(404);
      await svgGet(foreign, issued.body.id as string).expect(404);
      await revoke(foreign, issued.body.id as string, randomUUID()).expect(404);
    }
    const adminFixture = { ...f, cookie: await login(admin.email) };
    await getList(adminFixture).expect(200);
    const adminAssistant = await addAssistant(adminFixture);
    const adminIssued = await issue(adminFixture, adminAssistant.id, 'admin-issue').expect(201);
    await svgGet(adminFixture, adminIssued.body.id as string).expect(200);
    await revoke(adminFixture, adminIssued.body.id as string, 'admin-revoke').expect(200);
    await getList({ ...f, cookie: await login(provider.email) }).expect(403);
    const foreignCredential = await issue(outsider, outsider.invitation.assistants[0]!.id, 'foreign-credential').expect(
      201
    );
    await svgGet(f, foreignCredential.body.id as string).expect(404);
    await revoke(f, foreignCredential.body.id as string, 'foreign-revoke').expect(404);
    await issue(f, outsider.invitation.assistants[0]!.id, 'foreign-assistant').expect(404);
    const ownMaterial = await prisma.assistantAccessCredential.findUniqueOrThrow({
      where: { id: issued.body.id as string }
    });
    expect(await resolve(tokens.issue(ownMaterial.id, ownMaterial.qrTokenNonce), outsider.event.id)).toBeNull();
    for (const code of ['FLYER', 'FLIPBOOK', 'PHYSICAL_QR', 'ACCESS_CONTROL'] as const) {
      const service = await prisma.service.upsert({ where: { code }, create: { code }, update: {} });
      const event = await prisma.event.create({
        data: {
          clientId: f.event.clientId,
          createdByUserId: f.event.createdByUserId,
          assignedPlannerUserId: f.event.assignedPlannerUserId,
          serviceId: service.id,
          accessMode: code === 'ACCESS_CONTROL' ? 'ANONYMOUS' : null
        }
      });
      const wrong = { ...f, event };
      await getList(wrong).expect(409);
      await issue(wrong, assistantId, randomUUID()).expect(409);
      await expect(
        prisma.assistantAccessCredential.create({
          data: {
            eventId: event.id,
            assistantId,
            issuedByUserId: f.event.assignedPlannerUserId!,
            qrTokenNonce: tokens.createNonce()
          }
        })
      ).rejects.toThrow();
    }
    await issue(f, assistantId, '').expect(400);
    await request(app.getHttpServer())
      .post(`${base(f)}/assistants/${assistantId}/issue`)
      .set('Origin', origin)
      .set('Cookie', f.cookie)
      .send({})
      .expect(400);
    await post(`${base(f)}/assistants/${assistantId}/issue`, f.cookie, 'bad-body', {
      qrTokenNonce: 'not-allowed'
    }).expect(400);
    await prisma.event.update({ where: { id: f.event.id }, data: { assignedPlannerUserId: colleague.id } });
    await issue(f, assistantId, 'own').expect(404);
  });

  it('serializes same-key/different-key issuance, revoke/reissue and concurrent revocations', async () => {
    const f = await fixture(),
      assistantId = f.invitation.assistants[0]!.id;
    const same = await Promise.all(Array.from({ length: 4 }, () => issue(f, assistantId, 'concurrent-same')));
    expect(same.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(same.map((r) => r.body.id)).size).toBe(1);
    const id = same[0]!.body.id as string;
    const second = await addAssistant(f);
    const distinct = await Promise.all([issue(f, second.id, 'different-a'), issue(f, second.id, 'different-b')]);
    expect(distinct.map((r) => r.status).sort()).toEqual([201, 409]);
    const revocations = await Promise.all([revoke(f, id, 'revoke-same'), revoke(f, id, 'revoke-same')]);
    expect(revocations.map((r) => r.status)).toEqual([200, 200]);
    expect(revocations[0]!.body).toEqual(revocations[1]!.body);
    const reissue = await issue(f, assistantId, 'new-current').expect(201);
    const racing = await Promise.all([
      revoke(f, reissue.body.id as string, 'revoke-race'),
      issue(f, assistantId, 'reissue-race')
    ]);
    expect(racing[0]!.status).toBe(200);
    expect([201, 409]).toContain(racing[1]!.status);
    if (racing[1]!.status === 409) await issue(f, assistantId, 'reissue-race').expect(201);
    expect(
      await prisma.assistantAccessCredential.count({ where: { eventId: f.event.id, assistantId, revokedAt: null } })
    ).toBe(1);
    const current = await prisma.assistantAccessCredential.findFirstOrThrow({
      where: { eventId: f.event.id, assistantId, revokedAt: null }
    });
    const differentRevokes = await Promise.all([revoke(f, current.id, 'revoke-a'), revoke(f, current.id, 'revoke-b')]);
    expect(differentRevokes.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await prisma.assistantAccessCredential.count({ where: { eventId: f.event.id, assistantId, revokedAt: null } })
    ).toBe(0);
  });

  it('rejects SQL identity/token/history/context bypasses and keeps mode locked after revocation', async () => {
    const f = await fixture(),
      other = await fixture(),
      assistantId = f.invitation.assistants[0]!.id;
    const data = {
      eventId: f.event.id,
      assistantId,
      issuedByUserId: f.event.assignedPlannerUserId!,
      qrTokenNonce: tokens.createNonce()
    };
    await expect(
      prisma.assistantAccessCredential.create({ data: { ...data, issuedByUserId: f.event.createdByUserId } })
    ).rejects.toThrow();
    await expect(
      prisma.assistantAccessCredential.create({
        data: { ...data, eventId: other.event.id, issuedByUserId: other.event.assignedPlannerUserId! }
      })
    ).rejects.toThrow();
    await expect(prisma.assistantAccessCredential.create({ data: { ...data, qrTokenNonce: 'bad' } })).rejects.toThrow();
    await expect(prisma.assistantAccessCredential.create({ data: { ...data, qrTokenVersion: 2 } })).rejects.toThrow();
    await expect(
      prisma.assistantAccessCredential.create({
        data: { ...data, revokedAt: new Date(), revokedByUserId: data.issuedByUserId, revocationReasonCode: 'REPLACED' }
      })
    ).rejects.toThrow();
    const credential = await prisma.assistantAccessCredential.create({ data });
    await expect(
      prisma.assistantAccessCredential.create({ data: { ...data, qrTokenNonce: tokens.createNonce() } })
    ).rejects.toThrow();
    for (const mutation of [
      { id: randomUUID() },
      { eventId: other.event.id },
      { assistantId: other.invitation.assistants[0]!.id },
      { qrTokenNonce: tokens.createNonce() },
      { qrTokenVersion: 2 },
      { issuedAt: new Date() },
      { issuedByUserId: f.event.createdByUserId },
      { createdAt: new Date() }
    ]) {
      await expect(
        prisma.assistantAccessCredential.update({ where: { id: credential.id }, data: mutation })
      ).rejects.toThrow();
    }
    await expect(
      prisma.assistantAccessCredential.update({
        where: { id: credential.id },
        data: { revokedAt: new Date(), revokedByUserId: f.event.createdByUserId, revocationReasonCode: 'REPLACED' }
      })
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`DELETE FROM assistant_access_credential WHERE id = ${credential.id}::uuid`
    ).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE assistant_access_credential CASCADE')).rejects.toThrow();
    await revoke(f, credential.id, 'sql-then-revoke').expect(200);
    await expect(
      prisma.assistantAccessCredential.update({
        where: { id: credential.id },
        data: { revokedAt: null, revokedByUserId: null, revocationReasonCode: null }
      })
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE nominal_access_credential_operation SET action = 'ISSUE' WHERE credential_id = ${credential.id}::uuid`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`DELETE FROM nominal_access_credential_operation WHERE credential_id = ${credential.id}::uuid`
    ).rejects.toThrow();
    expect(await prisma.$queryRaw`SELECT event_has_access_material(${f.event.id}::uuid) AS present`).toEqual([
      { present: true }
    ]);
    await expect(
      prisma.event.update({ where: { id: f.event.id }, data: { accessMode: 'ANONYMOUS' } })
    ).rejects.toThrow();
    // Actual composite FK remains a PostgreSQL invariant, not just a trigger predicate.
    const fk = await prisma.$queryRaw<
      Array<{ definition: string }>
    >`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'assistant_access_credential_assistant_id_event_id_fkey'`;
    expect(fk[0]!.definition).toContain('FOREIGN KEY (assistant_id, event_id) REFERENCES assistant(id, event_id)');
  });

  it('invalidates deleted/anonymized subjects without erasing credential history', async () => {
    const f = await fixture(),
      assistantId = f.invitation.assistants[0]!.id;
    const issued = await issue(f, assistantId, 'before-delete').expect(201);
    const stored = await prisma.assistantAccessCredential.findUniqueOrThrow({
      where: { id: issued.body.id as string }
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${f.event.id}/contacts/${f.invitation.contactId}`)
      .set('Origin', origin)
      .set('Cookie', f.cookie)
      .expect(204);
    await svgGet(f, stored.id).expect(404);
    expect(await resolve(tokens.issue(stored.id, stored.qrTokenNonce), f.event.id)).toBeNull();
    await revoke(f, stored.id, 'delete-revoke').expect(200);
    await issue(f, assistantId, 'deleted-reissue').expect(404);
    const second = await addAssistant(f);
    await prisma.event.update({ where: { id: f.event.id }, data: { eventDateTime: new Date('2020-01-01T00:00:00Z') } });
    await app.get(ContactsService).anonymizeExpiredContacts(new Date('2020-02-02T00:00:00Z'));
    await issue(f, second.id, 'anonymized-issue').expect(404);
    await expect(
      prisma.assistantAccessCredential.create({
        data: {
          eventId: f.event.id,
          assistantId: second.id,
          issuedByUserId: f.event.assignedPlannerUserId!,
          qrTokenNonce: tokens.createNonce()
        }
      })
    ).rejects.toThrow();
    expect(await prisma.assistantAccessCredential.count({ where: { eventId: f.event.id } })).toBe(1);
  });

  it('checks existing CheckIn before revocation/replacement without changing its schema or rows', async () => {
    const f = await fixture(),
      assistantId = f.invitation.assistants[0]!.id;
    const issued = await issue(f, assistantId, 'used-issue').expect(201);
    const credentialId = issued.body.id as string;
    // Only the test fixture bypasses triggers: DT03 cannot create a nominal CheckIn.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const staff = await tx.staffToken.create({
        data: {
          eventId: f.event.id,
          alias: 'Fixture',
          tokenDigestSha256: 'a'.repeat(64),
          createdByUserId: f.event.assignedPlannerUserId!
        }
      });
      const at = new Date();
      await tx.checkIn.create({
        data: {
          eventId: f.event.id,
          assistantId,
          invitationId: f.invitation.id,
          staffTokenId: staff.id,
          checkedInAt: at,
          createdAt: at,
          idempotencyKey: 'existing-check-in',
          requestSignature: 'b'.repeat(64),
          resultSnapshot: {}
        }
      });
    });
    const before = await prisma.checkIn.findMany();
    await revoke(f, credentialId, 'used-revoke')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('NOMINAL_ACCESS_ASSISTANT_ALREADY_USED'));
    await expect(
      prisma.assistantAccessCredential.update({
        where: { id: credentialId },
        data: {
          revokedAt: new Date(),
          revokedByUserId: f.event.assignedPlannerUserId!,
          revocationReasonCode: 'REPLACED'
        }
      })
    ).rejects.toThrow();
    expect((await getList(f).expect(200)).body[0].hasActiveCheckIn).toBe(true);
    expect(await prisma.checkIn.findMany()).toEqual(before);
    // A revoked historical record cannot be replaced if the Assistant already has entry.
    const second = await addAssistant(f);
    const secondIssued = await issue(f, second.id, 'second-used-issue').expect(201);
    await revoke(f, secondIssued.body.id as string, 'second-pre-use-revoke').expect(200);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const staff = await tx.staffToken.findFirstOrThrow();
      const at = new Date();
      await tx.checkIn.create({
        data: {
          eventId: f.event.id,
          assistantId: second.id,
          invitationId: second.invitationId,
          staffTokenId: staff.id,
          checkedInAt: at,
          createdAt: at,
          idempotencyKey: 'other-check-in',
          requestSignature: 'c'.repeat(64),
          resultSnapshot: {}
        }
      });
    });
    await issue(f, second.id, 'replacement-after-entry')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('NOMINAL_ACCESS_ASSISTANT_ALREADY_USED'));
  });

  it('rolls back credential, operation and audit together and conceals QR renderer failures', async () => {
    const f = await fixture(),
      assistantId = f.invitation.assistants[0]!.id;
    const audit = app.get(AuditService),
      original = audit.record.bind(audit);
    const fail = vi.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
      if (input.action === 'NOMINAL_ACCESS_ISSUE') throw new Error('test audit failure');
      return original(input, tx);
    });
    await issue(f, assistantId, 'rollback-issue').expect(500);
    fail.mockRestore();
    expect(await prisma.assistantAccessCredential.count()).toBe(0);
    expect(await prisma.nominalAccessCredentialOperation.count()).toBe(0);
    const issued = await issue(f, assistantId, 'rollback-issue').expect(201);
    const failRevoke = vi.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
      if (input.action === 'NOMINAL_ACCESS_REVOKE') throw new Error('test audit failure');
      return original(input, tx);
    });
    await revoke(f, issued.body.id as string, 'rollback-revoke').expect(500);
    failRevoke.mockRestore();
    expect((await prisma.assistantAccessCredential.findFirstOrThrow()).revokedAt).toBeNull();
    const render = vi
      .spyOn(app.get(NominalAccessQrService), 'render')
      .mockRejectedValue(new Error('secret generator detail'));
    await svgGet(f, issued.body.id as string)
      .expect(500)
      .expect(({ body }) => {
        expect(body.code).toBe('NOMINAL_ACCESS_QR_GENERATION_FAILURE');
        expect(JSON.stringify(body)).not.toContain('secret generator detail');
      });
    render.mockRestore();
  });

  it('documents only the authenticated credential surface and mandatory operation keys', () => {
    const document = createOpenApiDocument(app),
      root = '/api/v1/events/{eventId}/nominal-access-credentials';
    expect(document.paths[root]?.get).toBeDefined();
    expect(document.paths[`${root}/{credentialId}/svg`]?.get?.responses['200']).toHaveProperty('content.image/svg+xml');
    for (const path of [`${root}/assistants/{assistantId}/issue`, `${root}/{credentialId}/revoke`]) {
      expect(document.paths[path]?.post?.parameters).toContainEqual(
        expect.objectContaining({ name: 'Idempotency-Key', required: true })
      );
    }
    expect(Object.keys(document.paths).filter((path) => path.includes('nominal-access-credentials'))).toHaveLength(4);
    expect(document.paths['/api/v1/scanner/{staffToken}/nominal-access/scan']?.post?.parameters).toContainEqual(
      expect.objectContaining({ name: 'Idempotency-Key', required: true })
    );
    expect(document.paths['/api/v1/scanner/{staffToken}/nominal-access/scan']?.post?.parameters).toContainEqual(
      expect.objectContaining({ name: 'staffToken', in: 'path', required: true })
    );
  });

  function fixture() {
    return createNominalAccessFixture(app, origin, password);
  }
  function base(f: Fixture) {
    return `/api/v1/events/${f.event.id}/nominal-access-credentials`;
  }
  function post(path: string, cookie: string, key: string, body: object = {}) {
    return request(app.getHttpServer())
      .post(path)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body);
  }
  function issue(f: Fixture, assistantId: string, key: string) {
    return post(`${base(f)}/assistants/${assistantId}/issue`, f.cookie, key);
  }
  function revoke(f: Fixture, id: string, key: string, reason = 'REPLACED') {
    return post(`${base(f)}/${id}/revoke`, f.cookie, key, { revocationReasonCode: reason });
  }
  function getList(f: Fixture) {
    return request(app.getHttpServer()).get(base(f)).set('Cookie', f.cookie);
  }
  function svgGet(f: Fixture, id: string) {
    return request(app.getHttpServer())
      .get(`${base(f)}/${id}/svg`)
      .set('Cookie', f.cookie)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          done(
            null,
            res.headers['content-type']?.includes('application/json')
              ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
              : Buffer.concat(chunks)
          )
        );
        res.on('error', (error: Error) => done(error, undefined));
      });
  }
  async function resolve(token: string, eventId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM event WHERE id = ${eventId}::uuid FOR UPDATE`;
      return access.resolveTokenInTransaction(tx, token, eventId);
    }, CRITICAL_TRANSACTION_OPTIONS);
  }
  async function addAssistant(f: Fixture) {
    const contact = await request(app.getHttpServer())
      .post(`/api/v1/events/${f.event.id}/contacts`)
      .set('Origin', origin)
      .set('Cookie', f.cookie)
      .send({ name: 'Nominal interno' })
      .expect(201);
    return prisma.assistant.findFirstOrThrow({
      where: { invitation: { contactId: contact.body.id as string }, isPrimary: true }
    });
  }
  async function user(clientId: string | null, role: UserRole) {
    return prisma.user.create({
      data: { clientId, role, email: `${randomUUID()}@example.com`, passwordHash: await hashPassword(password) }
    });
  }
  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const raw = res.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing session cookie');
    return cookie;
  }
  async function unaffectedSnapshot(f: Fixture) {
    return {
      assistants: await prisma.assistant.findMany({ where: { eventId: f.event.id } }),
      invitations: await prisma.invitation.findMany({ where: { eventId: f.event.id } }),
      checkIns: await prisma.checkIn.findMany(),
      ledger: await prisma.ledgerEntry.findMany(),
      receipts: await prisma.receipt.findMany(),
      prices: await prisma.servicePrice.findMany()
    };
  }
  async function reset() {
    await prisma.$executeRawUnsafe(
      `BEGIN; SET LOCAL session_replication_role = replica; TRUNCATE TABLE contact_import_preview, contact, contact_group, event, debt_payment_allocation, ledger_entry, payment, receipt, credit_line, finance_balance, promotion, service_price, service, audit_log, auth_session, app_user, client RESTART IDENTITY CASCADE; COMMIT;`
    );
  }
});
