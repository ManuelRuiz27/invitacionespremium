import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientType,
  CommercialChannel,
  EventSocialType,
  EventStatus,
  LedgerMovementType,
  PromotionScope,
  ServiceCode,
  UserRole,
  VenuePriceTier
} from '../src/generated/prisma/client';
import { ServicesPricingService } from '../src/services-pricing/services-pricing.service';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const execFileAsync = promisify(execFile);

describe('Services, prices, and promotions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servicesPricing: ServicesPricingService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests.');
    }

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
    servicesPricing = app.get(ServicesPricingService);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedInitialCatalog();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  it('contains four services and the 16 configured V2 rules', async () => {
    expect(await prisma.service.count()).toBe(4);
    expect(await prisma.servicePrice.count()).toBe(16);

    const prices = await prisma.servicePrice.findMany({
      include: { service: true },
      orderBy: [{ commercialChannel: 'asc' }, { service: { code: 'asc' } }, { capacityMin: 'asc' }]
    });
    expect(prices.filter((price) => price.commercialChannel === CommercialChannel.STANDARD)).toHaveLength(9);
    expect(prices.filter((price) => price.commercialChannel === CommercialChannel.PARTNER)).toHaveLength(3);
    expect(prices.filter((price) => price.commercialChannel === CommercialChannel.VENUE)).toHaveLength(4);
    expect(prices.every((price) => price.pricingVersion === 2 && price.clientType === null)).toBe(true);
  });

  it('does not derive commercial pricing from ClientType', async () => {
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organizationPlanner = await createOperationalUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_PLANNER);
    const plannerCookie = await login(planner.email);
    const organizationCookie = await login(organizationPlanner.email);

    const plannerResponse = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Cookie', plannerCookie)
      .expect(200);
    const organizationResponse = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Cookie', organizationCookie)
      .expect(200);

    expect(plannerResponse.body).toEqual(organizationResponse.body);
    expect(priceCreditsFor(plannerResponse.body, ServiceCode.FLIPBOOK, 100)).toBe(350);
    expect(priceCreditsFor(organizationResponse.body, ServiceCode.PHYSICAL_QR, 50)).toBe(125);
  });

  it('resolves Standard boundary matrix and rejects unsupported capacity', async () => {
    const client = await createOperationalUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    for (const [serviceCode, capacity, credits] of [
      [ServiceCode.PHYSICAL_QR, 50, 125],
      [ServiceCode.PHYSICAL_QR, 51, 150],
      [ServiceCode.PHYSICAL_QR, 100, 150],
      [ServiceCode.PHYSICAL_QR, 101, 175],
      [ServiceCode.PHYSICAL_QR, 150, 175],
      [ServiceCode.FLYER, 50, 225],
      [ServiceCode.FLYER, 100, 275],
      [ServiceCode.FLYER, 150, 325],
      [ServiceCode.FLIPBOOK, 50, 300],
      [ServiceCode.FLIPBOOK, 100, 350],
      [ServiceCode.FLIPBOOK, 150, 400]
    ] as const) {
      await expect(servicesPricing.resolveCurrentPrice(client.clientId, serviceCode, capacity)).resolves.toMatchObject({
        commercialChannel: CommercialChannel.STANDARD,
        credits
      });
    }
    await expect(servicesPricing.resolveCurrentPrice(client.clientId, ServiceCode.FLIPBOOK, 0)).rejects.toMatchObject({
      response: { code: 'PRICE_CAPACITY_NOT_SUPPORTED' }
    });

    await expect(
      servicesPricing.resolveCurrentPrice(
        client.clientId,
        ServiceCode.FLIPBOOK,
        100,
        new Date('2000-01-01T00:00:00.000Z')
      )
    ).rejects.toMatchObject({
      response: {
        code: 'CURRENT_PRICE_NOT_FOUND'
      }
    });
  });

  it('resolves only explicit Partner applicability independently of ClientType', async () => {
    const organization = await createOperationalUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    await prisma.client.update({
      where: { id: organization.clientId },
      data: { commercialChannel: CommercialChannel.PARTNER }
    });
    for (const [serviceCode, credits] of [
      [ServiceCode.PHYSICAL_QR, 120],
      [ServiceCode.FLYER, 215],
      [ServiceCode.FLIPBOOK, 275]
    ] as const) {
      await expect(servicesPricing.resolveCurrentPrice(organization.clientId, serviceCode, 100)).resolves.toMatchObject(
        {
          commercialChannel: CommercialChannel.PARTNER,
          credits
        }
      );
    }
    await expect(
      servicesPricing.resolveCurrentPrice(organization.clientId, ServiceCode.FLIPBOOK, 101)
    ).rejects.toMatchObject({ response: { code: 'CURRENT_PRICE_NOT_FOUND' } });

    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    await prisma.client.update({
      where: { id: planner.clientId },
      data: { commercialChannel: CommercialChannel.VENUE }
    });
    await expect(
      servicesPricing.resolveCurrentPrice(planner.clientId, ServiceCode.PHYSICAL_QR, 150)
    ).resolves.toMatchObject({
      commercialChannel: CommercialChannel.VENUE,
      credits: 120
    });
    await expect(servicesPricing.resolveCurrentPrice(planner.clientId, ServiceCode.FLYER, 50)).rejects.toMatchObject({
      response: { code: 'VENUE_SERVICE_PRICE_NOT_AVAILABLE' }
    });
  });

  it('publishes only current Standard prices with fixed-credit MXN projection', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/public/pricing').expect(200);
    expect(response.body).toHaveLength(9);
    expect(new Set(response.body.map((item: { serviceCode: string }) => item.serviceCode))).toEqual(
      new Set([ServiceCode.PHYSICAL_QR, ServiceCode.FLYER, ServiceCode.FLIPBOOK])
    );
    for (const item of response.body as Array<Record<string, unknown>>) {
      expect(item.amountMxnCents).toBe(Number(item.credits) * 2000);
      expect(item).not.toHaveProperty('commercialChannel');
      expect(item).not.toHaveProperty('clientId');
      expect(item).not.toHaveProperty('venueTier');
      expect(item).not.toHaveProperty('balance');
      expect(item).not.toHaveProperty('creditLine');
      expect(item).not.toHaveProperty('receipt');
    }
  });

  it('uses only charged M-1 Events, retains partial refunds, and excludes full refunds for Venue volume', async () => {
    const venue = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    await prisma.client.update({ where: { id: venue.clientId }, data: { commercialChannel: CommercialChannel.VENUE } });
    const service = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.PHYSICAL_QR } });
    const price = await prisma.servicePrice.findFirstOrThrow({
      where: {
        serviceId: service.id,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.VENUE,
        venueTier: VenuePriceTier.ONE_TO_TWO
      }
    });
    const now = new Date();
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 18));
    await grantLedgerCredits(venue, 480);
    const charged = [];
    for (let index = 0; index < 3; index += 1) {
      charged.push(await createChargedVenueEvent(venue, service.id, price.id, previousMonth, index));
    }
    await createChargedVenueEvent(venue, service.id, price.id, now, 99);

    await expect(
      servicesPricing.resolveCurrentPrice(venue.clientId, ServiceCode.PHYSICAL_QR, 100, now)
    ).resolves.toMatchObject({
      venueTier: VenuePriceTier.THREE_TO_FIVE,
      credits: 110
    });

    const refundReceipt = await prisma.receipt.create({
      data: {
        clientId: venue.clientId,
        operationType: 'EVENT_CREDIT_REFUND',
        operationReference: charged[0]!.id,
        idempotencyKey: `venue-refund-${randomUUID()}`
      }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId: venue.clientId,
        eventId: charged[0]!.id,
        actorUserId: venue.userId,
        movementType: LedgerMovementType.EVENT_CREDIT_REFUND,
        purchasedCreditDelta: 10,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: charged[0]!.id,
        idempotencyKey: `venue-refund-ledger-${randomUUID()}`,
        receiptId: refundReceipt.id
      }
    });
    await expect(
      servicesPricing.resolveCurrentPrice(venue.clientId, ServiceCode.PHYSICAL_QR, 100, now)
    ).resolves.toMatchObject({
      venueTier: VenuePriceTier.THREE_TO_FIVE,
      credits: 110
    });

    await prisma.ledgerEntry.create({
      data: {
        clientId: venue.clientId,
        eventId: charged[0]!.id,
        actorUserId: venue.userId,
        movementType: LedgerMovementType.EVENT_CREDIT_REFUND,
        purchasedCreditDelta: 110,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: charged[0]!.id,
        idempotencyKey: `venue-refund-ledger-${randomUUID()}`,
        receiptId: refundReceipt.id
      }
    });
    await expect(
      servicesPricing.resolveCurrentPrice(venue.clientId, ServiceCode.PHYSICAL_QR, 100, now)
    ).resolves.toMatchObject({
      venueTier: VenuePriceTier.ONE_TO_TWO,
      credits: 120
    });
  });

  it('keeps legacy price references, Event costs, and Receipt snapshots unchanged beside V2', async () => {
    const legacy = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const service = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.FLYER } });
    const legacyPrice = await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.PLANNER,
        credits: 20,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: new Date('2026-02-01T00:00:00.000Z')
      }
    });
    await grantLedgerCredits(legacy, 20);
    const activated = await createChargedVenueEvent(
      legacy,
      service.id,
      legacyPrice.id,
      new Date('2026-01-15T18:00:00.000Z'),
      99,
      20
    );
    const receipt = await prisma.receipt.update({
      where: { id: activated.activationReceiptId! },
      data: { resultSnapshot: { legacy: true, finalCostCredits: 20 } }
    });

    expect(await prisma.servicePrice.findUnique({ where: { id: legacyPrice.id } })).toMatchObject({
      pricingVersion: 1,
      clientType: ClientType.PLANNER,
      commercialChannel: null,
      credits: 20
    });
    expect(await prisma.event.findUnique({ where: { id: activated.id } })).toMatchObject({
      activatedServicePriceId: legacyPrice.id,
      baseCostCredits: 20,
      finalCostCredits: 20
    });
    expect(await prisma.receipt.findUnique({ where: { id: receipt.id } })).toMatchObject({
      resultSnapshot: { legacy: true, finalCostCredits: 20 }
    });
    expect(await prisma.servicePrice.count({ where: { serviceId: service.id, pricingVersion: 2 } })).toBe(4);
  });

  it('forbids Client users from administrative routes', async () => {
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const cookie = await login(planner.email);

    await request(app.getHttpServer())
      .get('/api/v1/admin/prices')
      .set('Cookie', cookie)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe('ROLE_FORBIDDEN');
      });
  });

  it('allows only Platform Admin to configure commercial classification and audits it', async () => {
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const plannerCookie = await login(planner.email);
    await request(app.getHttpServer())
      .patch(`/api/v1/clients/${planner.clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerCookie)
      .send({ commercialChannel: CommercialChannel.PARTNER })
      .expect(400);

    const adminCookie = await createPlatformAdminCookie();
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${planner.clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .send({ commercialChannel: CommercialChannel.PARTNER })
      .expect(200);
    expect(response.body).toMatchObject({
      id: planner.clientId,
      type: ClientType.PLANNER,
      commercialChannel: CommercialChannel.PARTNER
    });

    const venueResponse = await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${planner.clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .send({ commercialChannel: CommercialChannel.VENUE })
      .expect(200);
    expect(venueResponse.body).toMatchObject({
      id: planner.clientId,
      type: ClientType.PLANNER,
      commercialChannel: CommercialChannel.VENUE
    });

    const standardResponse = await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${planner.clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .send({ commercialChannel: null })
      .expect(200);
    expect(standardResponse.body).toMatchObject({
      id: planner.clientId,
      type: ClientType.PLANNER,
      commercialChannel: null
    });
    expect(
      await prisma.auditLog.count({
        where: {
          resourceType: 'CLIENT',
          resourceId: planner.clientId,
          action: 'CLIENT_COMMERCIAL_CLASSIFICATION_UPDATE'
        }
      })
    ).toBe(3);
  });

  it('rejects nonzero DEMO prices in the API and PostgreSQL', async () => {
    const cookie = await createPlatformAdminCookie();
    const demo = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.DEMO } });

    await request(app.getHttpServer())
      .post('/api/v1/admin/prices')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({
        serviceId: demo.id,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 50,
        credits: 1,
        validFrom: futureIso(60)
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('DEMO_PRICE_MUST_BE_ZERO');
      });

    await expect(
      prisma.servicePrice.create({
        data: {
          serviceId: demo.id,
          clientType: ClientType.PLANNER,
          credits: 1,
          validFrom: new Date('2035-01-01T00:00:00.000Z'),
          validUntil: new Date('2035-02-01T00:00:00.000Z')
        }
      })
    ).rejects.toThrow();
  });

  it('rejects overlapping price ranges and serializes concurrent replacements', async () => {
    const cookie = await createPlatformAdminCookie();
    const flyer = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.FLYER } });
    const firstStart = futureIso(120);
    const firstEnd = futureIso(240);

    await request(app.getHttpServer())
      .post('/api/v1/admin/prices')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({
        serviceId: flyer.id,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 50,
        credits: 21,
        validFrom: firstStart,
        validUntil: firstEnd
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/admin/prices')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({
        serviceId: flyer.id,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 50,
        credits: 22,
        validFrom: futureIso(180),
        validUntil: futureIso(300)
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('PRICE_OVERLAP');
      });

    const flipbook = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.FLIPBOOK } });
    const concurrent = await Promise.all(
      [31, 32].map((credits) =>
        request(app.getHttpServer())
          .post('/api/v1/admin/prices')
          .set('Origin', trustedOrigin)
          .set('Cookie', cookie)
          .send({
            serviceId: flipbook.id,
            commercialChannel: CommercialChannel.STANDARD,
            capacityMin: 1,
            capacityMax: 50,
            credits,
            validFrom: futureIso(360)
          })
      )
    );

    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);
    const futurePrices = await prisma.servicePrice.count({
      where: {
        serviceId: flipbook.id,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 50,
        validFrom: { gt: new Date() }
      }
    });
    expect(futurePrices).toBe(1);
  });

  it('only closes open price validity and preserves historical fields', async () => {
    const cookie = await createPlatformAdminCookie();
    const price = await prisma.servicePrice.findFirstOrThrow({
      where: {
        service: { code: ServiceCode.PHYSICAL_QR },
        pricingVersion: 2,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 50
      }
    });
    const validUntil = futureIso(120);

    const closed = await request(app.getHttpServer())
      .patch(`/api/v1/admin/prices/${price.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ validUntil })
      .expect(200);

    expect(closed.body).toMatchObject({
      id: price.id,
      serviceId: price.serviceId,
      clientType: price.clientType,
      credits: price.credits,
      validFrom: price.validFrom.toISOString(),
      validUntil
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/prices/${price.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ validUntil: futureIso(240) })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('PRICE_HISTORY_IMMUTABLE');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/prices/${price.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ credits: 999, validUntil: futureIso(240) })
      .expect(400);
  });

  it('evaluates active, inactive, and expired promotion eligibility without financial calculation', async () => {
    const cookie = await createPlatformAdminCookie();
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const flyer = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.FLYER } });
    const activePromotion = await createPromotion(cookie, {
      name: 'Planner Flyer',
      scope: PromotionScope.EVENT_ACTIVATION,
      clientType: ClientType.PLANNER,
      serviceId: flyer.id,
      validFrom: pastIso(60),
      validUntil: futureIso(60),
      allowsStacking: true
    });
    const inactivePromotion = await createPromotion(cookie, {
      name: 'Inactive',
      scope: PromotionScope.EVENT_ACTIVATION,
      validFrom: pastIso(60),
      validUntil: futureIso(60),
      allowsStacking: false
    });
    const expiredPromotion = await createPromotion(cookie, {
      name: 'Expired',
      scope: PromotionScope.EVENT_ACTIVATION,
      validFrom: pastIso(120),
      validUntil: pastIso(60),
      allowsStacking: false
    });

    await activatePromotion(cookie, activePromotion.id);
    await activatePromotion(cookie, expiredPromotion.id);
    const eligible = await servicesPricing.findEligiblePromotions({
      scope: PromotionScope.EVENT_ACTIVATION,
      clientId: planner.clientId,
      clientType: ClientType.PLANNER,
      serviceId: flyer.id
    });

    expect(eligible.map((promotion) => promotion.id)).toEqual([activePromotion.id]);
    expect(eligible[0]?.allowsStacking).toBe(true);
    expect(eligible.map((promotion) => promotion.id)).not.toContain(inactivePromotion.id);
    expect(eligible.map((promotion) => promotion.id)).not.toContain(expiredPromotion.id);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/promotions/${activePromotion.id}/deactivate`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .expect(200);
    expect(
      await servicesPricing.findEligiblePromotions({
        scope: PromotionScope.EVENT_ACTIVATION,
        clientId: planner.clientId,
        clientType: ClientType.PLANNER,
        serviceId: flyer.id
      })
    ).toHaveLength(0);
  });

  it('requires a targeted promotion clientType to match the real Client type', async () => {
    const cookie = await createPlatformAdminCookie();
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const basePromotion = {
      name: 'Targeted Planner',
      scope: PromotionScope.CREDIT_PURCHASE,
      clientId: planner.clientId,
      validFrom: pastIso(1),
      validUntil: futureIso(60),
      allowsStacking: false
    };

    await request(app.getHttpServer())
      .post('/api/v1/admin/promotions')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ ...basePromotion, clientType: ClientType.ORGANIZATION })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('PROMOTION_CLIENT_TYPE_MISMATCH');
      });

    const compatible = await request(app.getHttpServer())
      .post('/api/v1/admin/promotions')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ ...basePromotion, clientType: ClientType.PLANNER })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/promotions/${String(compatible.body.id)}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ clientType: ClientType.ORGANIZATION })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('PROMOTION_CLIENT_TYPE_MISMATCH');
      });
  });

  it('runs the real services-pricing seed twice without duplicating services or prices', async () => {
    await prisma.servicePrice.deleteMany();
    await prisma.service.deleteMany();

    const firstRun = await runSeedScript();
    const secondRun = await runSeedScript();
    const services = await prisma.service.findMany({ orderBy: { code: 'asc' } });
    const prices = await prisma.servicePrice.findMany({
      orderBy: [{ serviceId: 'asc' }, { commercialChannel: 'asc' }, { capacityMin: 'asc' }, { validFrom: 'asc' }]
    });
    const uniquePrices = new Set(
      prices.map(
        (price) =>
          `${price.serviceId}:${price.commercialChannel}:${price.capacityMin}:${price.capacityMax}:${price.venueTier}`
      )
    );

    expect(firstRun).toContain('"pricesCreated":16');
    expect(secondRun).toContain('"pricesCreated":0');
    expect(services.map((service) => service.code).sort()).toEqual(Object.values(ServiceCode).sort());
    expect(prices).toHaveLength(16);
    expect(uniquePrices.size).toBe(16);
  }, 30_000);

  it('audits mutations and publishes the complete OpenAPI contract', async () => {
    const cookie = await createPlatformAdminCookie();
    const created = await createPromotion(cookie, {
      name: 'Audited',
      scope: PromotionScope.CREDIT_PURCHASE,
      validFrom: pastIso(1),
      validUntil: futureIso(60),
      allowsStacking: false
    });
    await activatePromotion(cookie, created.id);

    const actions = await prisma.auditLog.findMany({
      where: { resourceType: 'PROMOTION', resourceId: created.id },
      orderBy: { occurredAt: 'asc' },
      select: { action: true, actorType: true }
    });
    expect(actions).toMatchObject([{ action: 'PROMOTION_ACTIVATE', actorType: 'USER' }]);
    expect(
      await prisma.auditLog.count({
        where: { resourceType: 'PROMOTION', action: 'PROMOTION_CREATE' }
      })
    ).toBeGreaterThan(0);

    const openApi = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const paths = openApi.body.paths as Record<string, unknown>;
    expect(paths).toHaveProperty('/api/v1/services');
    expect(paths).toHaveProperty('/api/v1/public/pricing');
    expect(paths).toHaveProperty('/api/v1/admin/services');
    expect(paths).toHaveProperty('/api/v1/admin/services/{serviceId}');
    expect(paths).toHaveProperty('/api/v1/admin/prices');
    expect(paths).toHaveProperty('/api/v1/admin/prices/{priceId}');
    expect(paths).toHaveProperty('/api/v1/admin/promotions');
    expect(paths).toHaveProperty('/api/v1/admin/promotions/{promotionId}');
    expect(paths).toHaveProperty('/api/v1/admin/promotions/{promotionId}/activate');
    expect(paths).toHaveProperty('/api/v1/admin/promotions/{promotionId}/deactivate');
  });

  async function resetDatabase(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "event", "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line",
        "finance_balance", "promotion", "service_price", "service", "audit_log", "auth_session",
        "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }

  async function seedInitialCatalog(): Promise<void> {
    const services = await Promise.all(
      Object.values(ServiceCode).map((code) => prisma.service.create({ data: { code } }))
    );
    const ids = new Map(services.map((service) => [service.code, service.id]));
    const validFrom = new Date(Date.now() - 60_000);
    await prisma.servicePrice.createMany({
      data: [
        ...standardRules(ServiceCode.PHYSICAL_QR, [125, 150, 175]),
        ...standardRules(ServiceCode.FLYER, [225, 275, 325]),
        ...standardRules(ServiceCode.FLIPBOOK, [300, 350, 400]),
        capacityRule(ServiceCode.PHYSICAL_QR, CommercialChannel.PARTNER, 1, 100, 120),
        capacityRule(ServiceCode.FLYER, CommercialChannel.PARTNER, 1, 100, 215),
        capacityRule(ServiceCode.FLIPBOOK, CommercialChannel.PARTNER, 1, 100, 275),
        venueRule(VenuePriceTier.ONE_TO_TWO, 120),
        venueRule(VenuePriceTier.THREE_TO_FIVE, 110),
        venueRule(VenuePriceTier.SIX_TO_TEN, 100),
        venueRule(VenuePriceTier.ELEVEN_PLUS, 90)
      ].map(({ serviceCode, ...rule }) => ({ ...rule, serviceId: requiredId(ids, serviceCode), validFrom }))
    });
  }

  async function createOperationalUser(clientType: ClientType, role: UserRole) {
    const client = await prisma.client.create({
      data: { type: clientType, name: `Client ${randomUUID()}` }
    });
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role,
        clientId: client.id
      }
    });

    return { clientId: client.id, userId: user.id, email };
  }

  async function createChargedVenueEvent(
    owner: { clientId: string; userId: string },
    serviceId: string,
    priceId: string,
    activatedAt: Date,
    index: number,
    credits = 120
  ) {
    const event = await prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        serviceId,
        name: `Venue M-1 ${index}`,
        socialType: EventSocialType.OTHER,
        status: EventStatus.READY_TO_ACTIVATE,
        eventDateTime: activatedAt,
        timeZone: 'America/Mexico_City',
        capacity: 100
      }
    });
    const key = `venue-m1-${index}-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: {
        clientId: owner.clientId,
        operationType: 'EVENT_ACTIVATION',
        operationReference: event.id,
        idempotencyKey: key
      }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId: owner.clientId,
        eventId: event.id,
        actorUserId: owner.userId,
        movementType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
        purchasedCreditDelta: -credits,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: event.id,
        idempotencyKey: key,
        receiptId: receipt.id
      }
    });
    return prisma.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.ACTIVE,
        activatedAt,
        activatedByUserId: owner.userId,
        activatedServiceId: serviceId,
        activatedServicePriceId: priceId,
        baseCostCredits: credits,
        promotionDiscountCredits: 0,
        finalCostCredits: credits,
        purchasedCreditsUsed: credits,
        creditLineCreditsUsed: 0,
        activationReceiptId: receipt.id,
        activationIdempotencyKey: key
      }
    });
  }

  async function grantLedgerCredits(owner: { clientId: string; userId: string }, credits: number) {
    const key = `pricing-grant-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: {
        clientId: owner.clientId,
        operationType: 'MANUAL_CREDIT_GRANT',
        operationReference: key,
        idempotencyKey: key
      }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId: owner.clientId,
        actorUserId: owner.userId,
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

  async function createPlatformAdminCookie(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: UserRole.PLATFORM_ADMIN
      }
    });

    return login(email);
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email, password })
      .expect(200);
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const cookie = cookieHeader?.split(';')[0];

    if (!cookie) {
      throw new Error('Login did not return a session cookie.');
    }

    return cookie;
  }

  async function createPromotion(cookie: string, body: Record<string, unknown>) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/promotions')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send(body)
      .expect(201);

    return response.body as { id: string };
  }

  async function activatePromotion(cookie: string, promotionId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/promotions/${promotionId}/activate`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .expect(200);
  }

  async function runSeedScript(): Promise<string> {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required to execute the seed script.');
    }

    const workspaceRoot = resolve(__dirname, '../../..');
    const isWindows = process.platform === 'win32';
    const executable = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm';
    const args = isWindows
      ? ['/d', '/s', '/c', 'pnpm --filter @invitaciones/api services-pricing:seed']
      : ['--filter', '@invitaciones/api', 'services-pricing:seed'];
    const { stdout } = await execFileAsync(executable, args, {
      cwd: workspaceRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024
    });

    return stdout;
  }
});

function requiredId(ids: Map<ServiceCode, string>, code: ServiceCode): string {
  const id = ids.get(code);

  if (!id) {
    throw new Error(`Missing service ${code}.`);
  }

  return id;
}

function priceCreditsFor(body: unknown, code: ServiceCode, capacity: number): number | undefined {
  if (!Array.isArray(body)) {
    return undefined;
  }

  const service = body.find((entry: unknown) => {
    return typeof entry === 'object' && entry !== null && 'code' in entry && entry.code === code;
  });

  if (
    typeof service !== 'object' ||
    service === null ||
    !('priceRules' in service) ||
    !Array.isArray(service.priceRules)
  ) {
    return undefined;
  }
  const rule = service.priceRules.find(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      'capacityMin' in item &&
      'capacityMax' in item &&
      typeof item.capacityMin === 'number' &&
      typeof item.capacityMax === 'number' &&
      capacity >= item.capacityMin &&
      capacity <= item.capacityMax
  );
  return typeof rule === 'object' && rule !== null && 'credits' in rule && typeof rule.credits === 'number'
    ? rule.credits
    : undefined;
}

function standardRules(serviceCode: ServiceCode, credits: readonly [number, number, number]) {
  return [
    capacityRule(serviceCode, CommercialChannel.STANDARD, 1, 50, credits[0]),
    capacityRule(serviceCode, CommercialChannel.STANDARD, 51, 100, credits[1]),
    capacityRule(serviceCode, CommercialChannel.STANDARD, 101, 150, credits[2])
  ];
}

function capacityRule(
  serviceCode: ServiceCode,
  commercialChannel: CommercialChannel,
  capacityMin: number,
  capacityMax: number,
  credits: number
) {
  return {
    serviceCode,
    pricingVersion: 2,
    clientType: null,
    commercialChannel,
    capacityMin,
    capacityMax,
    venueTier: null,
    credits
  };
}

function venueRule(venueTier: VenuePriceTier, credits: number) {
  return {
    serviceCode: ServiceCode.PHYSICAL_QR,
    pricingVersion: 2,
    clientType: null,
    commercialChannel: CommercialChannel.VENUE,
    capacityMin: null,
    capacityMax: null,
    venueTier,
    credits
  };
}

function futureIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function pastIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
