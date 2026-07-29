import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  AssistantResponseStatus,
  ClientStatus,
  ClientType,
  EventStatus,
  InvitationMode,
  InvitationResponseStatus,
  LedgerMovementType,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { createOpenApiDocument } from '../src/openapi/openapi';
import { ScannerService } from '../src/scanner/scanner.service';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Scanner and CheckIn', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;
  let scanner: ScannerService;
  let staffTechnical: StaffTokenTechnicalService;
  let invitationTokens: InvitationTokenService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-scanner-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
    scanner = app.get(ScannerService);
    staffTechnical = app.get(StaffTokenTechnicalService);
    invitationTokens = app.get(InvitationTokenService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('scans and searches exactly with a private projection, then checks in partially and replays exactly', async () => {
    const fixture = await createFixture();
    const qrToken = issueQr(fixture.invitationId, fixture.qrNonce);

    const scan = await scannerPost(fixture.staffToken, 'scan', { qrToken }).expect(200);
    expect(scan.body).toMatchObject({
      status: 'AVAILABLE',
      invitation: { id: fixture.invitationId, mode: InvitationMode.FAMILY_NOMINAL },
      confirmedCount: 2,
      pendingCount: 2,
      checkedInCount: 0
    });
    expect(scan.body.pendingAssistants.map(({ name }: { name: string }) => name)).toEqual([
      'María López',
      'José López'
    ]);

    const normalized = await scannerPost(fixture.staffToken, 'search', { query: '  mARÍA   lÓPEZ ' }).expect(200);
    expect(normalized.body.status).toBe('MATCHES');
    expect(normalized.body.results).toHaveLength(1);
    await scannerPost(fixture.staffToken, 'search', { query: 'María' })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ status: 'NO_MATCHES', results: [] }));
    await scannerPost(fixture.staffToken, 'search', { query: 'Maria López' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('NO_MATCHES'));

    const key = `scanner-${randomUUID()}`;
    const first = await scannerCheckIn(fixture.staffToken, key, fixture.invitationId, [fixture.primaryId]).expect(200);
    expect(first.body).toMatchObject({
      status: 'CHECKED_IN',
      invitationId: fixture.invitationId,
      remainingPendingCount: 1
    });
    expect(first.body.checkedIn).toHaveLength(1);
    expect(first.body.remainingPendingAssistants).toEqual([
      { id: fixture.companionId, name: 'José López', isPrimary: false }
    ]);
    const replay = await scannerCheckIn(fixture.staffToken, key, fixture.invitationId, [fixture.primaryId]).expect(200);
    expect(replay.body).toEqual(first.body);
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'CHECK_IN_CREATE' } })).toBe(1);
    await scannerCheckIn(fixture.staffToken, key, fixture.invitationId, [fixture.companionId])
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CHECK_IN_IDEMPOTENCY_CONFLICT'));

    const after = await scannerPost(fixture.staffToken, 'scan', { qrToken }).expect(200);
    expect(after.body.pendingAssistants).toEqual([{ id: fixture.companionId, name: 'José López', isPrimary: false }]);
    expect(JSON.stringify([scan.body, normalized.body, first.body, after.body])).not.toMatch(
      /phone|clientId|staffToken|digest|qrToken|nonce|ledger|receipt|audit|table/iu
    );
    const auditText = JSON.stringify(await prisma.auditLog.findMany({ where: { eventId: fixture.eventId } }));
    expect(auditText).not.toMatch(/María|José|phone|st1\.|qr1\.|digest|nonce/iu);
  });

  it('rejects invalid and foreign QR uniformly and atomically rejects crossed or already checked selections', async () => {
    const fixture = await createFixture();
    const foreign = await createFixture();
    const invalid = ['qr1.invalid', issueQr(foreign.invitationId, foreign.qrNonce)];
    for (const qrToken of invalid) {
      await scannerPost(fixture.staffToken, 'scan', { qrToken })
        .expect(404)
        .expect(({ body }) => expect(body.code).toBe('SCANNER_QR_NOT_FOUND'));
    }
    await scannerCheckIn(fixture.staffToken, `cross-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId,
      foreign.primaryId
    ])
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('SCANNER_SELECTION_NOT_FOUND'));
    expect(await prisma.checkIn.count()).toBe(0);

    await scannerCheckIn(fixture.staffToken, `all-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId,
      fixture.companionId
    ]).expect(200);
    await scannerCheckIn(fixture.staffToken, `again-${randomUUID()}`, fixture.invitationId, [fixture.primaryId])
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('ASSISTANT_ALREADY_CHECKED_IN'));
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId, revertedAt: null } })).toBe(2);
  });

  it('serializes concurrent StaffTokens and overlapping selections with all-or-none outcomes', async () => {
    const idempotent = await createFixture();
    const sharedKey = `same-key-${randomUUID()}`;
    const sameKey = await Promise.all([
      scanner.checkIn(idempotent.staffToken, sharedKey, {
        invitationId: idempotent.invitationId,
        assistantIds: [idempotent.primaryId]
      }),
      scanner.checkIn(idempotent.staffToken, sharedKey, {
        invitationId: idempotent.invitationId,
        assistantIds: [idempotent.primaryId]
      })
    ]);
    expect(sameKey[1]).toEqual(sameKey[0]);
    expect(await prisma.checkIn.count({ where: { eventId: idempotent.eventId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: idempotent.eventId, action: 'CHECK_IN_CREATE' } })).toBe(1);
    const readOnly = await Promise.all([
      scanner.search(idempotent.staffToken, { query: 'María López' }),
      scanner.search(idempotent.staffToken, { query: 'María López' })
    ]);
    expect(readOnly[1]).toEqual(readOnly[0]);

    const fixture = await createFixture();
    const secondStaff = await addStaffToken(fixture.eventId, fixture.userId);
    const sameAssistant = await Promise.allSettled([
      scanner.checkIn(fixture.staffToken, `race-a-${randomUUID()}`, {
        invitationId: fixture.invitationId,
        assistantIds: [fixture.primaryId]
      }),
      scanner.checkIn(secondStaff, `race-b-${randomUUID()}`, {
        invitationId: fixture.invitationId,
        assistantIds: [fixture.primaryId]
      })
    ]);
    expect(sameAssistant.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId, revertedAt: null } })).toBe(1);

    const overlap = await createFixture();
    const third = await prisma.assistant.create({
      data: {
        eventId: overlap.eventId,
        invitationId: overlap.invitationId,
        name: 'Ana López',
        responseStatus: AssistantResponseStatus.CONFIRMED
      }
    });
    const outcomes = await Promise.allSettled([
      scanner.checkIn(overlap.staffToken, `overlap-a-${randomUUID()}`, {
        invitationId: overlap.invitationId,
        assistantIds: [overlap.primaryId, overlap.companionId]
      }),
      scanner.checkIn(overlap.staffToken, `overlap-b-${randomUUID()}`, {
        invitationId: overlap.invitationId,
        assistantIds: [overlap.companionId, third.id]
      })
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.checkIn.count({ where: { eventId: overlap.eventId, revertedAt: null } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { eventId: overlap.eventId, action: 'CHECK_IN_CREATE' } })).toBe(1);
  }, 60_000);

  it('allows only owned operational users to reverse, preserves history, and supports a later check-in', async () => {
    const fixture = await createFixture();
    const cookie = await login(fixture.email);
    const created = await scannerCheckIn(fixture.staffToken, `create-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId
    ]).expect(200);
    const checkInId = created.body.checkedIn[0].checkInId as string;
    const key = `revert-${randomUUID()}`;
    const reversed = await revert(fixture.eventId, checkInId, key, cookie).expect(200);
    expect(reversed.body).toMatchObject({ status: 'REVERTED', checkInId, assistantId: fixture.primaryId });
    const replay = await revert(fixture.eventId, checkInId, key, cookie).expect(200);
    expect(replay.body).toEqual(reversed.body);
    await revert(fixture.eventId, checkInId, `other-${randomUUID()}`, cookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CHECK_IN_ALREADY_REVERTED'));
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'CHECK_IN_REVERT' } })).toBe(1);
    await scannerCheckIn(fixture.staffToken, `second-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId
    ]).expect(200);
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId } })).toBe(2);
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId, revertedAt: null } })).toBe(1);

    const platform = await createUser(UserRole.PLATFORM_ADMIN, null);
    await revert(fixture.eventId, checkInId, `platform-${randomUUID()}`, await login(platform.email)).expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/check-ins/${checkInId}/revert`)
      .set('Idempotency-Key', `staff-${randomUUID()}`)
      .expect(401);
  });

  it('rolls back check-in and reversal when auditing fails', async () => {
    const fixture = await createFixture();
    const original = audit.record.bind(audit);
    const createSpy = vi.spyOn(audit, 'record').mockImplementation((input, tx) => {
      if (input.action === 'CHECK_IN_CREATE') throw new Error('forced check-in audit failure');
      return original(input, tx);
    });
    try {
      await expect(
        scanner.checkIn(fixture.staffToken, `rollback-${randomUUID()}`, {
          invitationId: fixture.invitationId,
          assistantIds: [fixture.primaryId]
        })
      ).rejects.toThrow('forced check-in audit failure');
    } finally {
      createSpy.mockRestore();
    }
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(0);

    const checked = await scanner.checkIn(fixture.staffToken, `valid-${randomUUID()}`, {
      invitationId: fixture.invitationId,
      assistantIds: [fixture.primaryId]
    });
    const reverseSpy = vi.spyOn(audit, 'record').mockImplementation((input, tx) => {
      if (input.action === 'CHECK_IN_REVERT') throw new Error('forced reversal audit failure');
      return original(input, tx);
    });
    try {
      await expect(
        scanner.revert(fixture.eventId, checked.checkedIn[0]!.checkInId, `rollback-revert-${randomUUID()}`, {
          userId: fixture.userId,
          sessionId: randomUUID(),
          email: fixture.email,
          role: UserRole.INDEPENDENT_PLANNER,
          clientId: fixture.clientId,
          clientType: ClientType.PLANNER,
          clientStatus: ClientStatus.ACTIVE
        })
      ).rejects.toThrow('forced reversal audit failure');
    } finally {
      reverseSpy.mockRestore();
    }
    expect(await prisma.checkIn.findUniqueOrThrow({ where: { id: checked.checkedIn[0]!.checkInId } })).toMatchObject({
      revertedAt: null,
      revertedByUserId: null,
      revertIdempotencyKey: null
    });
  });

  it('enforces active uniqueness, direct-insert rules and immutable history in PostgreSQL', async () => {
    const fixture = await createFixture();
    const first = await scanner.checkIn(fixture.staffToken, `sql-${randomUUID()}`, {
      invitationId: fixture.invitationId,
      assistantIds: [fixture.primaryId]
    });
    const id = first.checkedIn[0]!.checkInId;
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "check_in" SET "assistant_id" = $1::uuid WHERE "id" = $2::uuid`,
        fixture.companionId,
        id
      )
    ).rejects.toThrow(/check_in creation fields are immutable/u);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "check_in" WHERE "id" = $1::uuid`, id)).rejects.toThrow(
      /check_in is immutable/u
    );
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "check_in"')).rejects.toThrow(/check_in is immutable/u);
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(1);
  });

  it('documents all four endpoints without CODEX-082 or floorplan routes', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/session');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/scan');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/search');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/check-in');
    expect(document.paths).toHaveProperty('/api/v1/events/{eventId}/check-ins/{checkInId}/revert');
    expect(document.paths).not.toHaveProperty('/api/v1/scanner/{staffToken}/floorplan');
    expect(JSON.stringify(document)).not.toContain('CODEX-082');
  });

  async function createFixture() {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: randomUUID() } });
    const user = await createUser(UserRole.INDEPENDENT_PLANNER, client.id);
    const eventId = randomUUID();
    const invitationId = randomUUID();
    const primaryId = randomUUID();
    const companionId = randomUUID();
    const qrNonce = randomBytes(32).toString('hex');
    const staff = staffTechnical.generate();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const service = await tx.service.upsert({
        where: { code: ServiceCode.FLYER },
        create: { code: ServiceCode.FLYER },
        update: {}
      });
      const price =
        (await tx.servicePrice.findFirst({ where: { serviceId: service.id, clientType: ClientType.PLANNER } })) ??
        (await tx.servicePrice.create({
          data: {
            serviceId: service.id,
            clientType: ClientType.PLANNER,
            credits: 0,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        }));
      const activationKey = `scanner-activation-${randomUUID()}`;
      const receipt = await tx.receipt.create({
        data: {
          folio: 8_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000_000)),
          clientId: client.id,
          operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
          operationReference: activationKey,
          idempotencyKey: activationKey
        }
      });
      await tx.event.create({
        data: {
          id: eventId,
          clientId: client.id,
          createdByUserId: user.id,
          serviceId: service.id,
          name: 'Evento Scanner',
          status: EventStatus.ACTIVE,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: 100,
          confirmationEnabled: true,
          activatedAt: new Date(),
          activatedByUserId: user.id,
          activatedServiceId: service.id,
          activatedServicePriceId: price.id,
          baseCostCredits: 0,
          promotionDiscountCredits: 0,
          finalCostCredits: 0,
          purchasedCreditsUsed: 0,
          creditLineCreditsUsed: 0,
          activationReceiptId: receipt.id,
          activationIdempotencyKey: activationKey
        }
      });
      const contact = await tx.contact.create({
        data: { eventId, name: 'Familia López', whatsappPhoneNormalized: '+525500000000' }
      });
      await tx.invitation.create({
        data: {
          id: invitationId,
          eventId,
          contactId: contact.id,
          mode: InvitationMode.FAMILY_NOMINAL,
          responseStatus: InvitationResponseStatus.CONFIRMED,
          additionalAssistantLimit: 2,
          invitationTokenNonce: randomBytes(32).toString('hex'),
          qrTokenNonce: qrNonce
        }
      });
      await tx.assistant.createMany({
        data: [
          {
            id: primaryId,
            eventId,
            invitationId,
            name: 'María López',
            isPrimary: true,
            responseStatus: AssistantResponseStatus.CONFIRMED
          },
          {
            id: companionId,
            eventId,
            invitationId,
            name: 'José López',
            responseStatus: AssistantResponseStatus.CONFIRMED
          }
        ]
      });
      await tx.staffToken.create({
        data: {
          eventId,
          alias: 'Acceso principal',
          tokenDigestSha256: staff.digestSha256,
          createdByUserId: user.id
        }
      });
    });
    return {
      clientId: client.id,
      userId: user.id,
      email: user.email,
      eventId,
      invitationId,
      primaryId,
      companionId,
      qrNonce,
      staffToken: staff.rawToken
    };
  }

  async function addStaffToken(eventId: string, userId: string) {
    const generated = staffTechnical.generate();
    await prisma.staffToken.create({
      data: { eventId, alias: 'Segundo acceso', tokenDigestSha256: generated.digestSha256, createdByUserId: userId }
    });
    return generated.rawToken;
  }

  async function createUser(role: UserRole, clientId: string | null) {
    const email = `${randomUUID()}@example.com`;
    return prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
  }

  function issueQr(invitationId: string, nonce: string) {
    return invitationTokens.issue('QR', invitationId, nonce);
  }

  function scannerPost(token: string, action: 'scan' | 'search', body: object) {
    return request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(token)}/${action}`)
      .send(body);
  }

  function scannerCheckIn(token: string, key: string, invitationId: string, assistantIds: string[]) {
    return request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(token)}/check-in`)
      .set('Idempotency-Key', key)
      .send({ invitationId, assistantIds });
  }

  function revert(eventId: string, checkInId: string, key: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/check-ins/${checkInId}/revert`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({});
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing cookie.');
    return cookie;
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "check_in", "staff_token", "hotspot", "flipbook_page", "invitation_design", "file_asset",
        "assistant", "invitation", "contact_import_preview", "contact", "contact_group", "event_state_operation",
        "event", "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
