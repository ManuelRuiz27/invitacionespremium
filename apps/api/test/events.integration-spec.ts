import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  AuditActorType,
  ClientType,
  EventSocialType,
  EventStatus,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';
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
      { capacity: 0 }
    ]) {
      await createEvent(firstCookie, body).expect(400);
    }

    const platformCookie = await login(platform.email);
    await request(app.getHttpServer()).get('/api/v1/events').set('Cookie', platformCookie).expect(403);
    await createEvent(platformCookie, {}).expect(403);
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

  it('publishes the CODEX-040 endpoints in OpenAPI', () => {
    const document = createOpenApiDocument(app);
    const paths = document.paths;
    for (const path of [
      '/api/v1/events',
      '/api/v1/events/{eventId}',
      '/api/v1/admin/events',
      '/api/v1/admin/events/{eventId}',
      '/api/v1/admin/events/{eventId}/restore'
    ]) {
      expect(paths).toHaveProperty(path);
    }
    expect(document.components?.schemas?.EventResponseDto).toMatchObject({
      properties: {
        serviceCode: {
          nullable: true,
          enum: ['FLIPBOOK', 'FLYER', 'PHYSICAL_QR', 'DEMO']
        }
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

  async function createClientUser(type: ClientType, role: UserRole) {
    const client = await prisma.client.create({ data: { type, name: `Client ${randomUUID()}` } });
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
