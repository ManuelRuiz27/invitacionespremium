import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { ClientType, CommercialChannel, CreditLineStatus, ServiceCode, UserRole } from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('OP-04 operator intake and Planner assignment', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('quotes without writes and atomically creates an assigned Event with real Admin provenance and exact lock', async () => {
    const fixture = await organizationFixture();
    const before = await sideEffectCounts();
    const quote = await intakeQuote(fixture.clientId, fixture.adminCookie, ServiceCode.FLYER, 80).expect(200);
    expect(quote.body).toMatchObject({
      clientId: fixture.clientId,
      commercialChannel: CommercialChannel.STANDARD,
      serviceCode: ServiceCode.FLYER,
      servicePriceId: fixture.priceId,
      capacityMin: 1,
      capacityMax: 100,
      finalCostCredits: 25,
      coverage: { sufficient: true }
    });
    expect(await sideEffectCounts()).toEqual(before);

    const created = await intakeCreate(fixture.clientId, fixture.adminCookie, {
      name: 'Boda operator-led',
      serviceCode: ServiceCode.FLYER,
      capacity: 80,
      acceptedServicePriceId: quote.body.servicePriceId,
      assignedPlannerUserId: fixture.plannerOne.id,
      acceptanceConfirmed: true
    }).expect(201);
    expect(created.body).toMatchObject({
      clientId: fixture.clientId,
      createdByUserId: fixture.adminId,
      assignedPlannerUserId: fixture.plannerOne.id,
      serviceId: fixture.serviceId,
      commercialServicePriceId: fixture.priceId,
      commercialFinalCostCredits: 25
    });
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.createdByUserId).toBe(fixture.adminId);
    expect(stored.assignedPlannerUserId).toBe(fixture.plannerOne.id);
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.receipt.count()).toBe(0);
    expect(
      await prisma.auditLog.findMany({ where: { eventId: stored.id }, orderBy: { occurredAt: 'asc' } })
    ).toMatchObject([
      { actorId: fixture.adminId, action: 'EVENT_CREATE' },
      { actorId: fixture.adminId, action: 'EVENT_COMMERCIAL_AUTHORIZE' }
    ]);
  });

  it('rejects stale acceptance and insufficient coverage without persisting an Event', async () => {
    const stale = await organizationFixture();
    const quote = await intakeQuote(stale.clientId, stale.adminCookie, ServiceCode.FLYER, 80).expect(200);
    const replacementAt = new Date();
    await prisma.servicePrice.update({ where: { id: stale.priceId }, data: { validUntil: replacementAt } });
    await prisma.servicePrice.create({
      data: {
        serviceId: stale.serviceId,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 100,
        credits: 30,
        validFrom: replacementAt
      }
    });
    await intakeCreate(stale.clientId, stale.adminCookie, {
      serviceCode: ServiceCode.FLYER,
      capacity: 80,
      acceptedServicePriceId: quote.body.servicePriceId,
      assignedPlannerUserId: stale.plannerOne.id,
      acceptanceConfirmed: true
    })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_QUOTE_STALE'));
    expect(await prisma.event.count()).toBe(0);

    await resetDatabase();
    const uncovered = await organizationFixture(10);
    const uncoveredQuote = await intakeQuote(uncovered.clientId, uncovered.adminCookie, ServiceCode.FLYER, 80).expect(
      200
    );
    expect(uncoveredQuote.body.coverage.sufficient).toBe(false);
    await intakeCreate(uncovered.clientId, uncovered.adminCookie, {
      serviceCode: ServiceCode.FLYER,
      capacity: 80,
      acceptedServicePriceId: uncoveredQuote.body.servicePriceId,
      assignedPlannerUserId: uncovered.plannerOne.id,
      acceptanceConfirmed: true
    })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_FINANCIAL_COVERAGE_INSUFFICIENT'));
    expect(await prisma.event.count()).toBe(0);
  });

  it('changes Event and child-resource access immediately without changing creator or Commercial terms', async () => {
    const fixture = await organizationFixture();
    const quote = await intakeQuote(fixture.clientId, fixture.adminCookie, ServiceCode.FLYER, 80).expect(200);
    const created = await intakeCreate(fixture.clientId, fixture.adminCookie, {
      serviceCode: ServiceCode.FLYER,
      capacity: 80,
      acceptedServicePriceId: quote.body.servicePriceId,
      assignedPlannerUserId: fixture.plannerOne.id,
      acceptanceConfirmed: true
    }).expect(201);
    const plannerOneCookie = await login(fixture.plannerOne.email);
    const plannerTwoCookie = await login(fixture.plannerTwo.email);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${created.body.id}`)
      .set('Cookie', plannerOneCookie)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${created.body.id}`)
      .set('Cookie', plannerTwoCookie)
      .expect(404);
    await contactCreate(created.body.id, plannerOneCookie, 'Asignada').expect(201);
    await contactCreate(created.body.id, plannerTwoCookie, 'No asignada').expect(404);
    const commercialBefore = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${fixture.clientId}/events/${created.body.id}/assignment`)
      .set('Origin', origin)
      .set('Cookie', fixture.adminCookie)
      .send({ assignedPlannerUserId: fixture.plannerTwo.id })
      .expect(200)
      .expect(({ body }) => expect(body.assignedPlannerUserId).toBe(fixture.plannerTwo.id));

    await request(app.getHttpServer())
      .get(`/api/v1/events/${created.body.id}`)
      .set('Cookie', plannerOneCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${created.body.id}`)
      .set('Cookie', plannerTwoCookie)
      .expect(200);
    await contactCreate(created.body.id, plannerTwoCookie, 'Nueva asignada').expect(201);
    const commercialAfter = await prisma.event.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(commercialAfter).toMatchObject({
      createdByUserId: fixture.adminId,
      assignedPlannerUserId: fixture.plannerTwo.id,
      commercialServicePriceId: commercialBefore.commercialServicePriceId,
      commercialFinalCostCredits: commercialBefore.commercialFinalCostCredits,
      status: commercialBefore.status
    });
    expect(
      await prisma.auditLog.count({ where: { eventId: created.body.id, action: 'EVENT_PLANNER_ASSIGNMENT_UPDATE' } })
    ).toBe(1);
  });

  it('enforces candidate type/tenant rules and exposes Independent Planners for Planner clients', async () => {
    const fixture = await organizationFixture();
    const foreign = await prisma.client.create({ data: { type: ClientType.ORGANIZATION, name: 'Foreign' } });
    const foreignPlanner = await createUser(foreign.id, UserRole.ORGANIZATION_PLANNER);
    const quote = await intakeQuote(fixture.clientId, fixture.adminCookie, ServiceCode.FLYER, 80).expect(200);
    await intakeCreate(fixture.clientId, fixture.adminCookie, {
      serviceCode: ServiceCode.FLYER,
      capacity: 80,
      acceptedServicePriceId: quote.body.servicePriceId,
      assignedPlannerUserId: foreignPlanner.id,
      acceptanceConfirmed: true
    }).expect(409);
    await intakeCreate(fixture.clientId, fixture.adminCookie, {
      serviceCode: ServiceCode.FLYER,
      capacity: 80,
      acceptedServicePriceId: quote.body.servicePriceId,
      assignedPlannerUserId: fixture.organizationAdmin.id,
      acceptanceConfirmed: true
    }).expect(409);

    const plannerClient = await prisma.client.create({ data: { type: ClientType.PLANNER, name: 'Planner Client' } });
    const independent = await createUser(plannerClient.id, UserRole.INDEPENDENT_PLANNER);
    const users = await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${plannerClient.id}/users`)
      .set('Cookie', fixture.adminCookie)
      .expect(200);
    expect(users.body).toMatchObject([{ id: independent.id, role: UserRole.INDEPENDENT_PLANNER }]);
  });

  it('enforces assignment in PostgreSQL and backfills only unambiguous Planner creators without changing provenance', async () => {
    const organization = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, name: 'Backfill Organization' }
    });
    const plannerClient = await prisma.client.create({ data: { type: ClientType.PLANNER, name: 'Backfill Planner' } });
    const organizationAdmin = await createUser(organization.id, UserRole.ORGANIZATION_ADMIN);
    const organizationPlanner = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const independentPlanner = await createUser(plannerClient.id, UserRole.INDEPENDENT_PLANNER);
    const platformAdmin = await createUser(null, UserRole.PLATFORM_ADMIN);
    const adminCreated = await prisma.event.create({
      data: { clientId: organization.id, createdByUserId: organizationAdmin.id }
    });
    const organizationPlannerCreated = await prisma.event.create({
      data: { clientId: organization.id, createdByUserId: organizationPlanner.id }
    });
    const independentCreated = await prisma.event.create({
      data: { clientId: plannerClient.id, createdByUserId: independentPlanner.id }
    });

    await prisma.$executeRaw`
      UPDATE "event" AS event
      SET "assigned_planner_user_id" = event."created_by_user_id"
      FROM "app_user" AS creator
      WHERE creator."id" = event."created_by_user_id"
        AND creator."client_id" = event."client_id"
        AND creator."deleted_at" IS NULL
        AND creator."role" IN ('INDEPENDENT_PLANNER', 'ORGANIZATION_PLANNER')
    `;
    expect(await prisma.event.findUniqueOrThrow({ where: { id: adminCreated.id } })).toMatchObject({
      createdByUserId: organizationAdmin.id,
      assignedPlannerUserId: null
    });
    expect(await prisma.event.findUniqueOrThrow({ where: { id: organizationPlannerCreated.id } })).toMatchObject({
      createdByUserId: organizationPlanner.id,
      assignedPlannerUserId: organizationPlanner.id
    });
    expect(await prisma.event.findUniqueOrThrow({ where: { id: independentCreated.id } })).toMatchObject({
      createdByUserId: independentPlanner.id,
      assignedPlannerUserId: independentPlanner.id
    });

    await expect(
      prisma.event.create({
        data: {
          clientId: organization.id,
          createdByUserId: platformAdmin.id,
          assignedPlannerUserId: independentPlanner.id
        }
      })
    ).rejects.toThrow();
    await expect(
      prisma.event.create({
        data: {
          clientId: organization.id,
          createdByUserId: platformAdmin.id,
          assignedPlannerUserId: organizationAdmin.id
        }
      })
    ).rejects.toThrow();
    await expect(
      prisma.event.create({
        data: { clientId: organization.id, createdByUserId: independentPlanner.id }
      })
    ).rejects.toThrow();
    await expect(
      prisma.event.create({
        data: {
          clientId: organization.id,
          createdByUserId: platformAdmin.id,
          assignedPlannerUserId: organizationPlanner.id
        }
      })
    ).resolves.toMatchObject({ createdByUserId: platformAdmin.id, assignedPlannerUserId: organizationPlanner.id });
  });

  it('publishes the intake, assignment, and dual ownership projection in OpenAPI', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths['/api/v1/admin/clients/{clientId}/events/intake-quote']).toBeDefined();
    expect(document.paths['/api/v1/admin/clients/{clientId}/events']?.post).toBeDefined();
    expect(document.paths['/api/v1/admin/clients/{clientId}/events/{eventId}/assignment']?.patch).toBeDefined();
    expect(document.components?.schemas?.EventResponseDto).toMatchObject({
      required: expect.arrayContaining(['createdByUserId', 'assignedPlannerUserId']),
      properties: { assignedPlannerUserId: { nullable: true } }
    });
  });

  async function organizationFixture(lineLimit = 100) {
    const client = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, name: `Organization ${randomUUID()}` }
    });
    const organizationAdmin = await createUser(client.id, UserRole.ORGANIZATION_ADMIN);
    const plannerOne = await createUser(client.id, UserRole.ORGANIZATION_PLANNER);
    const plannerTwo = await createUser(client.id, UserRole.ORGANIZATION_PLANNER);
    const admin = await createUser(null, UserRole.PLATFORM_ADMIN);
    const service = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    const price = await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 100,
        credits: 25,
        validFrom: new Date(Date.now() - 60_000)
      }
    });
    await prisma.creditLine.create({
      data: { clientId: client.id, limitCredits: lineLimit, status: CreditLineStatus.ACTIVE }
    });
    return {
      clientId: client.id,
      organizationAdmin,
      plannerOne,
      plannerTwo,
      adminId: admin.id,
      adminCookie: await login(admin.email),
      serviceId: service.id,
      priceId: price.id
    };
  }

  function intakeQuote(clientId: string, cookie: string, serviceCode: ServiceCode, capacity: number) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${clientId}/events/intake-quote`)
      .query({ serviceCode, capacity })
      .set('Cookie', cookie);
  }

  function intakeCreate(clientId: string, cookie: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function contactCreate(eventId: string, cookie: string, name: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/contacts`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ name, whatsappPhone: `+5255${Math.floor(10_000_000 + Math.random() * 89_999_999)}` });
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { clientId, role, email, passwordHash: await hashPassword(password) }
    });
    return { id: user.id, email };
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing session cookie.');
    return cookie;
  }

  async function sideEffectCounts() {
    return {
      events: await prisma.event.count(),
      ledger: await prisma.ledgerEntry.count(),
      receipts: await prisma.receipt.count(),
      audits: await prisma.auditLog.count()
    };
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "contact_import_preview", "contact", "contact_group", "event_state_operation", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
