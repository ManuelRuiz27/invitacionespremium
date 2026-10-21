import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../src/common/database/transaction-policy';
import { recomputeAccessControlPreparationStatus } from '../src/events/access-control-readiness.service';
import { NominalAccessTokenService } from '../src/nominal-access/nominal-access-token.service';
import { PhysicalPassTokenService } from '../src/physical-passes/physical-pass-token.service';
import { createOpenApiDocument } from '../src/openapi/openapi';

const origin = 'http://localhost:5173',
  password = 'correct horse battery staple';
type Mode = 'NOMINAL' | 'ANONYMOUS';

describe('DT06 authoritative access preparation and Provider activation', () => {
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  let app: INestApplication, db: PrismaService;
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: origin,
      AUTH_COOKIE_SECURE: 'false',
      AUTH_COOKIE_SAME_SITE: 'lax',
      AUTH_COOKIE_PATH: '/',
      INVITATION_TOKEN_SIGNING_SECRET: 'dt06-integration-signing-secret-at-least-32-bytes'
    });
    app = await createApp();
    await app.init();
    db = app.get(PrismaService);
  });
  beforeEach(reset, 60_000);
  afterAll(async () => {
    await reset();
    await app.close();
  }, 60_000);

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'activates %s through Provider, scans, replays after close without Finance',
    async (mode) => {
      const f = await fixture(mode);
      expect((await readiness(f)).body).toMatchObject({ complete: false, activeMaterialCount: 0 });
      const material = await prepare(f);
      expect((await readiness(f)).body).toEqual({
        complete: true,
        accessMode: mode,
        blockers: [],
        activeMaterialCount: 1,
        capacity: 3
      });
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('READY_TO_ACTIVATE');
      const first = await activate(f, 'dt06-original').expect(200);
      expect(first.body).toMatchObject({
        status: 'ACTIVE',
        activatedByUserId: f.provider.id,
        activatedServicePriceId: null,
        baseCostCredits: null,
        finalCostCredits: null,
        activationReceiptId: null
      });
      expect((await activate(f, 'dt06-original').expect(200)).body).toEqual(first.body);
      expect(
        (
          await activate(
            { ...f, id: f.id.toUpperCase(), client: { ...f.client, id: f.client.id.toUpperCase() } },
            'dt06-original'
          ).expect(200)
        ).body
      ).toEqual(first.body);
      const staff = await post(`/api/v1/events/${f.id}/staff-tokens`, f.cookie, { alias: 'Door' }).expect(201);
      expect(await db.staffToken.findUniqueOrThrow({ where: { id: staff.body.id as string } })).toMatchObject({
        createdByUserId: f.planner.id
      });
      await request(app.getHttpServer()).get(`/api/v1/scanner/${staff.body.token}/session`).expect(200);
      const qrToken =
        mode === 'NOMINAL'
          ? app.get(NominalAccessTokenService).issue(material.id, material.qrTokenNonce)
          : app.get(PhysicalPassTokenService).issue(material.id, material.qrTokenNonce, material.qrTokenVersion);
      const path = mode === 'NOMINAL' ? 'nominal-access' : 'physical-passes';
      await post(`/api/v1/scanner/${staff.body.token}/${path}/scan`, null, { qrToken }, 'dt06-use').expect(200);
      if (mode === 'NOMINAL') {
        expect(await db.assistant.findFirst({ where: { eventId: f.id } })).toMatchObject({ responseStatus: 'PENDING' });
        expect(await db.invitation.findFirst({ where: { eventId: f.id } })).toMatchObject({
          responseStatus: 'PENDING'
        });
      } else {
        expect(await db.contact.count()).toBe(0);
        expect(await db.checkIn.count()).toBe(0);
      }
      await post(`/api/v1/events/${f.id}/close`, f.cookie, {}, 'dt06-close').expect(200);
      await request(app.getHttpServer()).get(`/api/v1/scanner/${staff.body.token}/session`).expect(401);
      expect((await activate(f, 'dt06-original').expect(200)).body).toEqual(first.body);
      await activate(f, 'dt06-different').expect(409);
      expect(await db.auditLog.count({ where: { eventId: f.id, action: 'EVENT_ACTIVATE' } })).toBe(1);
      await expect(
        db.event.update({ where: { id: f.id }, data: { accessActivationResultSnapshot: {} } })
      ).rejects.toThrow();
      await noFinance();
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'DT06A authorizes %s Staff by assignment in HTTP and SQL without exposing stored secrets',
    async (mode) => {
      const f = await fixture(mode),
        foreign = await fixture(mode);
      await prepare(f);
      await activate(f).expect(200);
      expect(await db.event.findUniqueOrThrow({ where: { id: f.id } })).toMatchObject({
        createdByUserId: f.provider.id,
        assignedPlannerUserId: f.planner.id
      });
      const outsider = await staffPlanner(f);
      const outsiderCookie = await login(outsider.email);
      const path = `/api/v1/events/${f.id}/staff-tokens`;
      for (const cookie of [outsiderCookie, foreign.cookie, foreign.adminCookie]) {
        await post(path, cookie, { alias: 'Forbidden' }).expect(404);
        await request(app.getHttpServer()).get(path).set('Cookie', cookie).expect(404);
      }
      await post(path, f.providerCookie, { alias: 'Provider' }).expect(403);
      await request(app.getHttpServer()).get(path).set('Cookie', f.providerCookie).expect(403);
      const created = await post(path, f.cookie, { alias: 'Assigned' }).expect(201);
      await post(path, f.adminCookie, { alias: 'Admin' }).expect(201);
      await expect(insertStaff(f.id, f.planner.id)).resolves.toBe(1);
      for (const actor of [outsider, foreign.planner, f.provider])
        await expect(insertStaff(f.id, actor.id)).rejects.toThrow('creator is not authorized');
      await db.user.update({ where: { id: f.planner.id }, data: { deletedAt: new Date() } });
      await expect(insertStaff(f.id, f.planner.id)).rejects.toThrow('creator is not authorized');
      const listed = await request(app.getHttpServer()).get(path).set('Cookie', f.adminCookie).expect(200);
      expect(listed.body).toHaveLength(3);
      const stored = await db.staffToken.findUniqueOrThrow({ where: { id: created.body.id as string } });
      const logs = await db.auditLog.findMany({ where: { eventId: f.id, action: 'STAFF_TOKEN_CREATE' } });
      expect(logs).toHaveLength(2);
      expect(logs.some((log) => log.actorId === f.planner.id)).toBe(true);
      for (const projection of [JSON.stringify(listed.body), JSON.stringify(logs)]) {
        expect(projection).not.toContain(created.body.token);
        expect(projection).not.toContain(stored.tokenDigestSha256);
        expect(projection).not.toMatch(/tokenDigest|sessionPath|password|whatsapp/iu);
      }
      expect(created.body).not.toHaveProperty('tokenDigestSha256');
      expect(created.body).not.toHaveProperty('createdByUserId');
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'DT06A reassigns %s Staff authorization without changing historical credentials',
    async (mode) => {
      const f = await fixture(mode);
      await prepare(f);
      await activate(f).expect(200);
      const path = `/api/v1/events/${f.id}/staff-tokens`;
      const original = await post(path, f.cookie, { alias: 'Original' }).expect(201);
      const historical = await db.staffToken.findUniqueOrThrow({ where: { id: original.body.id as string } });
      const replacement = await staffPlanner(f),
        cookie = await login(replacement.email);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/assignment`)
        .set('Origin', origin)
        .set('Cookie', f.providerCookie)
        .send({ assignedPlannerUserId: replacement.id })
        .expect(200);
      await post(path, f.cookie, { alias: 'Former' }).expect(404);
      await request(app.getHttpServer()).get(path).set('Cookie', f.cookie).expect(404);
      await expect(insertStaff(f.id, f.planner.id)).rejects.toThrow('creator is not authorized');
      await post(path, cookie, { alias: 'Replacement' }).expect(201);
      await expect(insertStaff(f.id, replacement.id)).resolves.toBe(1);
      expect(await db.staffToken.findUniqueOrThrow({ where: { id: historical.id } })).toEqual(historical);
      await request(app.getHttpServer()).get(`/api/v1/scanner/${original.body.token}/session`).expect(200);
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).createdByUserId).toBe(f.provider.id);
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'DT06A retains the three-active %s Staff limit under concurrent assigned Planner requests',
    async (mode) => {
      const f = await fixture(mode);
      await prepare(f);
      await activate(f).expect(200);
      const barrier = auditGate('STAFF_TOKEN_CREATE');
      try {
        const results = Promise.all(
          Array.from({ length: 4 }, (_, index) =>
            post(`/api/v1/events/${f.id}/staff-tokens`, f.cookie, { alias: `Door ${index}` }).then((r) => r)
          )
        );
        await barrier.entered;
        await waitForLock();
        barrier.release();
        const responses = await results;
        expect(responses.map((r) => r.status).sort()).toEqual([201, 201, 201, 409]);
        expect(responses.find((r) => r.status === 409)?.body.code).toBe('STAFF_TOKEN_LIMIT_REACHED');
      } finally {
        barrier.release();
        barrier.restore();
      }
      expect(await db.staffToken.count({ where: { eventId: f.id, expiredAt: null } })).toBe(3);
      expect(await db.auditLog.count({ where: { eventId: f.id, action: 'STAFF_TOKEN_CREATE' } })).toBe(3);
      await expect(insertStaff(f.id, f.planner.id)).rejects.toThrow('active limit reached');
    }
  );

  it('keeps incomplete basics DRAFT, missing credentials CONFIGURED, and demotes READY after new CSV identities', async () => {
    const f = await fixture('NOMINAL');
    await patch(f, { name: null }).expect(200);
    await addPerson(f);
    expect((await readiness(f)).body.blockers).toContain('EVENT_BASIC_DATA_INCOMPLETE');
    await patch(f, { name: 'Accesos' }).expect(200);
    expect((await readiness(f)).body.blockers).toContain('EVENT_ACCESS_CREDENTIAL_MISSING');
    const a = await db.assistant.findFirstOrThrow({ where: { eventId: f.id } });
    await issue(f, a.id).expect(201);
    expect((await readiness(f)).body.complete).toBe(true);
    await patch(f, { name: null }).expect(200);
    expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('DRAFT');
    await patch(f, { name: 'Accesos' }).expect(200);
    const preview = await request(app.getHttpServer())
      .post(`/api/v1/events/${f.id}/contacts/import/preview`)
      .set('Cookie', f.cookie)
      .set('Origin', origin)
      .attach('file', Buffer.from('name,whatsapp_phone,group\nDuplicado,,\n'), 'contacts.csv');
    expect(preview.status, JSON.stringify(preview.body)).toBe(201);
    const committed = await post(
      `/api/v1/events/${f.id}/contacts/import/commit`,
      f.cookie,
      { previewId: preview.body.previewId },
      'dt06-csv'
    );
    expect(committed.status, JSON.stringify(committed.body)).toBe(200);
    expect((await readiness(f)).body.blockers).toContain('EVENT_ACCESS_CREDENTIAL_MISSING');
    expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('CONFIGURED');
    const pending = await db.assistant.findFirstOrThrow({ where: { eventId: f.id, accessCredentials: { none: {} } } });
    await issue(f, pending.id).expect(201);
    expect((await readiness(f)).body).toMatchObject({ complete: true, activeMaterialCount: 2 });
  });

  it('counts duplicate names by Assistant and replaces a revoked credential without duplicating rights', async () => {
    const f = await fixture('NOMINAL');
    const first = await prepare(f);
    await prepare(f);
    await revokeNominal(f, first.id).expect(200);
    expect((await readiness(f)).body).toMatchObject({ complete: false, activeMaterialCount: 1 });
    expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('CONFIGURED');
    await issue(f, first.assistantId!).expect(201);
    expect((await readiness(f)).body).toMatchObject({ complete: true, activeMaterialCount: 2 });
    await activate(f).expect(200);
    expect(await db.assistantAccessCredential.count()).toBe(3);
  });

  it('uses complete anonymous history, frees revoked capacity, never recycles folios and demotes total revocation', async () => {
    const f = await fixture('ANONYMOUS');
    const first = await prepare(f),
      second = await prepare(f);
    await revokePhysical(f, first.id).expect(200);
    await patch(f, { capacity: 1 }).expect(200);
    expect((await readiness(f)).body).toMatchObject({ complete: true, activeMaterialCount: 1, capacity: 1 });
    await revokePhysical(f, second.id).expect(200);
    expect((await readiness(f)).body.blockers).toContain('EVENT_ACCESS_MATERIAL_MISSING');
    expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('CONFIGURED');
    const next = await prepare(f);
    expect(next.passNumber).toBe(3);
    await activate(f).expect(200);
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'authorizes minimum %s reads by tenant/assignment and Provider context only',
    async (mode) => {
      const f = await fixture(mode),
        other = await fixture(mode);
      const baseline = await db.event.findUniqueOrThrow({ where: { id: f.id } });
      const read = await readiness(f);
      expect(Object.keys(read.body).sort()).toEqual([
        'accessMode',
        'activeMaterialCount',
        'blockers',
        'capacity',
        'complete'
      ]);
      expect((await readiness(f, true)).body).toEqual(read.body);
      expect(
        (
          await request(app.getHttpServer())
            .get(`/api/v1/events/${f.id}/access-readiness`)
            .set('Cookie', f.adminCookie)
            .expect(200)
        ).body
      ).toEqual(read.body);
      await request(app.getHttpServer())
        .get(`/api/v1/events/${f.id}/access-readiness`)
        .set('Cookie', other.cookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/admin/clients/${other.client.id}/events/${f.id}/access-readiness`)
        .set('Cookie', f.providerCookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/events/${f.id}/access-readiness`)
        .set('Cookie', f.providerCookie)
        .expect(403);
      await post(`/api/v1/events/${f.id}/activate`, f.cookie, {}, randomUUID()).expect(403);
      await post(
        `/api/v1/admin/clients/${other.client.id}/events/${f.id}/activate`,
        f.providerCookie,
        {},
        randomUUID()
      ).expect(404);
      const outsider = await db.user.create({
        data: {
          clientId: f.client.id,
          role: 'ORGANIZATION_PLANNER',
          email: `${randomUUID()}@example.com`,
          passwordHash: f.provider.passwordHash
        }
      });
      await request(app.getHttpServer())
        .get(`/api/v1/events/${f.id}/access-readiness`)
        .set('Cookie', await login(outsider.email))
        .expect(404);
      expect(await db.event.findUniqueOrThrow({ where: { id: f.id } })).toEqual(baseline);
      for (const path of [
        '/api/v1/events/{eventId}/access-readiness',
        '/api/v1/admin/clients/{clientId}/events/{eventId}/access-readiness'
      ])
        expect(createOpenApiDocument(app).paths[path]?.get).toBeDefined();
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'revalidates corrupt capacity, prior entries, Planner and inactive service in %s',
    async (mode) => {
      const f = await fixture(mode);
      await prepare(f);
      await prepare(f);
      await corrupt(async (tx) => {
        await tx.event.update({ where: { id: f.id }, data: { capacity: 1 } });
      });
      expect((await readiness(f)).body.blockers).toContain('EVENT_ACCESS_CAPACITY_EXCEEDED');
      await activate(f).expect(409);
      await corrupt(async (tx) => {
        await tx.event.update({ where: { id: f.id }, data: { capacity: 3 } });
      });
      await db.service.update({ where: { id: f.service.id }, data: { isActive: false } });
      await activate(f).expect(409);
      expect((await readiness(f)).body.blockers).toContain('EVENT_SERVICE_NOT_AVAILABLE');
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('CONFIGURED');
      await db.service.update({ where: { id: f.service.id }, data: { isActive: true } });
      await patch(f, { name: 'Restored preparation' }).expect(200);
      await db.user.update({ where: { id: f.planner.id }, data: { deletedAt: new Date() } });
      await activate(f).expect(409);
      expect((await readiness(f, true)).body.blockers).toContain('EVENT_PLANNER_ASSIGNMENT_INVALID');
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('CONFIGURED');
      await db.user.update({ where: { id: f.planner.id }, data: { deletedAt: null } });
      if (mode === 'ANONYMOUS')
        await corrupt(async (tx) => {
          const pass = await tx.physicalPass.findFirstOrThrow({ where: { eventId: f.id } });
          await tx.physicalPass.update({
            where: { id: pass.id },
            data: {
              usedAt: new Date(),
              usedByStaffTokenId: randomUUID(),
              useIdempotencyKey: randomUUID(),
              useRequestSignature: 'a'.repeat(64),
              useResultSnapshot: {}
            }
          });
        });
      else {
        const a = await db.assistant.findFirstOrThrow({ where: { eventId: f.id } });
        await corrupt(async (tx) => {
          await tx.checkIn.create({
            data: {
              eventId: f.id,
              assistantId: a.id,
              invitationId: a.invitationId,
              staffTokenId: randomUUID(),
              createdAt: new Date(0),
              checkedInAt: new Date(),
              revertedAt: new Date(),
              revertedByUserId: f.provider.id,
              revertIdempotencyKey: randomUUID(),
              idempotencyKey: randomUUID(),
              requestSignature: 'a'.repeat(64),
              resultSnapshot: {}
            }
          });
        });
      }
      expect((await readiness(f)).body.blockers).toContain('EVENT_ACCESS_PRIOR_ENTRY');
      await activate(f).expect(409);
      await noFinance();
    }
  );

  it('rejects stale nominal material after deletion/anonymization and incompatible anonymous material', async () => {
    const f = await fixture('NOMINAL');
    const material = await prepare(f);
    const contact = await db.contact.findFirstOrThrow({ where: { eventId: f.id } });
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${f.id}/contacts/${contact.id}`)
      .set('Origin', origin)
      .set('Cookie', f.cookie)
      .expect(204);
    expect((await readiness(f)).body.complete).toBe(false);
    await activate(f).expect(409);
    expect(await db.assistantAccessCredential.findUnique({ where: { id: material.id } })).not.toBeNull();
    const g = await fixture('NOMINAL');
    await prepare(g);
    await corrupt(async (tx) => {
      await tx.contact.updateMany({
        where: { eventId: g.id },
        data: { name: null, whatsappPhoneNormalized: null, anonymizedAt: new Date() }
      });
    });
    expect((await readiness(g)).body.blockers).toContain('EVENT_ACCESS_MATERIAL_INCONSISTENT');
    const h = await fixture('ANONYMOUS');
    await prepare(h);
    await corrupt(async (tx) => {
      await tx.contact.create({ data: { eventId: h.id, name: 'Incompatible' } });
    });
    expect((await readiness(h)).body.blockers).toContain('EVENT_ACCESS_MATERIAL_INCONSISTENT');
    await activate(h).expect(409);
  });

  it.each(['TABLE', 'SEAT'] as const)(
    'requires and accepts PENDING nominal assignments in %s without RSVP changes',
    async (mode) => {
      const f = await fixture('NOMINAL');
      const material = await prepare(f);
      await patch(f, { floorplanEnabled: true }).expect(200);
      expect((await readiness(f)).body.blockers).toContain('EVENT_FLOORPLAN_MISSING');
      const table = await tableFixture(f, mode);
      expect((await readiness(f)).body.blockers).toContain('EVENT_ACCESS_SEATING_INCOMPLETE');
      if (mode === 'SEAT') {
        await post(
          `/api/v1/events/${f.id}/seating/assign-seats`,
          f.cookie,
          { assignments: [{ assistantId: material.assistantId, seatId: table.seatId }] },
          randomUUID()
        ).expect(201);
      } else {
        await post(
          `/api/v1/events/${f.id}/seating/assign`,
          f.cookie,
          { assistantIds: [material.assistantId], tableShapeId: table.id },
          randomUUID()
        ).expect(201);
      }
      expect((await readiness(f)).body.complete).toBe(true);
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('READY_TO_ACTIVATE');
      const corruptField = mode === 'SEAT' ? { isBlocked: true } : { deletedAt: new Date() };
      await corrupt(async (tx) => {
        if (mode === 'SEAT') await tx.floorplanSeat.update({ where: { id: table.seatId! }, data: corruptField });
        else await tx.floorplanShape.update({ where: { id: table.id }, data: corruptField });
      });
      await activate(f).expect(409);
      await corrupt(async (tx) => {
        if (mode === 'SEAT')
          await tx.floorplanSeat.update({ where: { id: table.seatId! }, data: { isBlocked: false } });
        else await tx.floorplanShape.update({ where: { id: table.id }, data: { deletedAt: null } });
      });
      await activate(f).expect(200);
      const staff = await post(`/api/v1/events/${f.id}/staff-tokens`, f.cookie, { alias: 'Seated door' }).expect(201);
      const token = app.get(NominalAccessTokenService).issue(material.id, material.qrTokenNonce);
      const ingress = await post(
        `/api/v1/scanner/${staff.body.token}/nominal-access/scan`,
        null,
        { qrToken: token },
        randomUUID()
      ).expect(200);
      expect(ingress.body.table.id).toBe(table.id);
      if (mode === 'SEAT') expect(ingress.body.seat.id).toBe(table.seatId);
    }
  );

  it('rejects SEAT for anonymous and requires current table/image without counting revoked table rights', async () => {
    const f = await fixture('ANONYMOUS');
    await patch(f, { floorplanEnabled: true }).expect(200);
    const t = await tableFixture(f);
    const p = await prepare(f, t.id);
    await revokePhysical(f, p.id).expect(200);
    const current = await prepare(f, t.id);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/floorplan/seating-mode`)
      .set('Cookie', f.providerCookie)
      .set('Origin', origin)
      .send({ seatingMode: 'SEAT' })
      .expect(409);
    await corrupt(async (tx) => {
      await tx.floorplan.update({ where: { id: t.floorplanId }, data: { seatingMode: 'SEAT' } });
    });
    expect((await readiness(f)).body.blockers).toContain('EVENT_FLOORPLAN_INCONSISTENT');
    await activate(f).expect(409);
    await corrupt(async (tx) => {
      await tx.floorplan.update({ where: { id: t.floorplanId }, data: { seatingMode: 'TABLE' } });
      await tx.fileAsset.update({
        where: { id: t.imageAssetId },
        data: { status: 'FAILED', failureCode: 'DT06_TEST' }
      });
    });
    expect((await readiness(f)).body.blockers).toContain('EVENT_FLOORPLAN_IMAGE_NOT_READY');
    await corrupt(async (tx) => {
      await tx.fileAsset.update({ where: { id: t.imageAssetId }, data: { status: 'READY', failureCode: null } });
    });
    await activate(f).expect(200);
    const staff = await post(`/api/v1/events/${f.id}/staff-tokens`, f.cookie, { alias: 'Table door' }).expect(201);
    const token = app.get(PhysicalPassTokenService).issue(current.id, current.qrTokenNonce);
    const ingress = await post(
      `/api/v1/scanner/${staff.body.token}/physical-passes/scan`,
      null,
      { qrToken: token },
      randomUUID()
    ).expect(200);
    expect(ingress.body.table.id).toBe(t.id);
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'guards direct SQL first activation of %s and rolls back audit failures',
    async (mode) => {
      const f = await fixture(mode);
      await db.event.update({ where: { id: f.id }, data: { status: 'READY_TO_ACTIVATE' } });
      await expect(
        db.$transaction(async (tx) => {
          await tx.event.update({
            where: { id: f.id },
            data: {
              status: 'ACTIVE',
              activatedAt: new Date(),
              activatedByUserId: f.provider.id,
              activatedServiceId: f.service.id,
              activationIdempotencyKey: 'sql-invalid',
              accessActivationResultSnapshot: { id: f.id, status: 'ACTIVE', activationIdempotencyKey: 'sql-invalid' }
            }
          });
        }, CRITICAL_TRANSACTION_OPTIONS)
      ).rejects.toThrow('EVENT_ACCESS_CONTROL_NOT_READY');
      await prepare(f);
      await expect(
        db.$transaction(async (tx) => {
          await tx.event.update({
            where: { id: f.id },
            data: {
              status: 'ACTIVE',
              activatedAt: new Date(),
              activatedByUserId: f.provider.id,
              activatedServiceId: f.service.id,
              activationIdempotencyKey: 'sql-bad-response',
              accessActivationResultSnapshot: {
                id: f.id,
                status: 'ACTIVE',
                activationIdempotencyKey: 'sql-bad-response'
              }
            }
          });
        }, CRITICAL_TRANSACTION_OPTIONS)
      ).rejects.toThrow('EVENT_ACCESS_ACTIVATION_SNAPSHOT_INVALID');
      const spy = vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('Audit rollback'));
      await activate(f, 'dt06-rollback').expect(500);
      spy.mockRestore();
      expect(await db.event.findUnique({ where: { id: f.id } })).toMatchObject({
        activatedAt: null,
        accessActivationResultSnapshot: null
      });
      await activate(f, 'dt06-rollback').expect(200);
      await noFinance();
      const g = await fixture(mode);
      await prepare(g);
      await activate(g, 'dt06-rollback').expect(409);
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'serializes two %s activations with identical and distinct keys',
    async (mode) => {
      const f = await fixture(mode);
      await prepare(f);
      const same = await Promise.all([
        activate(f, 'dt06-concurrent').then((r) => r),
        activate(f, 'dt06-concurrent').then((r) => r)
      ]);
      expect(same.map((r) => r.status)).toEqual([200, 200]);
      expect(same[0]!.body).toEqual(same[1]!.body);
      const g = await fixture(mode);
      await prepare(g);
      const different = await Promise.all([
        activate(g, 'dt06-left').then((r) => r),
        activate(g, 'dt06-right').then((r) => r)
      ]);
      expect(different.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await db.auditLog.count({ where: { action: 'EVENT_ACTIVATE' } })).toBe(2);
    }
  );

  // Each barrier is inside the committing transaction; pg_stat_activity proves the
  // other request actually waits on PostgreSQL rather than merely starting later.
  for (const mode of ['NOMINAL', 'ANONYMOUS'] as const)
    for (const first of ['activate', 'revoke'] as const)
      it(`serializes real ${mode} activation/revocation with ${first} first`, async () => {
        const f = await fixture(mode);
        const m = await prepare(f);
        const gate = auditGate(
          first === 'activate'
            ? 'EVENT_ACTIVATE'
            : mode === 'NOMINAL'
              ? 'NOMINAL_ACCESS_REVOKE'
              : 'PHYSICAL_PASS_REVOKE'
        );
        const rev = () => (mode === 'NOMINAL' ? revokeNominal(f, m.id) : revokePhysical(f, m.id));
        const winner = (first === 'activate' ? activate(f) : rev()).then((r) => r);
        await gate.entered;
        const waiter = (first === 'activate' ? rev() : activate(f)).then((r) => r);
        try {
          await waitForLock();
        } finally {
          gate.release();
        }
        const results = await Promise.all([winner, waiter]);
        gate.restore();
        expect(results[0]!.status).toBe(200);
        expect(results[1]!.status).toBe(first === 'activate' ? 200 : 409);
        const e = await db.event.findUniqueOrThrow({ where: { id: f.id } });
        expect(e.activatedAt !== null).toBe(first === 'activate');
        await noFinance();
      });

  it.each(['issue', 'contact', 'delete', 'generate', 'table', 'capacity'] as const)(
    'coordinates activation against %s with a verified Event lock',
    async (kind) => {
      const f = await fixture(kind === 'generate' ? 'ANONYMOUS' : 'NOMINAL');
      const m = await prepare(f);
      let table: Awaited<ReturnType<typeof tableFixture>> | null = null;
      if (kind === 'table') {
        await patch(f, { floorplanEnabled: true }).expect(200);
        table = await tableFixture(f);
        await post(
          `/api/v1/events/${f.id}/seating/assign`,
          f.cookie,
          { assistantIds: [m.assistantId], tableShapeId: table.id },
          randomUUID()
        ).expect(201);
      }
      if (kind === 'issue') {
        await revokeNominal(f, m.id).expect(200);
        const gate = auditGate('NOMINAL_ACCESS_ISSUE');
        const emission = issue(f, m.assistantId!).then((r) => r);
        await gate.entered;
        const act = activate(f).then((r) => r);
        try {
          await waitForLock();
        } finally {
          gate.release();
        }
        expect((await emission).status).toBe(201);
        expect((await act).status).toBe(200);
        gate.restore();
        return;
      }
      const gate = auditGate('EVENT_ACTIVATE');
      const act = activate(f).then((r) => r);
      await gate.entered;
      let mutation: Promise<request.Response>;
      if (kind === 'contact') mutation = addPerson(f).then((r) => r);
      else if (kind === 'delete') {
        const c = await db.contact.findFirstOrThrow({ where: { eventId: f.id } });
        mutation = request(app.getHttpServer())
          .delete(`/api/v1/events/${f.id}/contacts/${c.id}`)
          .set('Origin', origin)
          .set('Cookie', f.cookie)
          .then((r) => r);
      } else if (kind === 'generate') mutation = generate(f).then((r) => r);
      else if (kind === 'table')
        mutation = request(app.getHttpServer())
          .patch(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/floorplan/shapes/${table!.id}`)
          .set('Origin', origin)
          .set('Cookie', f.providerCookie)
          .send({ capacity: 1 })
          .then((r) => r);
      else mutation = patch(f, { capacity: 1 }).then((r) => r);
      try {
        await waitForLock();
      } finally {
        gate.release();
      }
      expect((await act).status).toBe(200);
      const result = await mutation;
      gate.restore();
      expect(result.status).toBe(kind === 'generate' || kind === 'table' ? 200 : 409);
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('ACTIVE');
    }
  );

  it('enforces nominal issuance and capacity reduction in API and direct SQL', async () => {
    const f = await fixture('NOMINAL');
    await patch(f, { capacity: 1 }).expect(200);
    await prepare(f);
    const second = await addPerson(f).expect(201);
    const a = await db.assistant.findFirstOrThrow({ where: { invitation: { contactId: second.body.id as string } } });
    await issue(f, a.id)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_ACCESS_CAPACITY_EXCEEDED'));
    await expect(
      db.assistantAccessCredential.create({
        data: {
          eventId: f.id,
          assistantId: a.id,
          issuedByUserId: f.planner.id,
          qrTokenNonce: app.get(NominalAccessTokenService).createNonce()
        }
      })
    ).rejects.toThrow('EVENT_ACCESS_CAPACITY_EXCEEDED');
    await patch(f, { capacity: 2 }).expect(200);
    await issue(f, a.id).expect(201);
    await patch(f, { capacity: 1 }).expect(409);
    await expect(db.event.update({ where: { id: f.id }, data: { capacity: 1 } })).rejects.toThrow(
      'EVENT_ACCESS_CAPACITY_EXCEEDED'
    );
    expect((await readiness(f)).body).toMatchObject({ complete: true, activeMaterialCount: 2 });
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'preserves the %s activation snapshot after real cancellation',
    async (mode) => {
      const f = await fixture(mode);
      await prepare(f);
      const first = await activate(f, 'dt06-cancel-replay').expect(200);
      const staff = await post(`/api/v1/events/${f.id}/staff-tokens`, f.cookie, { alias: 'Cancel door' }).expect(201);
      await post(`/api/v1/events/${f.id}/cancel`, f.cookie, {}, randomUUID()).expect(200);
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('CANCELLED');
      expect((await activate(f, 'dt06-cancel-replay').expect(200)).body).toEqual(first.body);
      await request(app.getHttpServer()).get(`/api/v1/scanner/${staff.body.token}/session`).expect(401);
      await noFinance();
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'demotes suspended %s preparation and preserves an activated Event on later ineligibility',
    async (mode) => {
      const f = await fixture(mode);
      await prepare(f);
      await db.client.update({
        where: { id: f.client.id },
        data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: 'DT06_TEST' }
      });
      expect((await readiness(f, true)).body.blockers).toContain('EVENT_ACCESS_CONTROL_CONTEXT_INVALID');
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('CONFIGURED');
      await activate(f).expect(409);
      await db.client.update({
        where: { id: f.client.id },
        data: { status: 'ACTIVE', suspendedAt: null, suspensionReason: null }
      });
      await activate(f).expect(200);
      await db.service.update({ where: { id: f.service.id }, data: { isActive: false } });
      expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('ACTIVE');
      await noFinance();
    }
  );

  it.each(['companion', 'response', 'version'] as const)(
    'rejects corrupt nominal %s material at HTTP and SQL activation gates',
    async (kind) => {
      const f = await fixture('NOMINAL');
      const m = await prepare(f);
      if (kind === 'version') {
        await expect(
          db.assistantAccessCredential.update({ where: { id: m.id }, data: { qrTokenVersion: 2 } })
        ).rejects.toThrow();
        expect((await readiness(f)).body.complete).toBe(true);
        await activate(f).expect(200);
        return;
      }
      await corrupt(async (tx) => {
        if (kind === 'response')
          await tx.assistant.update({ where: { id: m.assistantId! }, data: { responseStatus: 'CONFIRMED' } });
        else {
          const a = await tx.assistant.findUniqueOrThrow({ where: { id: m.assistantId! } });
          await tx.assistant.create({
            data: { eventId: f.id, invitationId: a.invitationId, name: 'Extra', isPrimary: false }
          });
        }
      });
      expect((await readiness(f)).body.blockers).toContain('EVENT_ACCESS_MATERIAL_INCONSISTENT');
      await activate(f).expect(409);
      await expect(
        db.$transaction(async (tx) => {
          await tx.event.update({
            where: { id: f.id },
            data: {
              status: 'ACTIVE',
              activatedAt: new Date(),
              activatedByUserId: f.provider.id,
              activatedServiceId: f.service.id,
              activationIdempotencyKey: 'dt06-corrupt-sql',
              accessActivationResultSnapshot: {
                id: f.id,
                status: 'ACTIVE',
                activationIdempotencyKey: 'dt06-corrupt-sql'
              }
            }
          });
        }, CRITICAL_TRANSACTION_OPTIONS)
      ).rejects.toThrow('EVENT_ACCESS_CONTROL_NOT_READY');
    }
  );

  it.each(['contact', 'delete', 'generate', 'table', 'capacity'] as const)(
    'revalidates when %s commits before activation',
    async (kind) => {
      const f = await fixture(kind === 'generate' ? 'ANONYMOUS' : 'NOMINAL');
      const m = await prepare(f);
      let table: Awaited<ReturnType<typeof tableFixture>> | null = null;
      if (kind === 'table') {
        await patch(f, { floorplanEnabled: true }).expect(200);
        table = await tableFixture(f);
        await post(
          `/api/v1/events/${f.id}/seating/assign`,
          f.cookie,
          { assistantIds: [m.assistantId], tableShapeId: table.id },
          randomUUID()
        ).expect(201);
      }
      const action = {
        contact: 'CONTACT_CREATE',
        delete: 'CONTACT_DELETE',
        generate: 'PHYSICAL_PASS_GENERATE',
        table: 'FLOORPLAN_SHAPE_UPDATE',
        capacity: 'EVENT_UPDATE'
      }[kind];
      const gate = auditGate(action);
      let mutation: Promise<request.Response>;
      if (kind === 'contact') mutation = addPerson(f).then((r) => r);
      else if (kind === 'delete') {
        const c = await db.contact.findFirstOrThrow({ where: { eventId: f.id } });
        mutation = request(app.getHttpServer())
          .delete(`/api/v1/events/${f.id}/contacts/${c.id}`)
          .set('Origin', origin)
          .set('Cookie', f.cookie)
          .then((r) => r);
      } else if (kind === 'generate') mutation = generate(f).then((r) => r);
      else if (kind === 'table')
        mutation = request(app.getHttpServer())
          .patch(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/floorplan/shapes/${table!.id}`)
          .set('Cookie', f.providerCookie)
          .set('Origin', origin)
          .send({ capacity: 1 })
          .then((r) => r);
      else mutation = patch(f, { capacity: 1 }).then((r) => r);
      await gate.entered;
      const act = activate(f).then((r) => r);
      try {
        await waitForLock();
      } finally {
        gate.release();
      }
      expect((await mutation).status).toBe(kind === 'contact' ? 201 : kind === 'delete' ? 204 : 200);
      expect((await act).status).toBe(kind === 'contact' || kind === 'delete' ? 409 : 200);
      gate.restore();
      await noFinance();
    }
  );

  async function fixture(mode: Mode) {
    const passwordHash = await hashPassword(password);
    const client = await db.client.create({
      data: { type: 'ORGANIZATION', operatingProfile: 'MANAGED', name: 'DT06' }
    });
    const provider = await db.user.create({
      data: { role: 'PLATFORM_ADMIN', email: `${randomUUID()}@example.com`, passwordHash }
    });
    const planner = await db.user.create({
      data: { role: 'ORGANIZATION_PLANNER', clientId: client.id, email: `${randomUUID()}@example.com`, passwordHash }
    });
    const service = await db.service.upsert({
      where: { code: 'ACCESS_CONTROL' },
      create: { code: 'ACCESS_CONTROL' },
      update: { isActive: true }
    });
    const admin = await db.user.create({
      data: { role: 'ORGANIZATION_ADMIN', clientId: client.id, email: `${randomUUID()}@example.com`, passwordHash }
    });
    const adminCookie = await login(admin.email);
    const cookie = await login(planner.email),
      providerCookie = await login(provider.email);
    const created = await post(`/api/v1/admin/clients/${client.id}/events/managed`, providerCookie, {
      name: 'DT06',
      serviceCode: 'ACCESS_CONTROL',
      accessMode: mode,
      capacity: 3,
      assignedPlannerUserId: planner.id
    }).expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${client.id}/events/${id}`)
      .set('Cookie', providerCookie)
      .set('Origin', origin)
      .send({ socialType: 'OTHER', eventDateTime: '2035-01-01T18:00:00Z', timeZone: 'America/Mexico_City' })
      .expect(200);
    return { id, mode, client, provider, planner, service, cookie, providerCookie, adminCookie };
  }
  function staffPlanner(f: Fixture) {
    return db.user.create({
      data: {
        role: 'ORGANIZATION_PLANNER',
        clientId: f.client.id,
        email: `${randomUUID()}@example.com`,
        passwordHash: f.planner.passwordHash
      }
    });
  }
  function insertStaff(eventId: string, actorId: string) {
    return db.$executeRaw`INSERT INTO staff_token
      (event_id, alias, token_digest_sha256, token_version, created_by_user_id)
      VALUES (${eventId}::uuid, 'SQL assigned Staff', ${randomUUID().replaceAll('-', '').repeat(2)}, 1, ${actorId}::uuid)`;
  }
  async function login(email: string) {
    const r = await post('/api/v1/auth/login', null, { email, password }).expect(200);
    const raw = r.headers['set-cookie'];
    return (Array.isArray(raw) ? raw[0] : raw)!.split(';')[0]!;
  }
  function post(path: string, cookie: string | null, body: object, key?: string) {
    const r = request(app.getHttpServer()).post(path).set('Origin', origin);
    if (cookie) r.set('Cookie', cookie);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body);
  }
  function activate(f: Fixture, key: string = randomUUID()) {
    return post(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/activate`, f.providerCookie, {}, key);
  }
  function readiness(f: Fixture, provider = false) {
    return request(app.getHttpServer())
      .get(
        provider
          ? `/api/v1/admin/clients/${f.client.id}/events/${f.id}/access-readiness`
          : `/api/v1/events/${f.id}/access-readiness`
      )
      .set('Cookie', provider ? f.providerCookie : f.cookie)
      .expect(200);
  }
  function patch(f: Fixture, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${f.client.id}/events/${f.id}`)
      .set('Cookie', f.providerCookie)
      .set('Origin', origin)
      .send(body);
  }
  function addPerson(f: Fixture) {
    return post(`/api/v1/events/${f.id}/contacts`, f.cookie, { name: 'Duplicado' });
  }
  function issue(f: Fixture, assistantId: string) {
    return post(
      `/api/v1/events/${f.id}/nominal-access-credentials/assistants/${assistantId}/issue`,
      f.cookie,
      {},
      randomUUID()
    );
  }
  function generate(f: Fixture, tableShapeId?: string) {
    return post(
      `/api/v1/admin/clients/${f.client.id}/events/${f.id}/physical-passes/generate`,
      f.providerCookie,
      { quantity: 1, ...(tableShapeId ? { tableShapeId } : {}) },
      randomUUID()
    );
  }
  function revokeNominal(f: Fixture, id: string) {
    return post(
      `/api/v1/events/${f.id}/nominal-access-credentials/${id}/revoke`,
      f.cookie,
      { revocationReasonCode: 'OPERATOR_REQUEST' },
      randomUUID()
    );
  }
  function revokePhysical(f: Fixture, id: string) {
    return post(
      `/api/v1/events/${f.id}/physical-passes/${id}/revoke`,
      f.cookie,
      { revocationReasonCode: 'OPERATOR_REQUEST' },
      randomUUID()
    );
  }
  async function prepare(f: Fixture, tableShapeId?: string) {
    if (f.mode === 'ANONYMOUS') {
      const r = await generate(f, tableShapeId).expect(200);
      const p = await db.physicalPass.findUniqueOrThrow({ where: { id: r.body.passes[0].id as string } });
      return { ...p, assistantId: null };
    }
    const c = await addPerson(f).expect(201);
    const a = await db.assistant.findFirstOrThrow({ where: { invitation: { contactId: c.body.id as string } } });
    const r = await issue(f, a.id).expect(201);
    const credential = await db.assistantAccessCredential.findUniqueOrThrow({ where: { id: r.body.id as string } });
    return { ...credential, passNumber: null };
  }
  async function tableFixture(f: Fixture, mode: 'TABLE' | 'SEAT' = 'TABLE') {
    const floorplanId = randomUUID();
    const result = await db.$transaction(async (tx) => {
      const asset = await tx.fileAsset.create({
        data: {
          clientId: f.client.id,
          eventId: f.id,
          ownerType: 'FLOORPLAN',
          ownerId: floorplanId,
          fileType: 'FLOORPLAN_IMAGE',
          storageProvider: 'LOCAL',
          storageKey: `dt06/${randomUUID()}.png`,
          originalName: 'floorplan.png',
          mimeType: 'image/png',
          sizeBytes: 100,
          checksumSha256: 'a'.repeat(64),
          width: 100,
          height: 100,
          createdByUserId: f.provider.id,
          status: 'READY',
          associatedAt: new Date()
        }
      });
      await tx.floorplan.create({
        data: { id: floorplanId, eventId: f.id, imageAssetId: asset.id, seatingMode: mode }
      });
      const t = await tx.floorplanShape.create({
        data: {
          floorplanId,
          eventId: f.id,
          kind: 'TABLE',
          geometry: 'RECTANGLE',
          name: 'Mesa',
          normalizedName: 'mesa',
          capacity: mode === 'SEAT' ? 0 : 3,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          rotation: 0
        }
      });
      const seat =
        mode === 'SEAT'
          ? await tx.floorplanSeat.create({
              data: {
                eventId: f.id,
                floorplanId,
                floorplanShapeId: t.id,
                label: '1',
                normalizedLabel: '1',
                x: 0.2,
                y: 0.2
              }
            })
          : null;
      return { ...t, seatId: seat?.id, imageAssetId: asset.id };
    });
    await db.$transaction((tx) => recomputeAccessControlPreparationStatus(tx, f.id), CRITICAL_TRANSACTION_OPTIONS);
    return result;
  }
  function corrupt(work: (tx: import('../src/generated/prisma/client').Prisma.TransactionClient) => Promise<void>) {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await work(tx);
    });
  }
  async function noFinance() {
    expect(await db.ledgerEntry.count()).toBe(0);
    expect(await db.receipt.count()).toBe(0);
    expect(await db.servicePrice.count()).toBe(0);
  }
  function auditGate(action: string) {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => {
        enter = r;
      }),
      held = new Promise<void>((r) => {
        release = r;
      });
    const audit = app.get(AuditService),
      original = audit.record.bind(audit);
    const spy = vi.spyOn(audit, 'record').mockImplementation(async (entry, tx) => {
      const result = await original(entry, tx);
      if (entry.action === action) {
        enter();
        await held;
      }
      return result;
    });
    return { entered, release, restore: () => spy.mockRestore() };
  }
  async function waitForLock() {
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      const [r] = await db.$queryRaw<
        { present: boolean }[]
      >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock') AS present`;
      if (r?.present) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error('Competing request did not wait on PostgreSQL');
  }
  async function reset() {
    await db.$executeRawUnsafe(
      'BEGIN; SET LOCAL session_replication_role = replica; TRUNCATE client, app_user, service, event, audit_log, auth_session, receipt, ledger_entry, service_price, finance_balance RESTART IDENTITY CASCADE; COMMIT;'
    );
  }
});
