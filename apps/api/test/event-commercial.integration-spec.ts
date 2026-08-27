import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientType,
  CommercialChannel,
  CreditLineStatus,
  EventSocialType,
  EventStatus,
  InvitationDesignType,
  LedgerMovementType,
  ServiceCode,
  UserRole,
  VenuePriceTier
} from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Event commercial authorization and price lock', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it.each([
    {
      label: 'Standard Flyer',
      channel: CommercialChannel.STANDARD,
      serviceCode: ServiceCode.FLYER,
      capacityMin: 1,
      capacityMax: 50,
      venueTier: null,
      capacity: 50,
      credits: 11
    },
    {
      label: 'Partner Flyer',
      channel: CommercialChannel.PARTNER,
      serviceCode: ServiceCode.FLYER,
      capacityMin: 1,
      capacityMax: 100,
      venueTier: null,
      capacity: 100,
      credits: 17
    },
    {
      label: 'Venue QR',
      channel: CommercialChannel.VENUE,
      serviceCode: ServiceCode.PHYSICAL_QR,
      capacityMin: null,
      capacityMax: null,
      venueTier: VenuePriceTier.ONE_TO_TWO,
      capacity: 150,
      credits: 23
    }
  ])('authorizes $label with exact Pricing V2 terms and no financial mutation', async (rule) => {
    const fixture = await createFixture(rule.channel, rule.serviceCode, rule.capacity);
    const price = await prisma.servicePrice.create({
      data: {
        serviceId: fixture.serviceId,
        pricingVersion: 2,
        commercialChannel: rule.channel,
        capacityMin: rule.capacityMin,
        capacityMax: rule.capacityMax,
        venueTier: rule.venueTier,
        credits: rule.credits,
        validFrom: new Date(Date.now() - 60_000)
      }
    });
    await prisma.creditLine.create({
      data: { clientId: fixture.clientId, limitCredits: rule.credits, status: CreditLineStatus.ACTIVE }
    });

    const quote = await adminGet(fixture, 'commercial-quote').expect(200);
    expect(quote.body).toMatchObject({
      commercialChannel: rule.channel,
      serviceCode: rule.serviceCode,
      servicePriceId: price.id,
      finalCostCredits: rule.credits,
      coverage: { sufficient: true }
    });

    await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } });
    expect(event).toMatchObject({
      commercialAuthorizedByUserId: fixture.adminId,
      commercialServicePriceId: price.id,
      commercialBaseCostCredits: rule.credits,
      commercialPromotionDiscountCredits: 0,
      commercialFinalCostCredits: rule.credits,
      commercialChannelSnapshot: rule.channel,
      commercialCapacitySnapshot: rule.capacity,
      commercialCapacityMinSnapshot: rule.capacityMin,
      commercialCapacityMaxSnapshot: rule.capacityMax,
      commercialVenueTierSnapshot: rule.venueTier
    });
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.receipt.count()).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'EVENT_COMMERCIAL_AUTHORIZE' } })
    ).toBe(1);

    if (rule.serviceCode === ServiceCode.PHYSICAL_QR) {
      await adminPost(fixture, 'design-kickoff')
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe('EVENT_DESIGN_KICKOFF_NOT_APPLICABLE');
        });
    }
  });

  it('enforces coverage, actor/tenant boundaries, kickoff, and concurrent idempotency', async () => {
    const fixture = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLIPBOOK, 50);
    await createCapacityPrice(fixture.serviceId, CommercialChannel.STANDARD, 1, 50, 12);
    const other = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLIPBOOK, 50);

    await adminGet({ ...fixture, clientId: other.clientId }, 'commercial-quote').expect(404);
    await plannerPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(403);
    await adminPost(fixture, 'design-kickoff')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_AUTHORIZATION_REQUIRED'));
    await adminDesign(fixture, 'flipbook')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_AUTHORIZATION_REQUIRED'));
    await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_FINANCIAL_COVERAGE_INSUFFICIENT'));

    await prisma.creditLine.create({
      data: { clientId: fixture.clientId, limitCredits: 12, status: CreditLineStatus.ACTIVE }
    });
    const authorizations = await Promise.all([
      adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }),
      adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true })
    ]);
    expect(authorizations.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'EVENT_COMMERCIAL_AUTHORIZE' } })
    ).toBe(1);
    await adminDesign(fixture, 'flipbook')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_DESIGN_KICKOFF_REQUIRED'));

    const kickoffs = await Promise.all([adminPost(fixture, 'design-kickoff'), adminPost(fixture, 'design-kickoff')]);
    expect(kickoffs.map(({ status }) => status)).toEqual([200, 200]);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'EVENT_DESIGN_KICKOFF' } })).toBe(
      1
    );
    await adminDesign(fixture, 'flipbook').expect(201);
  });

  it('uses purchased, active-line, and mixed coverage while excluding suspended or expired lines', async () => {
    const purchased = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLYER, 50);
    await createCapacityPrice(purchased.serviceId, CommercialChannel.STANDARD, 1, 50, 12);
    await grantCredits(purchased.clientId, purchased.adminId, 12);
    const purchasedCounts = await financialCounts();
    await adminPost(purchased, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    expect(await financialCounts()).toEqual(purchasedCounts);

    const mixed = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLYER, 50);
    await grantCredits(mixed.clientId, mixed.adminId, 5);
    await prisma.creditLine.create({
      data: { clientId: mixed.clientId, limitCredits: 7, status: CreditLineStatus.ACTIVE }
    });
    const mixedCounts = await financialCounts();
    await adminPost(mixed, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    expect(await financialCounts()).toEqual(mixedCounts);

    for (const line of [
      { status: CreditLineStatus.SUSPENDED, expiresAt: null },
      { status: CreditLineStatus.ACTIVE, expiresAt: new Date(Date.now() - 60_000) }
    ]) {
      const unavailable = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLYER, 50);
      await prisma.creditLine.create({ data: { clientId: unavailable.clientId, limitCredits: 12, ...line } });
      await adminPost(unavailable, 'commercial-authorization', { acceptanceConfirmed: true })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_FINANCIAL_COVERAGE_INSUFFICIENT'));
    }
  });

  it.each([
    { lockedCredits: 12, currentCredits: 21, availableCredits: 12, sufficient: true },
    { lockedCredits: 21, currentCredits: 12, availableCredits: 12, sufficient: false }
  ])(
    'keeps the locked $lockedCredits-credit quote authoritative when the current quote costs $currentCredits',
    async ({ lockedCredits, currentCredits, availableCredits, sufficient }) => {
      const fixture = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLYER, 50);
      const lockedPrice = await createCapacityPrice(
        fixture.serviceId,
        CommercialChannel.STANDARD,
        1,
        50,
        lockedCredits
      );
      await prisma.creditLine.create({
        data: { clientId: fixture.clientId, limitCredits: lockedCredits, status: CreditLineStatus.ACTIVE }
      });
      await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
      await prisma.creditLine.update({
        where: { clientId: fixture.clientId },
        data: { limitCredits: availableCredits }
      });
      const replacementAt = new Date();
      await prisma.servicePrice.update({ where: { id: lockedPrice.id }, data: { validUntil: replacementAt } });
      const currentPrice = await prisma.servicePrice.create({
        data: {
          serviceId: fixture.serviceId,
          pricingVersion: 2,
          commercialChannel: CommercialChannel.STANDARD,
          capacityMin: 1,
          capacityMax: 50,
          credits: currentCredits,
          validFrom: replacementAt
        }
      });

      const quote = await adminGet(fixture, 'commercial-quote').expect(200);
      expect(quote.body).toMatchObject({
        quoteSource: 'LOCKED',
        servicePriceId: lockedPrice.id,
        finalCostCredits: lockedCredits,
        lockedServicePriceId: lockedPrice.id,
        lockedFinalCostCredits: lockedCredits,
        coverage: { totalAvailableCredits: availableCredits, sufficient },
        lockMatchesCurrentContext: true
      });
      expect(quote.body.servicePriceId).not.toBe(currentPrice.id);
    }
  );

  it('returns a valid historical lock after its price closes without a replacement', async () => {
    const fixture = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLYER, 50);
    const lockedPrice = await createCapacityPrice(fixture.serviceId, CommercialChannel.STANDARD, 1, 50, 12);
    await prisma.creditLine.create({
      data: { clientId: fixture.clientId, limitCredits: 12, status: CreditLineStatus.ACTIVE }
    });
    await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    await prisma.servicePrice.update({ where: { id: lockedPrice.id }, data: { validUntil: new Date() } });

    await adminGet(fixture, 'commercial-quote')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          quoteSource: 'LOCKED',
          servicePriceId: lockedPrice.id,
          finalCostCredits: 12,
          lockMatchesCurrentContext: true
        });
      });
  });

  it('previews current stale-channel terms without overwriting the retained lock', async () => {
    const fixture = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLIPBOOK, 50);
    const lockedPrice = await createCapacityPrice(fixture.serviceId, CommercialChannel.STANDARD, 1, 50, 10);
    await prisma.creditLine.create({
      data: { clientId: fixture.clientId, limitCredits: 100, status: CreditLineStatus.ACTIVE }
    });
    await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    await prisma.client.update({
      where: { id: fixture.clientId },
      data: { commercialChannel: CommercialChannel.PARTNER }
    });
    const currentPrice = await createCapacityPrice(fixture.serviceId, CommercialChannel.PARTNER, 1, 100, 16);

    await adminGet(fixture, 'commercial-quote')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          quoteSource: 'CURRENT',
          commercialChannel: CommercialChannel.PARTNER,
          servicePriceId: currentPrice.id,
          finalCostCredits: 16,
          lockedServicePriceId: lockedPrice.id,
          lockedFinalCostCredits: 10,
          lockMatchesCurrentContext: false
        });
      });
    expect(await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).toMatchObject({
      commercialServicePriceId: lockedPrice.id,
      commercialFinalCostCredits: 10,
      commercialChannelSnapshot: CommercialChannel.STANDARD
    });
  });

  it('retains a stale lock when no current re-quote is available', async () => {
    const fixture = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLIPBOOK, 50);
    const lockedPrice = await createCapacityPrice(fixture.serviceId, CommercialChannel.STANDARD, 1, 50, 10);
    await prisma.creditLine.create({
      data: { clientId: fixture.clientId, limitCredits: 10, status: CreditLineStatus.ACTIVE }
    });
    await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    await prisma.client.update({
      where: { id: fixture.clientId },
      data: { commercialChannel: CommercialChannel.PARTNER }
    });

    await adminGet(fixture, 'commercial-quote')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          quoteSource: 'LOCKED',
          servicePriceId: lockedPrice.id,
          finalCostCredits: 10,
          lockedServicePriceId: lockedPrice.id,
          lockMatchesCurrentContext: false
        });
      });
  });

  it('invalidates before kickoff and requires explicit requote after personalized work or channel change', async () => {
    const fixture = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLIPBOOK, 50);
    const firstPrice = await createCapacityPrice(fixture.serviceId, CommercialChannel.STANDARD, 1, 50, 10);
    const secondPrice = await createCapacityPrice(fixture.serviceId, CommercialChannel.STANDARD, 51, 100, 14);
    await prisma.creditLine.create({
      data: { clientId: fixture.clientId, limitCredits: 100, status: CreditLineStatus.ACTIVE }
    });
    await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);

    await plannerPatch(fixture, { capacity: 80 }).expect(200);
    expect(await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).toMatchObject({
      capacity: 80,
      commercialAuthorizedAt: null,
      commercialServicePriceId: null
    });
    expect(
      await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'EVENT_COMMERCIAL_TERMS_INVALIDATE' } })
    ).toBe(1);
    await adminPost(fixture, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).commercialServicePriceId).toBe(
      secondPrice.id
    );
    await adminPost(fixture, 'design-kickoff').expect(200);
    const originalKickoff = (await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).designKickoffAt;
    await adminDesign(fixture, 'flipbook').expect(201);
    await plannerPatch(fixture, { capacity: 50 })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_REQUOTE_REQUIRED'));

    await adminPost(fixture, 'commercial-requote', { capacity: 50, acceptanceConfirmed: true }).expect(200);
    expect(await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).toMatchObject({
      capacity: 50,
      commercialServicePriceId: firstPrice.id,
      designKickoffAt: originalKickoff
    });

    await prisma.client.update({
      where: { id: fixture.clientId },
      data: { commercialChannel: CommercialChannel.PARTNER }
    });
    await createCapacityPrice(fixture.serviceId, CommercialChannel.PARTNER, 1, 100, 16);
    await adminPost(fixture, 'design-kickoff')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_TERMS_STALE'));
    await adminPost(fixture, 'commercial-requote', { acceptanceConfirmed: true }).expect(200);
    expect(await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).toMatchObject({
      commercialChannelSnapshot: CommercialChannel.PARTNER,
      commercialFinalCostCredits: 16,
      designKickoffAt: originalKickoff
    });
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.receipt.count()).toBe(0);
  });

  it('invalidates a pre-kickoff lock when the SKU changes and authorizes the new current price', async () => {
    const skuChange = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLIPBOOK, 50);
    await createCapacityPrice(skuChange.serviceId, CommercialChannel.STANDARD, 1, 100, 10);
    const flyer = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    const flyerPrice = await createCapacityPrice(flyer.id, CommercialChannel.STANDARD, 1, 100, 13);
    await prisma.creditLine.create({
      data: { clientId: skuChange.clientId, limitCredits: 100, status: CreditLineStatus.ACTIVE }
    });
    await adminPost(skuChange, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    await plannerPatch(skuChange, { serviceId: flyer.id }).expect(200);
    expect(await prisma.event.findUniqueOrThrow({ where: { id: skuChange.eventId } })).toMatchObject({
      serviceId: flyer.id,
      commercialAuthorizedAt: null,
      commercialServicePriceId: null
    });
    await adminPost(skuChange, 'commercial-authorization', { acceptanceConfirmed: true }).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: skuChange.eventId } })).commercialServicePriceId).toBe(
      flyerPrice.id
    );
  });

  it('keeps legacy custom work without fake acceptance and requires an explicit requote', async () => {
    const legacy = await createFixture(CommercialChannel.STANDARD, ServiceCode.FLIPBOOK, 50);
    await createCapacityPrice(legacy.serviceId, CommercialChannel.STANDARD, 1, 100, 10);
    await prisma.creditLine.create({
      data: { clientId: legacy.clientId, limitCredits: 100, status: CreditLineStatus.ACTIVE }
    });
    const legacyDesign = await prisma.invitationDesign.create({
      data: { eventId: legacy.eventId, type: InvitationDesignType.FLIPBOOK }
    });
    expect(await prisma.event.findUniqueOrThrow({ where: { id: legacy.eventId } })).toMatchObject({
      commercialAuthorizedAt: null,
      designKickoffAt: null
    });
    await plannerPatch(legacy, { capacity: 60 })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_REQUOTE_REQUIRED'));
    await adminPost(legacy, 'commercial-authorization', { acceptanceConfirmed: true })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_COMMERCIAL_REQUOTE_REQUIRED'));
    await adminPost(legacy, 'commercial-requote', { acceptanceConfirmed: true }).expect(200);
    expect(await prisma.invitationDesign.findUniqueOrThrow({ where: { id: legacyDesign.id } })).toMatchObject({
      deletedAt: null
    });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: legacy.eventId } })).designKickoffAt).toBeNull();
    await adminDesign(legacy, 'flipbook')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_DESIGN_KICKOFF_REQUIRED'));
  });

  it('publishes only Platform Admin commercial operations in OpenAPI', () => {
    const paths = createOpenApiDocument(app).paths;
    for (const suffix of ['commercial-quote', 'commercial-authorization', 'design-kickoff', 'commercial-requote']) {
      expect(paths[`/api/v1/admin/clients/{clientId}/events/{eventId}/${suffix}`]).toBeDefined();
      expect(paths[`/api/v1/events/{eventId}/${suffix}`]).toBeUndefined();
    }
  });

  async function createFixture(channel: CommercialChannel, serviceCode: ServiceCode, capacity: number) {
    const client = await prisma.client.create({
      data: { type: ClientType.PLANNER, name: `Client ${randomUUID()}`, commercialChannel: channel }
    });
    const planner = await createUser(client.id, UserRole.INDEPENDENT_PLANNER);
    const admin = await createUser(null, UserRole.PLATFORM_ADMIN);
    const service =
      (await prisma.service.findUnique({ where: { code: serviceCode } })) ??
      (await prisma.service.create({ data: { code: serviceCode } }));
    const event = await prisma.event.create({
      data: {
        clientId: client.id,
        createdByUserId: planner.id,
        assignedPlannerUserId: planner.id,
        serviceId: service.id,
        name: 'Commercial Event',
        socialType: EventSocialType.WEDDING,
        status: EventStatus.CONFIGURED,
        eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
        timeZone: 'America/Mexico_City',
        capacity,
        confirmationEnabled: true
      }
    });
    return {
      clientId: client.id,
      eventId: event.id,
      serviceId: service.id,
      adminId: admin.id,
      adminCookie: await login(admin.email),
      plannerCookie: await login(planner.email)
    };
  }

  function createCapacityPrice(
    serviceId: string,
    channel: CommercialChannel,
    capacityMin: number,
    capacityMax: number,
    credits: number
  ) {
    return prisma.servicePrice.create({
      data: {
        serviceId,
        pricingVersion: 2,
        commercialChannel: channel,
        capacityMin,
        capacityMax,
        credits,
        validFrom: new Date(Date.now() - 60_000)
      }
    });
  }

  function adminGet(fixture: { clientId: string; eventId: string; adminCookie: string }, suffix: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/${suffix}`)
      .set('Cookie', fixture.adminCookie);
  }

  function adminPost(
    fixture: { clientId: string; eventId: string; adminCookie: string },
    suffix: string,
    body?: Record<string, unknown>
  ) {
    const pending = request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/${suffix}`)
      .set('Cookie', fixture.adminCookie)
      .set('Origin', trustedOrigin);
    return body === undefined ? pending : pending.send(body);
  }

  function plannerPost(
    fixture: { clientId: string; eventId: string; plannerCookie: string },
    suffix: string,
    body: Record<string, unknown>
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/${suffix}`)
      .set('Cookie', fixture.plannerCookie)
      .set('Origin', trustedOrigin)
      .send(body);
  }

  function plannerPatch(fixture: { eventId: string; plannerCookie: string }, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/api/v1/events/${fixture.eventId}`)
      .set('Cookie', fixture.plannerCookie)
      .set('Origin', trustedOrigin)
      .send(body);
  }

  function adminDesign(fixture: { clientId: string; eventId: string; adminCookie: string }, kind: 'flipbook') {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design/${kind}`)
      .set('Cookie', fixture.adminCookie)
      .set('Origin', trustedOrigin);
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    return prisma.user.create({ data: { clientId, role, email, passwordHash: await hashPassword(password) } });
  }

  async function grantCredits(clientId: string, actorUserId: string, credits: number) {
    const key = `commercial-grant-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: {
        clientId,
        operationType: LedgerMovementType.MANUAL_CREDIT_GRANT,
        operationReference: key,
        idempotencyKey: key
      }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId,
        actorUserId,
        movementType: LedgerMovementType.MANUAL_CREDIT_GRANT,
        purchasedCreditDelta: credits,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: key,
        idempotencyKey: key,
        receiptId: receipt.id
      }
    });
  }

  async function financialCounts() {
    return { ledger: await prisma.ledgerEntry.count(), receipts: await prisma.receipt.count() };
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

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "hotspot", "flipbook_page", "invitation_design", "file_asset", "event_state_operation", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
