import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppConfigService } from '../src/config/app-config.service';
import {
  ClientStatus,
  ClientType,
  CommercialChannel,
  EventSocialType,
  EventStatus,
  LedgerMovementType,
  ServiceCode,
  UserRole,
  VenuePriceTier
} from '../src/generated/prisma/client';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Admin event unit economics', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfigService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    delete process.env.UNIT_ECONOMICS_OPERATOR_HOURLY_RATE_MXN_CENTS;
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    config = app.get(AppConfigService);
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  it('derives an inactive event with zero revenue, negative cost margin and no finance writes or PII', async () => {
    const fixture = await createFixture(ClientType.PLANNER, null, ServiceCode.PHYSICAL_QR);
    const ledgerBefore = await prisma.ledgerEntry.count();
    const balancesBefore = await prisma.financeBalance.count();
    await observe(fixture, { kind: 'EXTERNAL_COST', area: 'GENERAL', amountMxnCents: 500, count: 1 }).expect(201);

    const response = await getEconomics(fixture).expect(200);
    expect(response.body).toMatchObject({
      eventId: fixture.eventId,
      clientId: fixture.clientId,
      serviceCode: ServiceCode.PHYSICAL_QR,
      commercialChannel: CommercialChannel.STANDARD,
      commercialChannelSource: 'CURRENT_CLIENT',
      grossRevenueCredits: 0,
      netRevenueMxnCents: 0,
      directCostMxnCents: 500,
      contributionMarginMxnCents: -500,
      contributionMarginPct: null,
      operatorHourlyRateMxnCents: null,
      operatorShadowCostMxnCents: null
    });
    expect(await prisma.ledgerEntry.count()).toBe(ledgerBefore);
    expect(await prisma.financeBalance.count()).toBe(balancesBefore);
    expect(Object.keys(response.body)).not.toEqual(
      expect.arrayContaining([
        'guestName',
        'contactName',
        'phone',
        'whatsappPhone',
        'invitation',
        'profit',
        'balance',
        'debt'
      ])
    );
  });

  it('sums Flyer costs, rounds and operator time, then excludes an append-only correction', async () => {
    const fixture = await createFixture(ClientType.PLANNER, CommercialChannel.STANDARD, ServiceCode.FLYER);
    await activate(fixture, 225);
    const ledgerBefore = await prisma.ledgerEntry.count();
    const balanceBefore = await prisma.financeBalance.findUnique({ where: { clientId: fixture.clientId } });
    const designer = await observe(fixture, {
      kind: 'DESIGNER_COST',
      area: 'INVITATION',
      amountMxnCents: 1500,
      count: 1
    }).expect(201);
    await observe(fixture, { kind: 'DESIGNER_COST', area: 'INVITATION', amountMxnCents: 300, count: 1 }).expect(201);
    await observe(fixture, { kind: 'EXTERNAL_COST', area: 'GENERAL', amountMxnCents: 200, count: 1 }).expect(201);
    await observe(fixture, { kind: 'TECHNOLOGY_COST', area: 'GENERAL', amountMxnCents: 50, count: 1 }).expect(201);
    await observe(fixture, { kind: 'DESIGN_ROUND', area: 'INVITATION', durationMinutes: 25, count: 2 }).expect(201);
    await observe(fixture, { kind: 'PREPARATION_TIME', area: 'FLOORPLAN', durationMinutes: 35, count: 1 }).expect(201);
    await observe(fixture, { kind: 'INCIDENT', area: 'CHECKIN', durationMinutes: 10, count: 1 }).expect(201);

    const beforeCorrection = await getEconomics(fixture).expect(200);
    expect(beforeCorrection.body).toMatchObject({
      grossRevenueMxnCents: 450_000,
      designerCostMxnCents: 1800,
      externalCostMxnCents: 200,
      technologyCostMxnCents: 50,
      directCostMxnCents: 2050,
      designRounds: 2,
      operatorMinutesTotal: 70,
      operatorMinutesByArea: { INVITATION: 25, FLOORPLAN: 35, CHECKIN: 10 },
      operatorShadowCostMxnCents: null,
      contributionMarginMxnCents: 447_950
    });

    await correct(fixture, designer.body.id as string, { reason: 'Captura duplicada' }).expect(201);
    const afterCorrection = await getEconomics(fixture).expect(200);
    expect(afterCorrection.body).toMatchObject({ designerCostMxnCents: 300, directCostMxnCents: 550 });
    expect(await prisma.ledgerEntry.count()).toBe(ledgerBefore);
    expect(await prisma.financeBalance.findUnique({ where: { clientId: fixture.clientId } })).toEqual(balanceBefore);

    const rate = vi.spyOn(config, 'unitEconomicsOperatorHourlyRateMxnCents', 'get').mockReturnValue(12_000);
    const withShadow = await getEconomics(fixture).expect(200);
    expect(withShadow.body).toMatchObject({
      operatorHourlyRateMxnCents: 12_000,
      operatorShadowCostMxnCents: 14_000,
      contributionAfterOperatorShadowMxnCents: 435_450
    });
    rate.mockRestore();
  });

  it('uses Partner and Venue event snapshots, never ClientType or a later Price Book rule', async () => {
    const partner = await createFixture(ClientType.ORGANIZATION, CommercialChannel.VENUE, ServiceCode.FLYER);
    const historicalPrice = await lockCommercial(partner, CommercialChannel.PARTNER, 215, {
      capacityMin: 1,
      capacityMax: 100
    });
    await prisma.client.update({
      where: { id: partner.clientId },
      data: { commercialChannel: CommercialChannel.VENUE }
    });
    const nextValidFrom = new Date(Date.now() + 60_000);
    await prisma.servicePrice.update({ where: { id: historicalPrice.id }, data: { validUntil: nextValidFrom } });
    await prisma.servicePrice.create({
      data: {
        serviceId: partner.serviceId,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.PARTNER,
        capacityMin: 1,
        capacityMax: 100,
        credits: 999,
        validFrom: nextValidFrom
      }
    });
    expect((await getEconomics(partner).expect(200)).body).toMatchObject({
      commercialChannel: CommercialChannel.PARTNER,
      commercialChannelSource: 'SNAPSHOT',
      capacityMin: 1,
      capacityMax: 100,
      venueTier: null
    });

    const venue = await createFixture(ClientType.PLANNER, CommercialChannel.STANDARD, ServiceCode.PHYSICAL_QR);
    await lockCommercial(venue, CommercialChannel.VENUE, 120, { venueTier: VenuePriceTier.ONE_TO_TWO });
    expect((await getEconomics(venue).expect(200)).body).toMatchObject({
      commercialChannel: CommercialChannel.VENUE,
      commercialChannelSource: 'SNAPSHOT',
      capacityMin: null,
      capacityMax: null,
      venueTier: VenuePriceTier.ONE_TO_TWO
    });
  });

  it('uses only the Event charge and valid refunds; other ledger movement types never duplicate revenue', async () => {
    const fixture = await createFixture(ClientType.PLANNER, CommercialChannel.STANDARD, ServiceCode.PHYSICAL_QR);
    await activate(fixture, 125);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/clients/${fixture.clientId}/credit-line`)
      .set('Origin', origin)
      .set('Cookie', fixture.adminCookie)
      .set('Idempotency-Key', `line-${randomUUID()}`)
      .send({ limitCredits: 10, status: 'ACTIVE' })
      .expect(201);
    await addLedger(fixture, LedgerMovementType.CREDIT_LINE_USAGE, {
      purchasedCreditDelta: 0,
      creditLineUsedDelta: 3,
      debtDelta: 3,
      creditUnitValueMxnCentsSnapshot: 2000
    });
    await addLedger(fixture, LedgerMovementType.EVENT_CREDIT_REFUND, {
      purchasedCreditDelta: 2,
      creditLineUsedDelta: 0,
      debtDelta: 0
    });
    await addLedger(fixture, LedgerMovementType.EVENT_CREDIT_REFUND, {
      purchasedCreditDelta: 0,
      creditLineUsedDelta: -1,
      debtDelta: -1,
      creditUnitValueMxnCentsSnapshot: 2000
    });
    const response = await getEconomics(fixture).expect(200);
    expect(response.body).toMatchObject({
      grossRevenueCredits: 125,
      refundCredits: 3,
      netRevenueCredits: 122,
      grossRevenueMxnCents: 250_000,
      refundMxnCents: 6000,
      netRevenueMxnCents: 244_000,
      directCostMxnCents: 0,
      contributionMarginMxnCents: 244_000
    });
  });

  it('enforces Admin-only and exact client/event scoping without leaking economics', async () => {
    const fixture = await createFixture(ClientType.PLANNER, null, ServiceCode.FLYER);
    const other = await createFixture(ClientType.PLANNER, null, ServiceCode.FLYER);
    await getEconomics(fixture, fixture.plannerCookie).expect(403);
    const cross = await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${other.clientId}/events/${fixture.eventId}/unit-economics`)
      .set('Cookie', fixture.adminCookie)
      .expect(404);
    expect(JSON.stringify(cross.body)).not.toContain(fixture.eventId);
  });

  function economicsPath(fixture: Pick<Fixture, 'clientId' | 'eventId'>) {
    return `/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/unit-economics`;
  }
  function observationsPath(fixture: Pick<Fixture, 'clientId' | 'eventId'>) {
    return `/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/pilot-observations`;
  }
  function getEconomics(fixture: Fixture, cookie = fixture.adminCookie) {
    return request(app.getHttpServer()).get(economicsPath(fixture)).set('Cookie', cookie);
  }
  function observe(fixture: Fixture, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(observationsPath(fixture))
      .set('Origin', origin)
      .set('Cookie', fixture.adminCookie)
      .send(body);
  }
  function correct(fixture: Fixture, observationId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`${observationsPath(fixture)}/${observationId}/correction`)
      .set('Origin', origin)
      .set('Cookie', fixture.adminCookie)
      .send(body);
  }

  async function createFixture(clientType: ClientType, channel: CommercialChannel | null, code: ServiceCode) {
    const client = await prisma.client.create({
      data: {
        name: `Economics ${randomUUID()}`,
        type: clientType,
        status: ClientStatus.ACTIVE,
        commercialChannel: channel
      }
    });
    const plannerRole =
      clientType === ClientType.ORGANIZATION ? UserRole.ORGANIZATION_ADMIN : UserRole.INDEPENDENT_PLANNER;
    const plannerEmail = `${randomUUID()}@example.test`;
    const adminEmail = `${randomUUID()}@example.test`;
    const [planner, admin] = await Promise.all([
      prisma.user.create({
        data: {
          email: plannerEmail,
          passwordHash: await hashPassword(password),
          role: plannerRole,
          clientId: client.id
        }
      }),
      prisma.user.create({
        data: { email: adminEmail, passwordHash: await hashPassword(password), role: UserRole.PLATFORM_ADMIN }
      })
    ]);
    const service = await prisma.service.upsert({ where: { code }, update: {}, create: { code } });
    const event = await prisma.event.create({
      data: {
        clientId: client.id,
        createdByUserId: planner.id,
        serviceId: service.id,
        name: 'Evento economics',
        socialType: EventSocialType.OTHER,
        status: EventStatus.READY_TO_ACTIVATE,
        eventDateTime: new Date(Date.now() + 86_400_000),
        timeZone: 'America/Mexico_City',
        capacity: 80
      }
    });
    return {
      clientId: client.id,
      eventId: event.id,
      serviceId: service.id,
      plannerUserId: planner.id,
      adminUserId: admin.id,
      adminCookie: await login(adminEmail),
      plannerCookie: await login(plannerEmail),
      clientType
    } satisfies Fixture;
  }

  async function activate(fixture: Fixture, credits: number) {
    const price = await prisma.servicePrice.create({
      data: {
        serviceId: fixture.serviceId,
        clientType: fixture.clientType,
        credits,
        validFrom: new Date(Date.now() - 60_000)
      }
    });
    const grantKey = `grant-${randomUUID()}`;
    const grantReceipt = await prisma.receipt.create({
      data: {
        clientId: fixture.clientId,
        operationType: 'MANUAL_CREDIT_GRANT',
        operationReference: grantKey,
        idempotencyKey: grantKey
      }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId: fixture.clientId,
        actorUserId: fixture.adminUserId,
        movementType: LedgerMovementType.MANUAL_CREDIT_GRANT,
        purchasedCreditDelta: credits,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: grantKey,
        idempotencyKey: grantKey,
        receiptId: grantReceipt.id
      }
    });
    const key = `activate-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: {
        clientId: fixture.clientId,
        operationType: 'EVENT_ACTIVATION',
        operationReference: fixture.eventId,
        idempotencyKey: key
      }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId: fixture.clientId,
        eventId: fixture.eventId,
        actorUserId: fixture.plannerUserId,
        movementType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
        purchasedCreditDelta: -credits,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: fixture.eventId,
        idempotencyKey: key,
        receiptId: receipt.id
      }
    });
    await prisma.event.update({
      where: { id: fixture.eventId },
      data: {
        status: EventStatus.ACTIVE,
        activatedAt: new Date(),
        activatedByUserId: fixture.plannerUserId,
        activatedServiceId: fixture.serviceId,
        activatedServicePriceId: price.id,
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

  async function lockCommercial(
    fixture: Fixture,
    channel: CommercialChannel,
    credits: number,
    rule: { capacityMin?: number; capacityMax?: number; venueTier?: VenuePriceTier }
  ) {
    const price = await prisma.servicePrice.create({
      data: {
        serviceId: fixture.serviceId,
        pricingVersion: 2,
        commercialChannel: channel,
        capacityMin: rule.capacityMin ?? null,
        capacityMax: rule.capacityMax ?? null,
        venueTier: rule.venueTier ?? null,
        credits,
        validFrom: new Date(Date.now() - 60_000)
      }
    });
    const lockedAt = new Date();
    await prisma.event.update({
      where: { id: fixture.eventId },
      data: {
        commercialAuthorizedAt: lockedAt,
        commercialAuthorizedByUserId: fixture.adminUserId,
        commercialPriceLockedAt: lockedAt,
        commercialServicePriceId: price.id,
        commercialBaseCostCredits: credits,
        commercialPromotionDiscountCredits: 0,
        commercialFinalCostCredits: credits,
        commercialChannelSnapshot: channel,
        commercialCapacitySnapshot: 80,
        commercialCapacityMinSnapshot: rule.capacityMin ?? null,
        commercialCapacityMaxSnapshot: rule.capacityMax ?? null,
        commercialVenueTierSnapshot: rule.venueTier ?? null
      }
    });
    return price;
  }

  async function addLedger(
    fixture: Fixture,
    movementType: LedgerMovementType,
    deltas: {
      purchasedCreditDelta: number;
      creditLineUsedDelta: number;
      debtDelta: number;
      creditUnitValueMxnCentsSnapshot?: number;
    }
  ) {
    const key = `economics-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: { clientId: fixture.clientId, operationType: movementType, operationReference: key, idempotencyKey: key }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId: fixture.clientId,
        eventId: fixture.eventId,
        actorUserId: fixture.plannerUserId,
        movementType,
        ...deltas,
        cashMxnDelta: 0,
        operationReference: key,
        idempotencyKey: key,
        receiptId: receipt.id
      }
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
        "event", "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line",
        "finance_balance", "promotion", "service_price", "service", "audit_log", "auth_session",
        "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});

interface Fixture {
  clientId: string;
  eventId: string;
  serviceId: string;
  plannerUserId: string;
  adminUserId: string;
  adminCookie: string[];
  plannerCookie: string[];
  clientType: ClientType;
}
