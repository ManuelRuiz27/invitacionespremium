import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { EventsService } from '../src/events/events.service';
import {
  ClientStatus,
  ClientType,
  CreditLineStatus,
  EventSocialType,
  EventStatus,
  FileAssetStatus,
  FileAssetType,
  LedgerMovementType,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Event activation', () => {
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
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    process.env.CREDIT_UNIT_VALUE_MXN_CENTS = '2000';
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

  it('activates with purchased balance and preserves immutable activation snapshots', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service, price } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 12);
    const event = await createReadyEvent(planner, service.id);
    await grantCredits(planner.clientId, planner.userId, 12);

    const response = await activate(event.id, await login(planner.email), 'activation-balance-001').expect(200);
    expect(response.body).toMatchObject({
      baseCostCredits: 12,
      promotionDiscountCredits: 0,
      finalCostCredits: 12,
      purchasedCreditsUsed: 12,
      creditLineCreditsUsed: 0,
      balance: { purchasedCredits: 0, debtCredits: 0 }
    });
    expect(response.body.movements).toHaveLength(1);
    expect(response.body.movements[0]).toMatchObject({
      movementType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
      purchasedCreditDelta: -12,
      receiptId: response.body.receipt.id
    });

    const activated = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(activated).toMatchObject({
      status: EventStatus.ACTIVE,
      activatedByUserId: planner.userId,
      activatedServiceId: service.id,
      activatedServicePriceId: price.id,
      baseCostCredits: 12,
      promotionDiscountCredits: 0,
      finalCostCredits: 12,
      purchasedCreditsUsed: 12,
      creditLineCreditsUsed: 0,
      creditUnitValueMxnCentsSnapshot: null,
      activationReceiptId: response.body.receipt.id,
      activationIdempotencyKey: 'activation-balance-001'
    });
    await prisma.servicePrice.update({ where: { id: price.id }, data: { credits: 99 } });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).finalCostCredits).toBe(12);
    expect(await prisma.auditLog.count({ where: { eventId: event.id, action: 'EVENT_ACTIVATE' } })).toBe(1);
  });

  it('rejects every direct snapshot mutation while allowing later lifecycle status changes', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 12);
    const replacement = await createPricedService(ServiceCode.FLIPBOOK, ClientType.PLANNER, 12);
    const event = await createReadyEvent(planner, service.id);
    await grantCredits(planner.clientId, planner.userId, 12);
    await activate(event.id, await login(planner.email), 'activation-immutable-001').expect(200);
    const original = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    const replacementReceipt = await createActivationReceipt(
      planner.clientId,
      event.id,
      'activation-immutable-receipt'
    );

    const mutations = [
      () => prisma.event.update({ where: { id: event.id }, data: { baseCostCredits: 13 } }),
      () => prisma.event.update({ where: { id: event.id }, data: { activatedServiceId: replacement.service.id } }),
      () =>
        prisma.event.update({
          where: { id: event.id },
          data: { activatedServicePriceId: replacement.price.id }
        }),
      () =>
        prisma.event.update({
          where: { id: event.id },
          data: { activationReceiptId: replacementReceipt.id }
        }),
      () =>
        prisma.event.update({
          where: { id: event.id },
          data: { activationIdempotencyKey: 'activation-immutable-changed' }
        }),
      () =>
        prisma.event.update({
          where: { id: event.id },
          data: {
            activatedAt: null,
            activatedByUserId: null,
            activatedServiceId: null,
            activatedServicePriceId: null,
            baseCostCredits: null,
            promotionDiscountCredits: null,
            finalCostCredits: null,
            purchasedCreditsUsed: null,
            creditLineCreditsUsed: null,
            creditUnitValueMxnCentsSnapshot: null,
            activationReceiptId: null,
            activationIdempotencyKey: null
          }
        })
    ];

    for (const mutate of mutations) await expect(mutate()).rejects.toThrow();

    const eventDay = await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.EVENT_DAY }
    });
    expect(eventDay.status).toBe(EventStatus.EVENT_DAY);
    expect(activationSnapshotOf(eventDay)).toEqual(activationSnapshotOf(original));
  });

  it('enforces the complete activation snapshot for every lifecycle state', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service, price } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 8);
    const ready = await createReadyEvent(planner, service.id);

    await expect(
      prisma.event.update({ where: { id: ready.id }, data: { status: EventStatus.ACTIVE } })
    ).rejects.toThrow();
    await expect(createReadyEvent(planner, service.id, EventStatus.ACTIVE)).rejects.toThrow();

    const preparationReceipt = await createActivationReceipt(
      planner.clientId,
      ready.id,
      'activation-preparation-snapshot'
    );
    await expect(
      prisma.event.update({
        where: { id: ready.id },
        data: activationSnapshotData(
          planner.userId,
          service.id,
          price.id,
          preparationReceipt.id,
          'activation-preparation-snapshot',
          8
        )
      })
    ).rejects.toThrow();

    const cancelledWithoutSnapshot = await createReadyEvent(planner, service.id, EventStatus.CANCELLED);
    expect(cancelledWithoutSnapshot.activatedAt).toBeNull();

    const cancelledWithSnapshot = await createReadyEvent(planner, service.id, EventStatus.CANCELLED);
    const cancelledReceipt = await createActivationReceipt(
      planner.clientId,
      cancelledWithSnapshot.id,
      'activation-cancelled-snapshot'
    );
    const completedCancelled = await prisma.event.update({
      where: { id: cancelledWithSnapshot.id },
      data: activationSnapshotData(
        planner.userId,
        service.id,
        price.id,
        cancelledReceipt.id,
        'activation-cancelled-snapshot',
        8
      )
    });
    expect(completedCancelled.status).toBe(EventStatus.CANCELLED);
    expect(completedCancelled.activatedAt).not.toBeNull();
  });

  it('rejects cross-reference mismatches in prices, Receipts, Clients, Events, and actors', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const outsider = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service, price } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 9);
    const otherService = await createPricedService(ServiceCode.FLIPBOOK, ClientType.PLANNER, 9);
    const organizationPrice = await createPrice(service.id, ClientType.ORGANIZATION, 9);
    const event = await createReadyEvent(planner, service.id);

    async function expectRejectedSnapshot(
      key: string,
      overrides: Partial<ReturnType<typeof activationSnapshotData>> = {},
      receiptClientId = planner.clientId,
      receiptEventId = event.id,
      receiptOperationType = 'EVENT_ACTIVATION',
      receiptKey = key
    ) {
      const receipt = await createActivationReceipt(receiptClientId, receiptEventId, receiptKey, receiptOperationType);
      await expect(
        prisma.event.update({
          where: { id: event.id },
          data: {
            ...activationSnapshotData(planner.userId, service.id, price.id, receipt.id, key, 9),
            ...overrides
          }
        })
      ).rejects.toThrow();
      expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).activatedAt).toBeNull();
    }

    await expectRejectedSnapshot('activation-wrong-service', {
      activatedServicePriceId: otherService.price.id
    });
    await expectRejectedSnapshot('activation-wrong-client-type', {
      activatedServicePriceId: organizationPrice.id
    });
    await expectRejectedSnapshot('activation-wrong-receipt-client', {}, outsider.clientId);
    await expectRejectedSnapshot('activation-wrong-receipt-event', {}, planner.clientId, randomUUID());
    await expectRejectedSnapshot(
      'activation-wrong-receipt-operation',
      {},
      planner.clientId,
      event.id,
      'MANUAL_CREDIT_GRANT'
    );
    await expectRejectedSnapshot(
      'activation-wrong-receipt-key',
      {},
      planner.clientId,
      event.id,
      'EVENT_ACTIVATION',
      'activation-different-receipt-key'
    );
    await expectRejectedSnapshot('activation-wrong-actor', {
      activatedByUserId: outsider.userId
    });

    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const creator = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const differentPlanner = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const organizationEvent = await createReadyEvent(
      { clientId: organization.clientId, userId: creator.userId },
      service.id
    );
    const organizationReceipt = await createActivationReceipt(
      organization.clientId,
      organizationEvent.id,
      'activation-wrong-planner-owner'
    );
    await expect(
      prisma.event.update({
        where: { id: organizationEvent.id },
        data: {
          status: EventStatus.ACTIVE,
          ...activationSnapshotData(
            differentPlanner.userId,
            service.id,
            organizationPrice.id,
            organizationReceipt.id,
            'activation-wrong-planner-owner',
            9
          )
        }
      })
    ).rejects.toThrow();
  });

  it('activates with credit line only and mixed funds using one receipt', async () => {
    const lineOnly = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const mixed = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service } = await createPricedService(ServiceCode.FLIPBOOK, ClientType.PLANNER, 10);
    const lineEvent = await createReadyEvent(lineOnly, service.id);
    const mixedEvent = await createReadyEvent(mixed, service.id);
    await configureLine(lineOnly.clientId, 10);
    await grantCredits(mixed.clientId, mixed.userId, 4);
    await configureLine(mixed.clientId, 10);

    const lineResponse = await activate(lineEvent.id, await login(lineOnly.email), 'activation-line-0001').expect(200);
    expect(lineResponse.body).toMatchObject({
      purchasedCreditsUsed: 0,
      creditLineCreditsUsed: 10,
      balance: { debtCredits: 10, debtMxnCents: 20_000 }
    });
    expect(lineResponse.body.movements).toHaveLength(1);
    expect(lineResponse.body.movements[0]).toMatchObject({
      movementType: LedgerMovementType.CREDIT_LINE_USAGE,
      creditLineUsedDelta: 10,
      debtDelta: 10,
      creditUnitValueMxnCentsSnapshot: 2000
    });

    const mixedResponse = await activate(mixedEvent.id, await login(mixed.email), 'activation-mixed-001').expect(200);
    expect(mixedResponse.body).toMatchObject({
      purchasedCreditsUsed: 4,
      creditLineCreditsUsed: 6,
      balance: { purchasedCredits: 0, debtCredits: 6, debtMxnCents: 12_000 }
    });
    expect(mixedResponse.body.movements).toHaveLength(2);
    expect(new Set(mixedResponse.body.movements.map((movement: { receiptId: string }) => movement.receiptId))).toEqual(
      new Set([mixedResponse.body.receipt.id])
    );
    expect(await prisma.receipt.count({ where: { operationReference: mixedEvent.id } })).toBe(1);
  });

  it('rejects unmet preconditions without ledger, receipt, audit, balance, or state effects', async () => {
    const { service } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 10);
    const noPriceService = await prisma.service.create({ data: { code: ServiceCode.PHYSICAL_QR } });
    const demo = await prisma.service.create({ data: { code: ServiceCode.DEMO } });
    await prisma.servicePrice.create({
      data: {
        serviceId: demo.id,
        clientType: ClientType.PLANNER,
        credits: 0,
        validFrom: new Date(Date.now() - 60_000)
      }
    });

    const insufficient = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const suspendedLine = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const expiredLine = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const suspendedClient = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const notReady = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const inactiveService = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const missingPrice = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const demoClient = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);

    await configureLine(suspendedLine.clientId, 20, CreditLineStatus.SUSPENDED);
    await configureLine(expiredLine.clientId, 20, CreditLineStatus.ACTIVE, new Date(Date.now() - 60_000));
    const suspendedClientCookie = await login(suspendedClient.email);
    await prisma.client.update({
      where: { id: suspendedClient.clientId },
      data: { status: ClientStatus.SUSPENDED, suspendedAt: new Date(), suspensionReason: 'Activation test' }
    });
    const cases = [
      {
        event: await createReadyEvent(insufficient, service.id),
        cookie: await login(insufficient.email),
        key: 'activation-insufficient',
        status: 409,
        code: 'FINANCE_INSUFFICIENT_CREDITS'
      },
      {
        event: await createReadyEvent(suspendedLine, service.id),
        cookie: await login(suspendedLine.email),
        key: 'activation-suspended-line',
        status: 409,
        code: 'FINANCE_INSUFFICIENT_CREDITS'
      },
      {
        event: await createReadyEvent(expiredLine, service.id),
        cookie: await login(expiredLine.email),
        key: 'activation-expired-line',
        status: 409,
        code: 'FINANCE_INSUFFICIENT_CREDITS'
      },
      {
        event: await createReadyEvent(suspendedClient, service.id),
        cookie: suspendedClientCookie,
        key: 'activation-suspended-client',
        status: 409,
        code: 'CLIENT_NOT_ACTIVE'
      },
      {
        event: await createReadyEvent(notReady, service.id, EventStatus.CONFIGURED),
        cookie: await login(notReady.email),
        key: 'activation-not-ready',
        status: 409,
        code: 'EVENT_INVALID_STATE_TRANSITION'
      },
      {
        event: await createReadyEvent(inactiveService, service.id),
        cookie: await login(inactiveService.email),
        key: 'activation-inactive-service',
        status: 409,
        code: 'EVENT_SERVICE_NOT_AVAILABLE',
        prepare: () => prisma.service.update({ where: { id: service.id }, data: { isActive: false } }),
        cleanup: () => prisma.service.update({ where: { id: service.id }, data: { isActive: true } })
      },
      {
        event: await createReadyEvent(missingPrice, noPriceService.id),
        cookie: await login(missingPrice.email),
        key: 'activation-price-missing',
        status: 404,
        code: 'CURRENT_PRICE_NOT_FOUND'
      },
      {
        event: await createReadyEvent(demoClient, demo.id),
        cookie: await login(demoClient.email),
        key: 'activation-demo-blocked',
        status: 409,
        code: 'EVENT_DEMO_NOT_ACTIVATABLE'
      }
    ];

    for (const testCase of cases) {
      await testCase.prepare?.();
      const before = await counts(testCase.event.id);
      const response = await activate(testCase.event.id, testCase.cookie, testCase.key).expect(testCase.status);
      expect(response.body.code).toBe(testCase.code);
      expect(await counts(testCase.event.id)).toEqual(before);
      expect((await prisma.event.findUniqueOrThrow({ where: { id: testCase.event.id } })).status).toBe(
        testCase.event.status
      );
      await testCase.cleanup?.();
    }
  });

  it('uses the correct price and ownership for all operational roles while blocking Platform Admin', async () => {
    const independent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const plannerOne = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const plannerTwo = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const service = await prisma.service.create({ data: { code: ServiceCode.FLIPBOOK } });
    await createPrice(service.id, ClientType.PLANNER, 7);
    await createPrice(service.id, ClientType.ORGANIZATION, 11);
    await grantCredits(independent.clientId, independent.userId, 7);
    await grantCredits(organization.clientId, organization.userId, 33);

    const independentEvent = await createReadyEvent(independent, service.id);
    const adminEvent = await createReadyEvent(
      { clientId: organization.clientId, userId: plannerOne.userId },
      service.id
    );
    const plannerEvent = await createReadyEvent(
      { clientId: organization.clientId, userId: plannerTwo.userId },
      service.id
    );
    expect(
      (await activate(independentEvent.id, await login(independent.email), 'activation-owner-independent').expect(200))
        .body.finalCostCredits
    ).toBe(7);
    expect(
      (await activate(adminEvent.id, await login(organization.email), 'activation-owner-admin').expect(200)).body
        .finalCostCredits
    ).toBe(11);
    expect(
      (await activate(plannerEvent.id, await login(plannerTwo.email), 'activation-owner-planner').expect(200)).body
        .finalCostCredits
    ).toBe(11);

    const forbiddenEvent = await createReadyEvent(
      { clientId: organization.clientId, userId: plannerTwo.userId },
      service.id
    );
    await activate(forbiddenEvent.id, await login(plannerOne.email), 'activation-owner-forbidden').expect(404);
    await activate(forbiddenEvent.id, await login(platform.email), 'activation-platform-forbidden').expect(403);
  });

  it('is idempotent, rejects key reuse across Events, and serializes concurrent activation', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 5);
    await grantCredits(planner.clientId, planner.userId, 15);
    const cookie = await login(planner.email);
    const first = await createReadyEvent(planner, service.id);
    const second = await createReadyEvent(planner, service.id);
    const concurrent = await createReadyEvent(planner, service.id);

    const initial = await activate(first.id, cookie, 'activation-idempotent').expect(200);
    const repeated = await activate(first.id, cookie, 'activation-idempotent').expect(200);
    expect(repeated.body).toEqual(initial.body);
    expect(await prisma.ledgerEntry.count({ where: { eventId: first.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: first.id, action: 'EVENT_ACTIVATE' } })).toBe(1);
    await activate(second.id, cookie, 'activation-idempotent')
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT'));

    const responses = await Promise.all([
      activate(concurrent.id, cookie, 'activation-concurrent').then((response) => response),
      activate(concurrent.id, cookie, 'activation-concurrent').then((response) => response)
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(await prisma.ledgerEntry.count({ where: { eventId: concurrent.id } })).toBe(1);
    expect(await prisma.receipt.count({ where: { operationReference: concurrent.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: concurrent.id, action: 'EVENT_ACTIVATE' } })).toBe(1);
  });

  it('replays an activation snapshot after a later soft delete without new financial effects', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 5);
    await grantCredits(planner.clientId, planner.userId, 5);
    const cookie = await login(planner.email);
    const event = await createReadyEvent(planner, service.id);
    const key = 'activation-deleted-replay';

    const original = await activate(event.id, cookie, key).expect(200);
    await prisma.event.update({
      where: { id: event.id },
      data: { status: EventStatus.CLOSED }
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${event.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .expect(204);

    const replay = await activate(event.id, cookie, key).expect(200);
    expect(replay.body).toEqual(original.body);
    expect(await prisma.ledgerEntry.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.receipt.count({ where: { operationReference: event.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: event.id, action: 'EVENT_ACTIVATE' } })).toBe(1);
    await activate(event.id, cookie, 'activation-deleted-new-key')
      .expect(404)
      .expect((response) => expect(response.body.code).toBe('EVENT_NOT_FOUND'));
  });

  it('rolls back completely on a late audit error and enforces the ledger Event FK', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const { service } = await createPricedService(ServiceCode.FLYER, ClientType.PLANNER, 5);
    const event = await createReadyEvent(planner, service.id);
    await grantCredits(planner.clientId, planner.userId, 5);
    const principal: AuthPrincipal = {
      userId: planner.userId,
      sessionId: randomUUID(),
      email: planner.email,
      role: UserRole.INDEPENDENT_PLANNER,
      clientId: planner.clientId,
      clientType: ClientType.PLANNER,
      clientStatus: ClientStatus.ACTIVE
    };

    await expect(events.activate(event.id, 'activation-rollback', principal, 'not-a-uuid')).rejects.toThrow();
    expect(await counts(event.id)).toEqual({ ledger: 0, receipts: 0, audits: 0 });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      EventStatus.READY_TO_ACTIVATE
    );
    expect(
      (await prisma.financeBalance.findUniqueOrThrow({ where: { clientId: planner.clientId } })).purchasedCredits
    ).toBe(5);

    const receipt = await prisma.receipt.create({
      data: {
        clientId: planner.clientId,
        operationType: 'FK_TEST',
        operationReference: randomUUID(),
        idempotencyKey: `fk-test-${randomUUID()}`
      }
    });
    await expect(
      prisma.ledgerEntry.create({
        data: {
          clientId: planner.clientId,
          eventId: randomUUID(),
          actorUserId: planner.userId,
          movementType: LedgerMovementType.MANUAL_CREDIT_GRANT,
          purchasedCreditDelta: 1,
          creditLineUsedDelta: 0,
          debtDelta: 0,
          cashMxnDelta: 0,
          operationReference: 'fk-test',
          idempotencyKey: `fk-ledger-${randomUUID()}`,
          receiptId: receipt.id
        }
      })
    ).rejects.toThrow();
    expect(await prisma.ledgerEntry.count({ where: { receiptId: receipt.id } })).toBe(0);
  });

  it('publishes activation and its response contract in OpenAPI', () => {
    const operation = createOpenApiDocument(app).paths['/api/v1/events/{eventId}/activate']?.post;
    expect(operation).toBeDefined();
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ in: 'header', name: 'Idempotency-Key', required: true })])
    );
    expect(operation?.responses).toHaveProperty('200');
  });

  function activate(eventId: string, cookie: string, idempotencyKey: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/activate`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey);
  }

  async function createClientUser(type: ClientType, role: UserRole, status: ClientStatus = ClientStatus.ACTIVE) {
    const client = await prisma.client.create({ data: { type, status, name: `Client ${randomUUID()}` } });
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

  async function createPricedService(code: ServiceCode, clientType: ClientType, credits: number) {
    const service = await prisma.service.create({ data: { code } });
    const price = await createPrice(service.id, clientType, credits);
    return { service, price };
  }

  function createPrice(serviceId: string, clientType: ClientType, credits: number) {
    return prisma.servicePrice.create({
      data: {
        serviceId,
        clientType,
        credits,
        validFrom: new Date(Date.now() - 60_000)
      }
    });
  }

  async function createReadyEvent(
    owner: { clientId: string; userId: string },
    serviceId: string,
    status: EventStatus = EventStatus.READY_TO_ACTIVATE
  ) {
    const event = await prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        serviceId,
        name: `Event ${randomUUID()}`,
        socialType: EventSocialType.OTHER,
        status,
        eventDateTime: new Date(Date.now() + 86_400_000),
        timeZone: 'America/Mexico_City',
        capacity: 100
      }
    });
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    if (service.code === ServiceCode.FLYER || service.code === ServiceCode.FLIPBOOK) {
      await createCompleteDesign(event, owner.userId, service.code);
    }
    return event;
  }

  async function createCompleteDesign(
    event: { id: string; clientId: string },
    userId: string,
    serviceCode: ServiceCode
  ): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const createAsset = (ownerType: 'FLYER' | 'FLIPBOOK_PAGE', fileType: FileAssetType) =>
        transaction.fileAsset.create({
          data: {
            clientId: event.clientId,
            eventId: event.id,
            ownerType,
            fileType,
            storageKey: randomBytes(32).toString('hex'),
            originalName: 'activation.png',
            mimeType: 'image/png',
            sizeBytes: 64,
            checksumSha256: randomBytes(32).toString('hex'),
            width: 10,
            height: 10,
            createdByUserId: userId,
            status: FileAssetStatus.READY
          }
        });
      if (serviceCode === ServiceCode.FLYER) {
        const initial = await createAsset('FLYER', FileAssetType.FLYER_INITIAL_IMAGE);
        const qr = await createAsset('FLYER', FileAssetType.FLYER_QR_IMAGE);
        const design = await transaction.invitationDesign.create({
          data: {
            eventId: event.id,
            type: 'FLYER',
            flyerInitialAssetId: initial.id,
            flyerQrAssetId: qr.id
          }
        });
        await transaction.fileAsset.updateMany({
          where: { id: { in: [initial.id, qr.id] } },
          data: { ownerId: design.id, associatedAt: new Date() }
        });
        for (const action of ['RSVP', 'LOCATION', 'GIFT_REGISTRY', 'QR_AREA'] as const) {
          await transaction.hotspot.create({
            data: {
              eventId: event.id,
              designId: design.id,
              visualOwnerType: 'FLYER',
              action,
              x: 0,
              y: 0,
              width: 0.2,
              height: 0.2
            }
          });
        }
      } else {
        const design = await transaction.invitationDesign.create({
          data: { eventId: event.id, type: 'FLIPBOOK' }
        });
        const asset = await createAsset('FLIPBOOK_PAGE', FileAssetType.FLIPBOOK_PAGE_IMAGE);
        const page = await transaction.flipbookPage.create({
          data: {
            eventId: event.id,
            designId: design.id,
            fileAssetId: asset.id,
            position: 1
          }
        });
        await transaction.fileAsset.update({
          where: { id: asset.id },
          data: { ownerId: page.id, associatedAt: new Date() }
        });
        for (const action of ['RSVP', 'LOCATION', 'GIFT_REGISTRY', 'QR_AREA'] as const) {
          await transaction.hotspot.create({
            data: {
              eventId: event.id,
              designId: design.id,
              visualOwnerType: 'FLIPBOOK_PAGE',
              flipbookPageId: page.id,
              action,
              x: 0,
              y: 0,
              width: 0.2,
              height: 0.2
            }
          });
        }
      }
    });
  }

  function createActivationReceipt(
    clientId: string,
    eventId: string,
    idempotencyKey: string,
    operationType = 'EVENT_ACTIVATION'
  ) {
    return prisma.receipt.create({
      data: {
        clientId,
        operationType,
        operationReference: eventId,
        idempotencyKey
      }
    });
  }

  function activationSnapshotData(
    actorUserId: string,
    serviceId: string,
    servicePriceId: string,
    receiptId: string,
    idempotencyKey: string,
    credits: number
  ) {
    return {
      activatedAt: new Date(),
      activatedByUserId: actorUserId,
      activatedServiceId: serviceId,
      activatedServicePriceId: servicePriceId,
      baseCostCredits: credits,
      promotionDiscountCredits: 0,
      finalCostCredits: credits,
      purchasedCreditsUsed: credits,
      creditLineCreditsUsed: 0,
      creditUnitValueMxnCentsSnapshot: null,
      activationReceiptId: receiptId,
      activationIdempotencyKey: idempotencyKey
    };
  }

  function activationSnapshotOf(event: {
    activatedAt: Date | null;
    activatedByUserId: string | null;
    activatedServiceId: string | null;
    activatedServicePriceId: string | null;
    baseCostCredits: number | null;
    promotionDiscountCredits: number | null;
    finalCostCredits: number | null;
    purchasedCreditsUsed: number | null;
    creditLineCreditsUsed: number | null;
    creditUnitValueMxnCentsSnapshot: number | null;
    activationReceiptId: string | null;
    activationIdempotencyKey: string | null;
  }) {
    return {
      activatedAt: event.activatedAt,
      activatedByUserId: event.activatedByUserId,
      activatedServiceId: event.activatedServiceId,
      activatedServicePriceId: event.activatedServicePriceId,
      baseCostCredits: event.baseCostCredits,
      promotionDiscountCredits: event.promotionDiscountCredits,
      finalCostCredits: event.finalCostCredits,
      purchasedCreditsUsed: event.purchasedCreditsUsed,
      creditLineCreditsUsed: event.creditLineCreditsUsed,
      creditUnitValueMxnCentsSnapshot: event.creditUnitValueMxnCentsSnapshot,
      activationReceiptId: event.activationReceiptId,
      activationIdempotencyKey: event.activationIdempotencyKey
    };
  }

  async function grantCredits(clientId: string, actorUserId: string, credits: number) {
    const key = `grant-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: {
        clientId,
        operationType: LedgerMovementType.MANUAL_CREDIT_GRANT,
        operationReference: key,
        idempotencyKey: key
      }
    });
    return prisma.ledgerEntry.create({
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

  async function configureLine(
    clientId: string,
    limitCredits: number,
    status: CreditLineStatus = CreditLineStatus.ACTIVE,
    expiresAt: Date | null = null
  ) {
    await prisma.creditLine.create({ data: { clientId, limitCredits, status, expiresAt } });
    await prisma.financeBalance.upsert({
      where: { clientId },
      create: { clientId, creditLineLimit: limitCredits },
      update: { creditLineLimit: limitCredits }
    });
  }

  async function counts(eventId: string) {
    const [ledger, receipts, audits] = await Promise.all([
      prisma.ledgerEntry.count({ where: { eventId } }),
      prisma.receipt.count({ where: { operationReference: eventId } }),
      prisma.auditLog.count({ where: { eventId, action: 'EVENT_ACTIVATE' } })
    ]);
    return { ledger, receipts, audits };
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
