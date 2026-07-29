import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientStatus,
  ClientType,
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

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('PhysicalPasses', () => {
  let app: INestApplication;
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
    prisma = app.get(PrismaService);
    tokens = app.get(PhysicalPassTokenService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

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

  it('serializes concurrent generation into unique non-overlapping ranges', async () => {
    const fixture = await createFixture(EventStatus.CONFIGURED, 10);
    const cookie = await login(fixture.email);
    const [left, right] = await Promise.all([
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
    const [left, right] = await Promise.all([
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

    const platform = await createUser(UserRole.PLATFORM_ADMIN, null);
    await generate(foreign.eventId, await login(platform.email), 'physical-platform-001', 1).expect(403);
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

  async function createStaff(eventId: string, cookie: string[], alias: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ alias })
      .expect(201);
    return response.body.token as string;
  }

  async function createFixture(status: EventStatus, capacity: number, floorplanEnabled = false) {
    const client = await prisma.client.create({
      data: { type: ClientType.PLANNER, name: `Cliente ${randomUUID()}`, status: ClientStatus.ACTIVE }
    });
    const user = await createUser(UserRole.INDEPENDENT_PLANNER, client.id);
    const serviceRecord =
      (await prisma.service.findUnique({ where: { code: ServiceCode.PHYSICAL_QR } })) ??
      (await prisma.service.create({ data: { code: ServiceCode.PHYSICAL_QR } }));
    if (status === EventStatus.ACTIVE) {
      const event = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
        const price = await tx.servicePrice.create({
          data: {
            serviceId: serviceRecord.id,
            clientType: ClientType.PLANNER,
            credits: 0,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        });
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
