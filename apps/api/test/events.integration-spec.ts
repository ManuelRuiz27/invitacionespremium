import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client as PgClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  AuditActorType,
  ClientOperatingProfile,
  ClientType,
  EventSocialType,
  EventStatus,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';
import { AuditService } from '../src/audit/audit.service';
import { EventsService } from '../src/events/events.service';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Events CRUD', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: EventsService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = trustedOrigin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    events = app.get(EventsService);
  });

  beforeEach(resetDatabase);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  it('creates drafts/configured Events for all Client roles and derives protected fields', async () => {
    const independent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const organizationPlanner = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const service = await createService(ServiceCode.FLYER);

    const independentEvent = await createEvent(await login(independent.email), {}).expect(201);
    expect(independentEvent.body).toMatchObject({
      clientId: independent.clientId,
      createdByUserId: independent.userId,
      serviceCode: null,
      status: EventStatus.DRAFT
    });

    const adminEvent = await createEvent(await login(organization.email), {}).expect(201);
    expect(adminEvent.body.createdByUserId).toBe(organization.userId);

    const completeBody = {
      name: 'Boda completa',
      serviceId: service.id,
      socialType: EventSocialType.WEDDING,
      eventDateTime: '2027-02-14T20:00:00.000Z',
      eventEndDateTime: '2027-02-15T02:00:00.000Z',
      timeZone: 'America/Mexico_City',
      capacity: 150,
      confirmationEnabled: true,
      floorplanEnabled: true
    };
    const plannerEvent = await createEvent(await login(organizationPlanner.email), completeBody).expect(201);
    expect(plannerEvent.body).toMatchObject({
      clientId: organization.clientId,
      createdByUserId: organizationPlanner.userId,
      status: EventStatus.CONFIGURED
    });
    expect(plannerEvent.body.status).not.toBe(EventStatus.READY_TO_ACTIVATE);

    await createEvent(await login(independent.email), {
      ...completeBody,
      status: EventStatus.ACTIVE,
      clientId: organization.clientId,
      createdByUserId: organizationPlanner.userId
    }).expect(400);
    expect(await prisma.auditLog.count({ where: { action: 'EVENT_CREATE' } })).toBe(3);
  });

  it('enforces ownership, admin read-only routes, validation, and service changes before activation', async () => {
    const firstIndependent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const secondIndependent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const plannerOne = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const plannerTwo = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const firstService = await createService(ServiceCode.FLYER);
    const secondService = await createService(ServiceCode.FLIPBOOK);
    const inactiveService = await createService(ServiceCode.PHYSICAL_QR, false);

    const firstCookie = await login(firstIndependent.email);
    const firstEvent = await createEvent(firstCookie, {}).expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${firstEvent.body.id}`)
      .set('Cookie', await login(secondIndependent.email))
      .expect(404);

    const plannerOneCookie = await login(plannerOne.email);
    const plannerTwoCookie = await login(plannerTwo.email);
    const organizationCookie = await login(organization.email);
    const ownedByOne = await createEvent(plannerOneCookie, {}).expect(201);
    const ownedByTwo = await createEvent(plannerTwoCookie, {}).expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${ownedByTwo.body.id}`)
      .set('Cookie', plannerOneCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/events')
      .set('Cookie', plannerOneCookie)
      .expect(200)
      .expect((response) => expect(response.body.map((item: { id: string }) => item.id)).toEqual([ownedByOne.body.id]));
    await request(app.getHttpServer())
      .get(`/api/v1/events/${ownedByTwo.body.id}`)
      .set('Cookie', organizationCookie)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${ownedByOne.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerOneCookie)
      .send({ name: 'Owned by planner one' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${ownedByTwo.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerOneCookie)
      .send({ name: 'Forbidden cross-creator update' })
      .expect(404)
      .expect((response) => expect(response.body.code).toBe('EVENT_NOT_FOUND'));

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${ownedByTwo.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', organizationCookie)
      .send({ serviceId: firstService.id })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${ownedByTwo.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', organizationCookie)
      .send({ serviceId: secondService.id })
      .expect(200)
      .expect((response) => expect(response.body.serviceId).toBe(secondService.id));

    for (const body of [
      { serviceId: randomUUID() },
      { serviceId: inactiveService.id },
      { timeZone: 'Invalid/Zone' },
      { capacity: 0 },
      {
        eventDateTime: '2035-10-18T23:00:00.000Z',
        eventEndDateTime: '2035-10-18T22:00:00.000Z'
      }
    ]) {
      await createEvent(firstCookie, body).expect(400);
    }

    const platformCookie = await login(platform.email);
    await request(app.getHttpServer()).get('/api/v1/events').set('Cookie', platformCookie).expect(403);
    await createEvent(platformCookie, {}).expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${firstEvent.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({ name: 'Forbidden Platform Admin Planner route' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/events')
      .set('Cookie', platformCookie)
      .expect(200)
      .expect((response) => expect(response.body.length).toBe(3));
    await request(app.getHttpServer())
      .get(`/api/v1/admin/events/${firstEvent.body.id}`)
      .set('Cookie', platformCookie)
      .expect(200);
  });

  it('allows Platform Admin to update one explicit Client/Event target with the real audited actor', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const service = await createService(ServiceCode.FLYER);
    const plannerCookie = await login(planner.email);
    const platformCookie = await login(platform.email);
    const created = await createEvent(plannerCookie, { name: 'Before admin setup' }).expect(201);
    const operationId = randomUUID();

    await patchAdminEvent(
      platformCookie,
      planner.clientId,
      created.body.id,
      {
        name: 'Configured by provider',
        serviceId: service.id,
        capacity: 180
      },
      operationId
    )
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: created.body.id,
          clientId: planner.clientId,
          createdByUserId: planner.userId,
          name: 'Configured by provider',
          serviceId: service.id,
          capacity: 180
        });
      });

    expect(await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({
      clientId: planner.clientId,
      createdByUserId: planner.userId,
      name: 'Configured by provider',
      serviceId: service.id,
      capacity: 180
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'EVENT_UPDATE', operationId }
    });
    expect(audit).toMatchObject({
      actorType: AuditActorType.USER,
      actorId: platform.userId,
      clientId: planner.clientId,
      eventId: created.body.id,
      resourceType: 'EVENT',
      resourceId: created.body.id,
      action: 'EVENT_UPDATE',
      operationId
    });
    expect(audit.beforeData).toMatchObject({ id: created.body.id, name: 'Before admin setup' });
    expect(audit.afterData).toMatchObject({ id: created.body.id, name: 'Configured by provider', capacity: 180 });
  });

  it('keeps administrative Event Setup target resolution non-leaking and preserves existing validation', async () => {
    const firstPlanner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const secondPlanner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const inactiveService = await createService(ServiceCode.FLYER, false);
    const platformCookie = await login(platform.email);
    const secondEvent = await createEvent(await login(secondPlanner.email), { name: 'Unchanged target' }).expect(201);

    for (const [clientId, eventId] of [
      [firstPlanner.clientId, secondEvent.body.id],
      [firstPlanner.clientId, randomUUID()],
      [randomUUID(), secondEvent.body.id]
    ]) {
      await patchAdminEvent(platformCookie, clientId, eventId, { name: 'Must not mutate' })
        .expect(404)
        .expect((response) => expect(response.body.code).toBe('EVENT_NOT_FOUND'));
    }
    expect(await prisma.event.findUniqueOrThrow({ where: { id: secondEvent.body.id } })).toMatchObject({
      name: 'Unchanged target',
      clientId: secondPlanner.clientId
    });

    await patchAdminEvent(platformCookie, 'not-a-uuid', secondEvent.body.id, { name: 'Invalid client' })
      .expect(400)
      .expect((response) => expect(response.body.code).toBe('VALIDATION_ERROR'));
    await patchAdminEvent(platformCookie, secondPlanner.clientId, 'not-a-uuid', { name: 'Invalid event' })
      .expect(400)
      .expect((response) => expect(response.body.code).toBe('VALIDATION_ERROR'));
    await patchAdminEvent(platformCookie, secondPlanner.clientId, secondEvent.body.id, {
      name: 'Strict body',
      unexpected: true
    })
      .expect(400)
      .expect((response) => expect(response.body.code).toBe('VALIDATION_ERROR'));
    await patchAdminEvent(platformCookie, secondPlanner.clientId, secondEvent.body.id, {
      serviceId: inactiveService.id
    })
      .expect(400)
      .expect((response) => expect(response.body.code).toBe('EVENT_SERVICE_NOT_AVAILABLE'));

    await prisma.event.update({ where: { id: secondEvent.body.id }, data: { status: EventStatus.CANCELLED } });
    await patchAdminEvent(platformCookie, secondPlanner.clientId, secondEvent.body.id, { name: 'Too late' })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_INVALID_STATE_TRANSITION'));
    expect(await prisma.event.findUniqueOrThrow({ where: { id: secondEvent.body.id } })).toMatchObject({
      name: 'Unchanged target',
      status: EventStatus.CANCELLED
    });
  });

  it('projects the contracted service independently from the current catalog and price availability', async () => {
    const independent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const service = await createService(ServiceCode.FLYER);
    const cookie = await login(independent.email);
    const created = await createEvent(cookie, { serviceId: service.id }).expect(201);

    expect(created.body.serviceCode).toBe(ServiceCode.FLYER);
    await prisma.service.update({ where: { id: service.id }, data: { isActive: false } });

    await request(app.getHttpServer()).get('/api/v1/services').set('Cookie', cookie).expect(200, []);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${created.body.id}`)
      .set('Cookie', cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.serviceId).toBe(service.id);
        expect(response.body.serviceCode).toBe(ServiceCode.FLYER);
      });
  });

  it('soft-deletes, restores administratively, and expires drafts idempotently with audit', async () => {
    const independent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const cookie = await login(independent.email);
    const platformCookie = await login(platform.email);
    const created = await createEvent(cookie, {}).expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/events/${created.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .expect(204);
    await request(app.getHttpServer()).get(`/api/v1/events/${created.body.id}`).set('Cookie', cookie).expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/events/${created.body.id}/restore`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .expect(200)
      .expect((response) => expect(response.body.deletedAt).toBeNull());

    const expired = await createEvent(cookie, {
      eventDateTime: new Date(Date.now() - 60_000).toISOString()
    }).expect(201);
    expect(await events.softDeleteExpiredDrafts()).toBe(1);
    expect(await events.softDeleteExpiredDrafts()).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: expired.body.id } })).deletedAt).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          eventId: expired.body.id,
          action: 'EVENT_EXPIRED_DRAFT_SOFT_DELETE',
          actorType: AuditActorType.SYSTEM
        }
      })
    ).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: created.body.id } })).toBe(3);
  });

  it('uses the current DB operating profile to gate Client Event mutations while preserving Admin setup', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const plannerCookie = await login(planner.email);
    const platformCookie = await login(platform.email);
    const existing = await createEvent(plannerCookie, { name: 'Self-service draft' }).expect(201);
    const service = await createService(ServiceCode.FLYER);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${planner.clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({ operatingProfile: ClientOperatingProfile.MANAGED })
      .expect(200);

    await createEvent(plannerCookie, { name: 'Forbidden managed draft' })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('CLIENT_MANAGED_CAPABILITY_FORBIDDEN'));
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${existing.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerCookie)
      .send({ name: 'Forbidden managed update', serviceId: service.id })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('CLIENT_MANAGED_CAPABILITY_FORBIDDEN'));
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${existing.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerCookie)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('CLIENT_MANAGED_CAPABILITY_FORBIDDEN'));

    expect(await prisma.event.count({ where: { clientId: planner.clientId } })).toBe(1);
    expect(await prisma.event.findUniqueOrThrow({ where: { id: existing.body.id } })).toMatchObject({
      name: 'Self-service draft',
      serviceId: null,
      deletedAt: null
    });
    await request(app.getHttpServer())
      .get(`/api/v1/events/${existing.body.id}`)
      .set('Cookie', plannerCookie)
      .expect(200);
    await patchAdminEvent(platformCookie, planner.clientId, existing.body.id, { name: 'Configured by provider' })
      .expect(200)
      .expect(({ body }) => expect(body.name).toBe('Configured by provider'));

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${planner.clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({ operatingProfile: ClientOperatingProfile.SELF_SERVICE })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${existing.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerCookie)
      .send({ name: 'Self-service restored' })
      .expect(200);
    await createEvent(plannerCookie, { name: 'Self-service second draft' }).expect(201);
  });

  it('applies additive migrations over representative legacy data without backfill or repricing', async () => {
    const base = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(base.hostname))
      throw new Error('Migration fixture requires local PostgreSQL.');
    const name = `dt02a_legacy_${randomUUID().replaceAll('-', '')}`;
    base.pathname = '/postgres';
    const maintenance = new PgClient({ connectionString: base.toString() });
    await maintenance.connect();
    let legacy: PgClient | undefined;
    try {
      await maintenance.query(`CREATE DATABASE "${name}"`);
      base.pathname = `/${name}`;
      legacy = new PgClient({ connectionString: base.toString() });
      await legacy.connect();
      const directory = resolve(process.cwd(), 'prisma/migrations');
      const migrations = (await readdir(directory)).filter((name) => /^\d/.test(name)).sort();
      const newMigrations = migrations.filter((name) => name >= '20261019120000_add_access_control_service');
      for (const migration of migrations.filter((name) => !newMigrations.includes(name))) {
        let sql = await readFile(resolve(directory, migration, 'migration.sql'), 'utf8');
        // Prisma commits enum extensions before statements that use their values.
        for (const statement of sql.match(/ALTER TYPE [^;]+ ADD VALUE[^;]*;/g) ?? []) {
          await legacy.query(statement);
          sql = sql.replace(statement, '');
        }
        await legacy.query(sql);
      }
      const clientId = randomUUID(),
        adminId = randomUUID(),
        plannerId = randomUUID();
      await legacy.query(
        `INSERT INTO "client" (id, type, name, operating_profile, updated_at) VALUES ($1, 'PLANNER', 'Legacy Managed', 'MANAGED', NOW())`,
        [clientId]
      );
      await legacy.query(
        `INSERT INTO app_user (id, email, password_hash, role, client_id, updated_at) VALUES ($1, 'provider@legacy.test', $4, 'PLATFORM_ADMIN', NULL, NOW()), ($2, 'planner@legacy.test', $4, 'INDEPENDENT_PLANNER', $3, NOW())`,
        [adminId, plannerId, clientId, await hashPassword(password)]
      );
      await legacy.query(
        `INSERT INTO service (id, code, updated_at) VALUES ($1, 'DEMO', NOW()) ON CONFLICT (code) DO NOTHING`,
        [randomUUID()]
      );
      const services = await legacy.query<{ id: string; code: string }>('SELECT id, code FROM service ORDER BY code');
      expect(services.rows).toHaveLength(4);
      for (const service of services.rows) {
        await legacy.query(
          `INSERT INTO event (id, client_id, created_by_user_id, assigned_planner_user_id, service_id, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [randomUUID(), clientId, adminId, plannerId, service.id]
        );
      }
      // Preserve legacy identity, QR material and existing CheckIn history through DT04.
      const legacyEventId = (await legacy.query<{ id: string }>('SELECT id FROM event ORDER BY id LIMIT 1')).rows[0]!
        .id;
      const contactId = randomUUID(),
        invitationId = randomUUID(),
        assistantId = randomUUID();
      await legacy.query('BEGIN');
      await legacy.query(
        `INSERT INTO contact (id,event_id,name,whatsapp_phone_normalized,updated_at) VALUES ($1,$2,'Legacy Nominal','+525512345678',NOW())`,
        [contactId, legacyEventId]
      );
      await legacy.query(
        `INSERT INTO invitation (id,event_id,contact_id,invitation_token_nonce,qr_token_nonce,updated_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
        [invitationId, legacyEventId, contactId, '1'.repeat(64), '2'.repeat(64)]
      );
      await legacy.query(
        `INSERT INTO assistant (id,event_id,invitation_id,name,is_primary,updated_at) VALUES ($1,$2,$3,'Legacy Nominal',TRUE,NOW())`,
        [assistantId, legacyEventId, invitationId]
      );
      await legacy.query('COMMIT');
      const legacyCheckInId = randomUUID(),
        legacyStaffId = randomUUID();
      await legacy.query('BEGIN');
      await legacy.query('SET LOCAL session_replication_role = replica');
      await legacy.query(
        `UPDATE event SET status = 'active', activated_at = NOW(), activated_by_user_id = $2,
        activated_service_id = service_id, activation_idempotency_key = 'legacy-fixture-activation'
        WHERE id = $1`,
        [legacyEventId, adminId]
      );
      await legacy.query(`UPDATE invitation SET response_status = 'CONFIRMED' WHERE id = $1`, [invitationId]);
      await legacy.query(`UPDATE assistant SET response_status = 'CONFIRMED' WHERE id = $1`, [assistantId]);
      await legacy.query(
        `INSERT INTO staff_token (id,event_id,alias,token_digest_sha256,created_by_user_id)
        VALUES ($1,$2,'Legacy Staff',$3,$4)`,
        [legacyStaffId, legacyEventId, 'a'.repeat(64), plannerId]
      );
      await legacy.query('COMMIT');
      await legacy.query(
        `INSERT INTO check_in (id,event_id,invitation_id,assistant_id,staff_token_id,
        checked_in_at,idempotency_key,request_signature,result_snapshot)
        VALUES ($1,$2,$3,$4,$5,clock_timestamp(),'legacy-check-in',$6,$7::jsonb)`,
        [
          legacyCheckInId,
          legacyEventId,
          invitationId,
          assistantId,
          legacyStaffId,
          'b'.repeat(64),
          JSON.stringify({
            status: 'CHECKED_IN',
            invitationId,
            checkedIn: [
              {
                checkInId: legacyCheckInId,
                assistantId,
                name: 'Legacy Nominal',
                checkedInAt: new Date().toISOString(),
                table: null
              }
            ],
            remainingPendingAssistants: [],
            remainingPendingCount: 0
          })
        ]
      );
      const legacyCheckIn = (await legacy.query('SELECT to_jsonb(check_in) AS data FROM check_in')).rows;
      const legacyMaterial = {} as Record<string, unknown[]>;
      for (const table of ['contact', 'invitation', 'assistant']) {
        legacyMaterial[table] = (
          await legacy.query(`SELECT to_jsonb(${table}) AS data FROM ${table} ORDER BY id`)
        ).rows;
      }
      const before = (await legacy.query('SELECT to_jsonb(event) AS data FROM event ORDER BY id')).rows;
      const prices = (await legacy.query('SELECT to_jsonb(service_price) AS data FROM service_price ORDER BY id')).rows;
      for (const migration of newMigrations) {
        await legacy.query(await readFile(resolve(directory, migration, 'migration.sql'), 'utf8'));
      }
      expect(
        (await legacy.query(`SELECT to_jsonb(event) - 'access_mode' AS data FROM event ORDER BY id`)).rows
      ).toEqual(before);
      expect((await legacy.query('SELECT access_mode FROM event')).rows.every((row) => row.access_mode === null)).toBe(
        true
      );
      expect((await legacy.query('SELECT id, code FROM service ORDER BY code')).rows).toEqual(services.rows);
      expect(
        (await legacy.query('SELECT to_jsonb(service_price) AS data FROM service_price ORDER BY id')).rows
      ).toEqual(prices);
      expect(prices.filter((row) => row.data.pricing_version === 2)).toHaveLength(16);
      for (const table of ['contact', 'invitation', 'assistant']) {
        expect((await legacy.query(`SELECT to_jsonb(${table}) AS data FROM ${table} ORDER BY id`)).rows).toEqual(
          legacyMaterial[table]
        );
      }
      expect((await legacy.query('SELECT count(*)::int AS total FROM assistant_access_credential')).rows).toEqual([
        { total: 0 }
      ]);
      expect(
        (await legacy.query("SELECT to_jsonb(check_in) - 'assistant_access_credential_id' AS data FROM check_in")).rows
      ).toEqual(legacyCheckIn);
      expect((await legacy.query('SELECT assistant_access_credential_id FROM check_in')).rows).toEqual([
        { assistant_access_credential_id: null }
      ]);
    } finally {
      await legacy?.end();
      await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await maintenance.end();
    }
  }, 60_000);

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'creates and prepares Provider Organization access mode %s without pricing or READY',
    async (accessMode) => {
      const f = await accessFixture();
      const created = await managedIntake(f, { accessMode }).expect(201);
      expect(created.body).toMatchObject({
        clientId: f.clientId,
        createdByUserId: f.platform.userId,
        assignedPlannerUserId: f.userId,
        serviceId: f.service.id,
        serviceCode: 'ACCESS_CONTROL',
        accessMode,
        status: 'DRAFT',
        activatedAt: null
      });
      const configured = await patchAdminEvent(f.cookie, f.clientId, created.body.id, {
        socialType: 'OTHER',
        eventDateTime: '2035-10-18T23:00:00.000Z',
        timeZone: 'America/Mexico_City'
      }).expect(200);
      expect(configured.body.status).toBe('CONFIGURED');
      const changed = await patchAdminEvent(f.cookie, f.clientId, created.body.id, {
        accessMode: accessMode === 'NOMINAL' ? 'ANONYMOUS' : 'NOMINAL'
      }).expect(200);
      expect(changed.body.accessMode).not.toBe(accessMode);
      expect(await prisma.servicePrice.count()).toBe(0);
      expect(await prisma.receipt.count()).toBe(0);
      expect(
        await prisma.auditLog.findFirst({ where: { eventId: created.body.id, action: 'EVENT_CREATE' } })
      ).toMatchObject({ actorId: f.platform.userId, afterData: { accessMode } });
      await patchAdminEvent(f.cookie, randomUUID(), created.body.id, { accessMode }).expect(404);
    }
  );

  it('restricts Provider access control intake to Managed Organizations, valid actors, mode and assignment', async () => {
    const f = await accessFixture();
    for (const accessMode of [null, 'INVALID', ['NOMINAL', 'ANONYMOUS']])
      await managedIntake(f, { accessMode }).expect(400);
    await managedIntake(f, { accessMode: undefined }).expect(400);
    await managedIntake(f, { assignedPlannerUserId: null }).expect(400);
    const wrongRole = await createUser(f.clientId, UserRole.ORGANIZATION_ADMIN);
    const foreign = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_PLANNER);
    const deleted = await createUser(f.clientId, UserRole.ORGANIZATION_PLANNER);
    await prisma.user.update({ where: { id: deleted.userId }, data: { deletedAt: new Date() } });
    for (const assignedPlannerUserId of [wrongRole.userId, foreign.userId, deleted.userId]) {
      await managedIntake(f, { assignedPlannerUserId }).expect(409);
    }
    const clientCookie = await login(f.email);
    await managedIntake({ ...f, cookie: clientCookie }).expect(403);
    await createEvent(clientCookie, { serviceId: f.service.id }).expect(403);
    await prisma.client.update({
      where: { id: f.clientId },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: 'Test suspension' }
    });
    await managedIntake(f).expect(409);
    await prisma.client.update({
      where: { id: f.clientId },
      data: { status: 'ACTIVE', suspendedAt: null, suspensionReason: null, operatingProfile: 'SELF_SERVICE' }
    });
    await managedIntake(f).expect(409);
    await createEvent(clientCookie, { serviceId: f.service.id }).expect(409);
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    await prisma.client.update({ where: { id: planner.clientId }, data: { operatingProfile: 'MANAGED' } });
    await managedIntake({ ...f, clientId: planner.clientId, userId: planner.userId }).expect(409);
    await managedIntake(f, { serviceCode: 'FLYER', accessMode: 'NOMINAL' }).expect(400);
    expect(await prisma.event.count()).toBe(0);
  });

  it('preserves assignment ownership and rejects Client mode edits and null reassignment', async () => {
    const f = await accessFixture();
    const created = await managedIntake(f).expect(201);
    const next = await createUser(f.clientId, UserRole.ORGANIZATION_PLANNER);
    const beforeCookie = await login(f.email);
    const nextCookie = await login(next.email);
    await request(app.getHttpServer()).get(`/api/v1/events/${created.body.id}`).set('Cookie', beforeCookie).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/events/${created.body.id}`).set('Cookie', nextCookie).expect(404);
    const assign = (assignedPlannerUserId: string | null) =>
      request(app.getHttpServer())
        .patch(`/api/v1/admin/clients/${f.clientId}/events/${created.body.id}/assignment`)
        .set('Origin', trustedOrigin)
        .set('Cookie', f.cookie)
        .send({ assignedPlannerUserId });
    await assign(null).expect(409);
    await assign(next.userId).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/events/${created.body.id}`).set('Cookie', beforeCookie).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/events/${created.body.id}`).set('Cookie', nextCookie).expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/events/${created.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', nextCookie)
      .send({ accessMode: 'ANONYMOUS' })
      .expect(400);
    expect(
      await prisma.auditLog.count({ where: { eventId: created.body.id, action: 'EVENT_PLANNER_ASSIGNMENT_UPDATE' } })
    ).toBe(1);
  });

  it('enforces SQL INSERT/UPDATE service-mode, actor, profile, tenant and assignment invariants', async () => {
    const f = await accessFixture();
    const flyer = await createService(ServiceCode.FLYER);
    const insert = (
      serviceId: string | null,
      accessMode: string | null,
      creator = f.platform.userId,
      planner: string | null = f.userId
    ) => prisma.$executeRaw`
      INSERT INTO "event" ("id", "client_id", "created_by_user_id", "assigned_planner_user_id", "service_id", "access_mode", "updated_at")
      VALUES (${randomUUID()}::uuid, ${f.clientId}::uuid, ${creator}::uuid, ${planner}::uuid, ${serviceId}::uuid, ${accessMode}::event_access_mode, NOW())`;
    for (const [serviceId, accessMode] of [
      [f.service.id, null],
      [flyer.id, 'NOMINAL'],
      [null, 'ANONYMOUS'],
      [f.service.id, 'INVALID']
    ] as const) {
      await expect(insert(serviceId, accessMode)).rejects.toThrow();
    }
    await expect(insert(f.service.id, 'NOMINAL', f.userId)).rejects.toThrow();
    await expect(insert(f.service.id, 'NOMINAL', f.platform.userId, null)).rejects.toThrow();
    await prisma.client.update({ where: { id: f.clientId }, data: { operatingProfile: 'SELF_SERVICE' } });
    await expect(insert(f.service.id, 'NOMINAL')).rejects.toThrow();
    await prisma.client.update({ where: { id: f.clientId }, data: { operatingProfile: 'MANAGED' } });
    const created = await managedIntake(f).expect(201);
    const id = created.body.id as string;
    await expect(
      prisma.$executeRaw`UPDATE "event" SET "access_mode" = NULL WHERE "id" = ${id}::uuid`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "event" SET "service_id" = ${flyer.id}::uuid WHERE "id" = ${id}::uuid`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "event" SET "assigned_planner_user_id" = NULL WHERE "id" = ${id}::uuid`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "service" SET "code" = 'DEMO' WHERE "id" = ${f.service.id}::uuid`
    ).rejects.toThrow();
    await expect(
      prisma.client.update({ where: { id: f.clientId }, data: { operatingProfile: 'SELF_SERVICE' } })
    ).rejects.toThrow();
    await patchAdminEvent(f.cookie, f.clientId, id, { serviceId: flyer.id }).expect(409);
    await patchAdminEvent(f.cookie, f.clientId, id, { accessMode: null }).expect(409);
    // Complete service/mode changes are allowed before any access material.
    await patchAdminEvent(f.cookie, f.clientId, id, { serviceId: flyer.id, accessMode: null }).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).accessMode).toBeNull();
  });

  it('freezes access mode/service after soft-deleted Contact, Invitation and Assistant history', async () => {
    const f = await accessFixture();
    const created = await managedIntake(f).expect(201);
    const id = created.body.id as string;
    const plannerCookie = await login(f.email);
    const contact = await request(app.getHttpServer())
      .post(`/api/v1/events/${id}/contacts`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerCookie)
      .send({ name: 'Guest', whatsappPhone: '+524441234567' })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${id}/contacts/${contact.body.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerCookie)
      .expect(204);
    expect(await prisma.invitation.count({ where: { eventId: id } })).toBe(1);
    expect(await prisma.assistant.count({ where: { eventId: id } })).toBe(1);
    await patchAdminEvent(f.cookie, f.clientId, id, { accessMode: 'ANONYMOUS' }).expect(409);
    const flyer = await createService(ServiceCode.FLYER);
    await patchAdminEvent(f.cookie, f.clientId, id, { serviceId: flyer.id, accessMode: null }).expect(409);
    await expect(
      prisma.$executeRaw`UPDATE "event" SET "access_mode" = 'ANONYMOUS' WHERE "id" = ${id}::uuid`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "event" SET "service_id" = ${flyer.id}::uuid, "access_mode" = NULL WHERE "id" = ${id}::uuid`
    ).rejects.toThrow();
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).accessMode).toBe('NOMINAL');
  });

  it('preserves the material freeze for generation history and deleted physical passes', async () => {
    const f = await accessFixture();
    const created = await managedIntake(f).expect(201);
    await prisma.physicalPassGenerationOperation.create({
      data: {
        eventId: created.body.id,
        idempotencyKey: 'generation-history-fixture',
        requestSignature: 'a'.repeat(64),
        resultSnapshot: {}
      }
    });
    await patchAdminEvent(f.cookie, f.clientId, created.body.id, { accessMode: 'ANONYMOUS' }).expect(409);
    await expect(
      prisma.$executeRaw`UPDATE "event" SET "access_mode" = 'ANONYMOUS' WHERE "id" = ${created.body.id}::uuid`
    ).rejects.toThrow();
    const physical = await createService(ServiceCode.PHYSICAL_QR);
    const legacy = await prisma.event.create({
      data: {
        clientId: f.clientId,
        createdByUserId: f.platform.userId,
        assignedPlannerUserId: f.userId,
        serviceId: physical.id,
        capacity: 100
      }
    });
    await prisma.physicalPass.create({
      data: {
        eventId: legacy.id,
        createdByUserId: f.userId,
        passNumber: 1,
        qrTokenNonce: randomUUID().replaceAll('-', '').repeat(2),
        deletedAt: new Date()
      }
    });
    await patchAdminEvent(f.cookie, f.clientId, legacy.id, { serviceId: f.service.id, accessMode: 'ANONYMOUS' }).expect(
      409
    );
    await expect(
      prisma.$executeRaw`UPDATE "event" SET "service_id" = ${f.service.id}::uuid, "access_mode" = 'ANONYMOUS' WHERE "id" = ${legacy.id}::uuid`
    ).rejects.toThrow();
    expect((await prisma.event.findUniqueOrThrow({ where: { id: legacy.id } })).accessMode).toBeNull();
  });

  it('rolls back failed intake audits and serializes competing complete access configurations', async () => {
    const f = await accessFixture();
    const audit = vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('Injected audit failure'));
    await managedIntake(f).expect(500);
    audit.mockRestore();
    expect(await prisma.event.count()).toBe(0);
    const created = await managedIntake(f).expect(201);
    const flyer = await createService(ServiceCode.FLYER);
    const results = await Promise.all([
      patchAdminEvent(f.cookie, f.clientId, created.body.id, { accessMode: 'ANONYMOUS' }),
      patchAdminEvent(f.cookie, f.clientId, created.body.id, { serviceId: flyer.id, accessMode: null })
    ]);
    expect(results.map((r) => r.status).every((status) => status === 200 || status === 409)).toBe(true);
    const final = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(final.serviceId === f.service.id ? final.accessMode !== null : final.accessMode === null).toBe(true);
  });

  async function accessFixture() {
    const client = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_PLANNER);
    await prisma.client.update({ where: { id: client.clientId }, data: { operatingProfile: 'MANAGED' } });
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const service = await createService(ServiceCode.ACCESS_CONTROL);
    return { ...client, platform, service, cookie: await login(platform.email) };
  }

  function managedIntake(f: Awaited<ReturnType<typeof accessFixture>>, overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${f.clientId}/events/managed`)
      .set('Origin', trustedOrigin)
      .set('Cookie', f.cookie)
      .send({
        name: 'Access control',
        serviceCode: 'ACCESS_CONTROL',
        accessMode: 'NOMINAL',
        capacity: 120,
        assignedPlannerUserId: f.userId,
        ...overrides
      });
  }

  it('publishes the CODEX-040 endpoints in OpenAPI', () => {
    const document = createOpenApiDocument(app);
    const paths = document.paths;
    for (const path of [
      '/api/v1/events',
      '/api/v1/events/{eventId}',
      '/api/v1/admin/events',
      '/api/v1/admin/events/{eventId}',
      '/api/v1/admin/events/{eventId}/restore',
      '/api/v1/admin/clients/{clientId}/events/{eventId}'
    ]) {
      expect(paths).toHaveProperty(path);
    }
    expect(document.components?.schemas?.EventResponseDto).toMatchObject({
      properties: {
        accessMode: { nullable: true, allOf: [{ $ref: '#/components/schemas/EventAccessMode' }] },
        serviceCode: {
          nullable: true,
          enum: ['FLIPBOOK', 'FLYER', 'PHYSICAL_QR', 'DEMO', 'ACCESS_CONTROL']
        }
      }
    });
    expect(document.components?.schemas?.EventAccessMode).toMatchObject({ enum: ['NOMINAL', 'ANONYMOUS'] });
    expect(document.components?.schemas?.ClientUpdateEventRequestDto).not.toHaveProperty('properties.accessMode');
    expect(document.components?.schemas?.AdminManagedAccessControlEventIntakeRequestDto).toMatchObject({
      required: ['serviceCode', 'capacity', 'assignedPlannerUserId', 'accessMode'],
      properties: { serviceCode: { enum: ['ACCESS_CONTROL'] } }
    });
    expect(document.paths['/api/v1/admin/clients/{clientId}/events/managed']?.post?.requestBody).toMatchObject({
      content: {
        'application/json': { schema: { oneOf: expect.any(Array), discriminator: { propertyName: 'serviceCode' } } }
      }
    });
  });

  function createEvent(cookie: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send(body);
  }

  function patchAdminEvent(
    cookie: string,
    clientId: string,
    eventId: string,
    body: Record<string, unknown>,
    operationId?: string
  ) {
    const pending = request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}/events/${eventId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send(body);
    return operationId ? pending.set('x-operation-id', operationId) : pending;
  }

  async function createClientUser(type: ClientType, role: UserRole) {
    const client = await prisma.client.create({
      data: { type, operatingProfile: 'SELF_SERVICE', name: `Client ${randomUUID()}` }
    });
    const user = await createUser(client.id, role);
    return { clientId: client.id, userId: user.userId, email: user.email };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { userId: user.id, email };
  }

  async function createService(code: ServiceCode, isActive = true) {
    return prisma.service.create({ data: { code, isActive } });
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing session cookie.');
    return cookie;
  }

  async function resetDatabase(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "event",
        "debt_payment_allocation",
        "ledger_entry",
        "payment",
        "receipt",
        "credit_line",
        "finance_balance",
        "promotion",
        "service_price",
        "service",
        "audit_log",
        "auth_session",
        "app_user",
        "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
