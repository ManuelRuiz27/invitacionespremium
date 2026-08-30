import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  AuditActorType,
  ClientStatus,
  ClientType,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  FloorplanGeometry,
  FloorplanShapeKind,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Admin pilot operational observations', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  it('records a safe append-only observation with the real Admin actor and operation id', async () => {
    const fixture = await createFixture();
    const operationId = randomUUID();
    const response = await post(fixture, {
      kind: 'PREPARATION_TIME',
      area: 'INVITATION',
      durationMinutes: 30,
      note: 'Ajuste de invitacion'
    })
      .set('X-Operation-Id', operationId)
      .expect(201);

    expect(response.body).toMatchObject({
      kind: 'PREPARATION_TIME',
      area: 'INVITATION',
      durationMinutes: 30,
      count: 1,
      note: 'Ajuste de invitacion'
    });
    expect(response.body).toEqual({
      id: expect.any(String),
      createdAt: expect.any(String),
      kind: 'PREPARATION_TIME',
      area: 'INVITATION',
      durationMinutes: 30,
      count: 1,
      note: 'Ajuste de invitacion'
    });
    const audit = await prisma.auditLog.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(audit).toMatchObject({
      actorType: AuditActorType.USER,
      actorId: fixture.adminUserId,
      clientId: fixture.clientId,
      eventId: fixture.eventId,
      resourceType: 'PILOT_OPERATION',
      resourceId: fixture.eventId,
      action: 'PILOT_OBSERVATION_RECORDED',
      operationId,
      metadata: {
        kind: 'PREPARATION_TIME',
        area: 'INVITATION',
        durationMinutes: 30,
        count: 1,
        note: 'Ajuste de invitacion'
      }
    });
    expect(audit.beforeData).toBeNull();
    expect(audit.afterData).toBeNull();
  });

  it('returns deterministic metrics, newest-first history, active guests and current TABLE shapes only', async () => {
    const fixture = await createFixture();
    await createOperationalCounts(fixture);
    const inputs = [
      { kind: 'PREPARATION_TIME', area: 'INVITATION', durationMinutes: 30 },
      { kind: 'PREPARATION_TIME', area: 'FLOORPLAN', durationMinutes: 45 },
      { kind: 'PLANNER_SUPPORT', area: 'SEATING', durationMinutes: 15 },
      { kind: 'LAST_MINUTE_CHANGE', area: 'GENERAL', count: 2 },
      { kind: 'INCIDENT', area: 'CHECKIN', durationMinutes: 10 },
      { kind: 'MANUAL_WORK', area: 'GENERAL', durationMinutes: 20 }
    ];
    const created: string[] = [];
    for (const input of inputs) created.push((await post(fixture, input).expect(201)).body.id as string);

    const response = await get(fixture).expect(200);
    expect(response.body.observations.map(({ id }: { id: string }) => id)).toEqual([...created].reverse());
    expect(response.body.summary).toEqual({
      preparationMinutesTotal: 75,
      invitationPreparationMinutes: 30,
      floorplanPreparationMinutes: 45,
      plannerSupportMinutes: 15,
      plannerSupportEntries: 1,
      incidents: 1,
      checkinIncidents: 1,
      lastMinuteChanges: 2,
      manualWorkMinutes: 20,
      manualWorkEntries: 1,
      guestCount: 3,
      tableCount: 2
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /actor|resource|operationId|phone|whatsapp|storage|normalizedName/iu
    );
  });

  it('persists cost and design-round observations without changing the legacy operational summary', async () => {
    const fixture = await createFixture();
    const designer = await post(fixture, {
      kind: 'DESIGNER_COST',
      area: 'INVITATION',
      amountMxnCents: 150_000,
      note: 'Diseño externo'
    }).expect(201);
    const round = await post(fixture, {
      kind: 'DESIGN_ROUND',
      area: 'INVITATION',
      durationMinutes: 25,
      count: 2
    }).expect(201);

    expect(designer.body).toMatchObject({
      kind: 'DESIGNER_COST',
      amountMxnCents: 150_000,
      count: 1
    });
    expect(round.body).toMatchObject({ kind: 'DESIGN_ROUND', durationMinutes: 25, count: 2 });
    expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: designer.body.id } })).metadata).toEqual({
      kind: 'DESIGNER_COST',
      area: 'INVITATION',
      amountMxnCents: 150_000,
      count: 1,
      note: 'Diseño externo'
    });
    expect((await get(fixture).expect(200)).body.summary).toEqual({
      preparationMinutesTotal: 0,
      invitationPreparationMinutes: 0,
      floorplanPreparationMinutes: 0,
      plannerSupportMinutes: 0,
      plannerSupportEntries: 0,
      incidents: 0,
      checkinIncidents: 0,
      lastMinuteChanges: 0,
      manualWorkMinutes: 0,
      manualWorkEntries: 0,
      guestCount: 0,
      tableCount: 0
    });
  });

  it('corrects append-only, keeps the original visible and excludes it from the summary', async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    const created = await post(fixture, {
      kind: 'PREPARATION_TIME',
      area: 'INVITATION',
      durationMinutes: 30
    }).expect(201);
    const originalBefore = await prisma.auditLog.findUniqueOrThrow({ where: { id: created.body.id } });

    const corrected = await correct(fixture, created.body.id, { reason: 'Captura duplicada' }).expect(201);

    expect(corrected.body).toMatchObject({
      id: created.body.id,
      correctedAt: expect.any(String),
      correctionReason: 'Captura duplicada'
    });
    const originalAfter = await prisma.auditLog.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(originalAfter).toEqual(originalBefore);
    const correction = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'PILOT_OBSERVATION_CORRECTED' }
    });
    expect(correction).toMatchObject({
      actorType: AuditActorType.USER,
      actorId: fixture.adminUserId,
      clientId: fixture.clientId,
      eventId: fixture.eventId,
      resourceType: 'PILOT_OPERATION',
      resourceId: fixture.eventId,
      metadata: { correctedObservationId: created.body.id, reason: 'Captura duplicada' }
    });
    const journal = await get(fixture).expect(200);
    expect(journal.body.observations).toEqual([
      expect.objectContaining({ id: created.body.id, correctionReason: 'Captura duplicada' })
    ]);
    expect(journal.body.summary.preparationMinutesTotal).toBe(0);

    await correct(fixture, created.body.id, { reason: 'Segundo intento' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('PILOT_OBSERVATION_ALREADY_CORRECTED'));
    await request(app.getHttpServer())
      .post(`${endpoint(other)}/${created.body.id}/correction`)
      .set('Origin', origin)
      .set('Cookie', other.adminCookie)
      .send({ reason: 'Evento incorrecto' })
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('PILOT_OBSERVATION_NOT_FOUND'));
    await correct(other, created.body.id, { reason: 'No autorizado' }, other.plannerCookie).expect(403);
  });

  it('isolates events and clients without leaking target existence', async () => {
    const first = await createFixture();
    const second = await createFixture();
    await post(first, { kind: 'INCIDENT', area: 'GENERAL' }).expect(201);

    const own = await get(first).expect(200);
    expect(own.body.observations).toHaveLength(1);
    const other = await get(second).expect(200);
    expect(other.body.observations).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${second.clientId}/events/${first.eventId}/pilot-observations`)
      .set('Cookie', second.adminCookie)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));
    await request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${second.clientId}/events/${first.eventId}/pilot-observations`)
      .set('Origin', origin)
      .set('Cookie', second.adminCookie)
      .send({ kind: 'INCIDENT', area: 'GENERAL' })
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));
    await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${first.clientId}/events/${randomUUID()}/pilot-observations`)
      .set('Cookie', first.adminCookie)
      .expect(404);
  });

  it('keeps the journal Admin-only and exposes no Planner alias or mutation routes', async () => {
    const fixture = await createFixture();
    await get(fixture, fixture.plannerCookie)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ROLE_FORBIDDEN'));
    await post(fixture, { kind: 'INCIDENT', area: 'GENERAL' }, fixture.plannerCookie).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/pilot-observations`)
      .set('Cookie', fixture.plannerCookie)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/pilot-observations`)
      .set('Origin', origin)
      .set('Cookie', fixture.plannerCookie)
      .send({ kind: 'INCIDENT', area: 'GENERAL' })
      .expect(404);
    await request(app.getHttpServer()).patch(endpoint(fixture)).set('Cookie', fixture.adminCookie).send({}).expect(404);
    await request(app.getHttpServer()).delete(endpoint(fixture)).set('Cookie', fixture.adminCookie).expect(404);
  });

  it.each([
    ['unknown kind', { kind: 'OTHER', area: 'GENERAL' }],
    ['unknown area', { kind: 'INCIDENT', area: 'OTHER' }],
    ['zero duration', { kind: 'INCIDENT', area: 'GENERAL', durationMinutes: 0 }],
    ['excess duration', { kind: 'INCIDENT', area: 'GENERAL', durationMinutes: 1441 }],
    ['missing preparation duration', { kind: 'PREPARATION_TIME', area: 'GENERAL' }],
    ['missing support duration', { kind: 'PLANNER_SUPPORT', area: 'GENERAL' }],
    ['missing manual duration', { kind: 'MANUAL_WORK', area: 'GENERAL' }],
    ['zero count', { kind: 'INCIDENT', area: 'GENERAL', count: 0 }],
    ['excess count', { kind: 'INCIDENT', area: 'GENERAL', count: 10_001 }],
    ['long note', { kind: 'INCIDENT', area: 'GENERAL', note: 'x'.repeat(501) }],
    ['missing cost amount', { kind: 'DESIGNER_COST', area: 'INVITATION' }],
    ['negative cost amount', { kind: 'EXTERNAL_COST', area: 'GENERAL', amountMxnCents: -1 }],
    ['cost duration', { kind: 'TECHNOLOGY_COST', area: 'GENERAL', amountMxnCents: 1, durationMinutes: 1 }],
    ['amount on legacy kind', { kind: 'INCIDENT', area: 'GENERAL', amountMxnCents: 1 }],
    ['amount on design round', { kind: 'DESIGN_ROUND', area: 'INVITATION', amountMxnCents: 1 }],
    ['unknown property', { kind: 'INCIDENT', area: 'GENERAL', contactName: 'private' }]
  ])('rejects %s without writing an audit row', async (_name, body) => {
    const fixture = await createFixture();
    await post(fixture, body)
      .expect(400)
      .expect(({ body: error }) => expect(error.code).toBe('VALIDATION_ERROR'));
    expect(await prisma.auditLog.count({ where: { action: 'PILOT_OBSERVATION_RECORDED' } })).toBe(0);
  });

  function endpoint(fixture: Pick<Fixture, 'clientId' | 'eventId'>): string {
    return `/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/pilot-observations`;
  }

  function post(fixture: Fixture, body: Record<string, unknown>, cookie = fixture.adminCookie) {
    return request(app.getHttpServer()).post(endpoint(fixture)).set('Origin', origin).set('Cookie', cookie).send(body);
  }

  function get(fixture: Fixture, cookie = fixture.adminCookie) {
    return request(app.getHttpServer()).get(endpoint(fixture)).set('Cookie', cookie);
  }

  function correct(
    fixture: Fixture,
    observationId: string,
    body: Record<string, unknown>,
    cookie = fixture.adminCookie
  ) {
    return request(app.getHttpServer())
      .post(`${endpoint(fixture)}/${observationId}/correction`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  async function createFixture(): Promise<Fixture> {
    const client = await prisma.client.create({
      data: { name: `Piloto ${randomUUID()}`, type: ClientType.PLANNER, status: ClientStatus.ACTIVE }
    });
    const plannerEmail = `${randomUUID()}@example.test`;
    const adminEmail = `${randomUUID()}@example.test`;
    const [planner, admin] = await Promise.all([
      prisma.user.create({
        data: {
          email: plannerEmail,
          passwordHash: await hashPassword(password),
          role: UserRole.INDEPENDENT_PLANNER,
          clientId: client.id
        }
      }),
      prisma.user.create({
        data: { email: adminEmail, passwordHash: await hashPassword(password), role: UserRole.PLATFORM_ADMIN }
      })
    ]);
    const event = await prisma.event.create({
      data: { clientId: client.id, createdByUserId: planner.id, name: 'Evento piloto' }
    });
    return {
      clientId: client.id,
      eventId: event.id,
      adminUserId: admin.id,
      adminCookie: await login(adminEmail),
      plannerCookie: await login(plannerEmail)
    };
  }

  async function login(email: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    return response.headers['set-cookie'] as unknown as string[];
  }

  async function createOperationalCounts(fixture: Fixture): Promise<void> {
    await prisma.contact.createMany({
      data: [
        { eventId: fixture.eventId, name: 'Uno', whatsappPhoneNormalized: '+525500000001' },
        { eventId: fixture.eventId, name: 'Dos', whatsappPhoneNormalized: '+525500000002' },
        { eventId: fixture.eventId, name: 'Tres', whatsappPhoneNormalized: '+525500000003' },
        { eventId: fixture.eventId, name: null, anonymizedAt: new Date(), deletedAt: new Date() }
      ]
    });
    const floorplanId = randomUUID();
    const floorplan = await prisma.$transaction(async (transaction) => {
      const asset = await transaction.fileAsset.create({
        data: {
          clientId: fixture.clientId,
          eventId: fixture.eventId,
          ownerType: FileAssetOwnerType.FLOORPLAN,
          ownerId: floorplanId,
          associatedAt: new Date(),
          fileType: FileAssetType.FLOORPLAN_IMAGE,
          storageProvider: StorageProvider.LOCAL,
          storageKey: `pilot/${randomUUID()}`,
          originalName: 'floorplan.png',
          mimeType: 'image/png',
          sizeBytes: 10,
          checksumSha256: 'a'.repeat(64),
          width: 100,
          height: 100,
          createdByUserId: fixture.adminUserId,
          status: FileAssetStatus.READY
        }
      });
      return transaction.floorplan.create({
        data: { id: floorplanId, eventId: fixture.eventId, imageAssetId: asset.id }
      });
    });
    await prisma.floorplanShape.createMany({
      data: [
        shape(floorplan.id, fixture.eventId, 'Mesa Uno', FloorplanShapeKind.TABLE),
        shape(floorplan.id, fixture.eventId, 'Mesa Dos', FloorplanShapeKind.TABLE),
        shape(floorplan.id, fixture.eventId, 'Decoracion', FloorplanShapeKind.DECORATIVE_ZONE),
        { ...shape(floorplan.id, fixture.eventId, 'Mesa eliminada', FloorplanShapeKind.TABLE), deletedAt: new Date() }
      ]
    });
  }

  function shape(floorplanId: string, eventId: string, name: string, kind: FloorplanShapeKind) {
    return {
      floorplanId,
      eventId,
      name,
      normalizedName: name.toLocaleLowerCase('es-MX'),
      kind,
      geometry: FloorplanGeometry.CIRCLE,
      capacity: kind === FloorplanShapeKind.TABLE ? 10 : 0,
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      rotation: 0
    };
  }

  async function resetDatabase(): Promise<void> {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "generated_report", "album_photo", "album", "physical_pass_generation_operation", "physical_pass",
        "staff_token", "check_in", "hotspot", "flipbook_page", "invitation_design", "seating_operation",
        "floorplan_shape", "floorplan", "file_asset", "assistant", "invitation", "contact_import_preview",
        "contact", "contact_group", "event_state_operation", "event", "debt_payment_allocation", "ledger_entry",
        "payment", "receipt", "credit_line", "finance_balance", "promotion", "service_price", "service",
        "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});

interface Fixture {
  clientId: string;
  eventId: string;
  adminUserId: string;
  adminCookie: string[];
  plannerCookie: string[];
}
