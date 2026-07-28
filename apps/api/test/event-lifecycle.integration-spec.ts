import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { EventLifecycleService } from '../src/events/event-lifecycle.service';
import {
  AuditActorType,
  ClientStatus,
  ClientType,
  EventSocialType,
  EventStateAction,
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
const futureEventDate = new Date('2030-05-15T20:00:00.000Z');

describe('Event lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let lifecycle: EventLifecycleService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = trustedOrigin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    lifecycle = app.get(EventLifecycleService);
  });

  beforeEach(resetDatabase);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  it('closes ACTIVE and EVENT_DAY Events and reopens CLOSED according to the local date', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const catalog = await createCatalog();
    const cookie = await login(planner.email);
    const active = await createActivatedEvent(planner, catalog.service.id, catalog.plannerPrice.id);
    const eventDay = await createActivatedEvent(
      planner,
      catalog.service.id,
      catalog.plannerPrice.id,
      EventStatus.EVENT_DAY
    );

    const closedActive = await transition(active.id, 'close', cookie, 'lifecycle-close-active').expect(200);
    const closedEventDay = await transition(eventDay.id, 'close', cookie, 'lifecycle-close-event-day').expect(200);
    expect(closedActive.body.status).toBe(EventStatus.CLOSED);
    expect(closedEventDay.body.status).toBe(EventStatus.CLOSED);

    const reopenedActive = await transition(active.id, 'reopen', cookie, 'lifecycle-reopen-active').expect(200);
    expect(reopenedActive.body.status).toBe(EventStatus.ACTIVE);

    const localDay = new Date('2030-05-15T23:00:00.000Z');
    const principal = principalFor(planner, UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const reopenedEventDay = await lifecycle.reopen(
      eventDay.id,
      'lifecycle-reopen-event-day',
      principal,
      randomUUID(),
      localDay
    );
    expect(reopenedEventDay.status).toBe(EventStatus.EVENT_DAY);
    expect(await prisma.auditLog.count({ where: { action: 'EVENT_CLOSE' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'EVENT_REOPEN' } })).toBe(2);
  });

  it('cancels before and after activation without financial effects and preserves snapshots', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const catalog = await createCatalog();
    const cookie = await login(planner.email);
    const draft = await createDraft(planner);

    const cancelledDraft = await transition(draft.id, 'cancel', cookie, 'lifecycle-cancel-draft').expect(200);
    expect(cancelledDraft.body).toMatchObject({
      status: EventStatus.CANCELLED,
      activatedAt: null,
      activationReceiptId: null
    });

    const ready = await createReadyEvent(planner, catalog.service.id);
    await createCompleteFlyerDesign(ready, planner.userId);
    await grantCredits(planner.clientId, planner.userId, 5);
    await transition(ready.id, 'activate', cookie, 'lifecycle-activation-paid').expect(200);
    const activated = await prisma.event.findUniqueOrThrow({ where: { id: ready.id } });
    const financialBefore = await financialState(planner.clientId);

    const cancelledActive = await transition(ready.id, 'cancel', cookie, 'lifecycle-cancel-active').expect(200);
    expect(cancelledActive.body.status).toBe(EventStatus.CANCELLED);
    expect(activationSnapshotOf(cancelledActive.body)).toEqual(activationSnapshotOf(activated));
    expect(await financialState(planner.clientId)).toEqual(financialBefore);
    expect(await prisma.auditLog.count({ where: { eventId: ready.id, action: 'EVENT_CANCEL' } })).toBe(1);

    await transition(ready.id, 'reopen', cookie, 'lifecycle-terminal-cancelled')
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_INVALID_STATE_TRANSITION'));
  });

  it('archives CLOSED and ALBUM_PUBLISHED fixtures and enforces terminal states in PostgreSQL', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const catalog = await createCatalog();
    const cookie = await login(planner.email);
    const closed = await createActivatedEvent(planner, catalog.service.id, catalog.plannerPrice.id, EventStatus.CLOSED);
    const album = await createActivatedEvent(
      planner,
      catalog.service.id,
      catalog.plannerPrice.id,
      EventStatus.ALBUM_PUBLISHED
    );

    await transition(closed.id, 'cancel', cookie, 'lifecycle-closed-cancel-forbidden').expect(409);
    await transition(closed.id, 'archive', cookie, 'lifecycle-archive-closed')
      .expect(200)
      .expect((response) => expect(response.body.status).toBe(EventStatus.ARCHIVED));
    await transition(album.id, 'cancel', cookie, 'lifecycle-album-cancel-forbidden').expect(409);
    await transition(album.id, 'archive', cookie, 'lifecycle-archive-album')
      .expect(200)
      .expect((response) => expect(response.body.status).toBe(EventStatus.ARCHIVED));
    await transition(closed.id, 'reopen', cookie, 'lifecycle-archived-terminal').expect(409);

    const cancelled = await createDraft(planner);
    await transition(cancelled.id, 'cancel', cookie, 'lifecycle-cancel-terminal').expect(200);
    await expect(
      prisma.event.update({ where: { id: cancelled.id }, data: { status: EventStatus.DRAFT } })
    ).rejects.toThrow();
    await expect(
      prisma.event.update({ where: { id: closed.id }, data: { status: EventStatus.CLOSED } })
    ).rejects.toThrow();

    const forbidden = await createActivatedEvent(planner, catalog.service.id, catalog.plannerPrice.id);
    await transition(forbidden.id, 'archive', cookie, 'lifecycle-active-archive-forbidden').expect(409);
    await expect(
      prisma.event.update({ where: { id: forbidden.id }, data: { status: EventStatus.ARCHIVED } })
    ).rejects.toThrow();
    const unchanged = await prisma.event.update({
      where: { id: forbidden.id },
      data: { status: EventStatus.ACTIVE }
    });
    expect(unchanged.status).toBe(EventStatus.ACTIVE);
  });

  it('enforces ownership, blocks Platform Admin and ignores soft-deleted Events', async () => {
    const independent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const plannerOne = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const plannerTwo = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const independentEvent = await createDraft(independent);
    const adminEvent = await createDraft({ clientId: organization.clientId, userId: plannerOne.userId });
    const plannerEvent = await createDraft({ clientId: organization.clientId, userId: plannerTwo.userId });

    await transition(
      independentEvent.id,
      'cancel',
      await login(independent.email),
      'lifecycle-owner-independent'
    ).expect(200);
    await transition(adminEvent.id, 'cancel', await login(organization.email), 'lifecycle-owner-admin').expect(200);
    await transition(plannerEvent.id, 'cancel', await login(plannerTwo.email), 'lifecycle-owner-planner').expect(200);

    const forbidden = await createDraft({ clientId: organization.clientId, userId: plannerTwo.userId });
    await transition(forbidden.id, 'cancel', await login(plannerOne.email), 'lifecycle-owner-forbidden').expect(404);
    await transition(forbidden.id, 'cancel', await login(platform.email), 'lifecycle-platform-forbidden').expect(403);

    const softDeleted = await createDraft(independent);
    await prisma.event.update({ where: { id: softDeleted.id }, data: { deletedAt: new Date() } });
    await transition(softDeleted.id, 'cancel', await login(independent.email), 'lifecycle-soft-deleted').expect(404);
  });

  it('is idempotent per action, rejects key reuse and serializes concurrent requests', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const catalog = await createCatalog();
    const cookie = await login(planner.email);
    const event = await createActivatedEvent(planner, catalog.service.id, catalog.plannerPrice.id);

    const first = await transition(event.id, 'close', cookie, 'lifecycle-idempotent-key').expect(200);
    const repeated = await transition(event.id, 'close', cookie, 'lifecycle-idempotent-key').expect(200);
    expect(repeated.body).toEqual(first.body);
    expect(await prisma.eventStateOperation.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: event.id, action: 'EVENT_CLOSE' } })).toBe(1);
    const operation = await prisma.eventStateOperation.findFirstOrThrow({ where: { eventId: event.id } });
    await expect(
      prisma.eventStateOperation.update({
        where: { id: operation.id },
        data: { resultSnapshot: {} }
      })
    ).rejects.toThrow();
    await expect(prisma.eventStateOperation.delete({ where: { id: operation.id } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "event_state_operation"')).rejects.toThrow();
    expect(await prisma.eventStateOperation.count({ where: { eventId: event.id } })).toBe(1);
    await transition(event.id, 'archive', cookie, 'lifecycle-idempotent-key')
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_STATE_IDEMPOTENCY_CONFLICT'));
    const anotherEvent = await createActivatedEvent(planner, catalog.service.id, catalog.plannerPrice.id);
    await transition(anotherEvent.id, 'close', cookie, 'lifecycle-idempotent-key')
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_STATE_IDEMPOTENCY_CONFLICT'));
    await transition(event.id, 'close', cookie, 'lifecycle-different-key')
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_INVALID_STATE_TRANSITION'));

    const concurrent = await createActivatedEvent(planner, catalog.service.id, catalog.plannerPrice.id);
    const responses = await Promise.all([
      transition(concurrent.id, 'close', cookie, 'lifecycle-concurrent-key').then((response) => response),
      transition(concurrent.id, 'close', cookie, 'lifecycle-concurrent-key').then((response) => response)
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(await prisma.eventStateOperation.count({ where: { eventId: concurrent.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: concurrent.id, action: 'EVENT_CLOSE' } })).toBe(1);
  });

  it('authorizes an exact replay after soft delete without exposing another owner Event', async () => {
    const owner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const outsider = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const catalog = await createCatalog();
    const ownerCookie = await login(owner.email);
    const outsiderCookie = await login(outsider.email);
    const event = await createActivatedEvent(owner, catalog.service.id, catalog.plannerPrice.id);
    const key = 'lifecycle-deleted-replay';

    const original = await transition(event.id, 'close', ownerCookie, key).expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${event.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', ownerCookie)
      .expect(204);

    const replay = await transition(event.id, 'close', ownerCookie, key).expect(200);
    expect(replay.body).toEqual(original.body);
    expect(await prisma.eventStateOperation.count({ where: { eventId: event.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: event.id, action: 'EVENT_CLOSE' } })).toBe(1);

    await transition(event.id, 'close', ownerCookie, 'lifecycle-deleted-new-key')
      .expect(404)
      .expect((response) => expect(response.body.code).toBe('EVENT_NOT_FOUND'));
    await transition(event.id, 'close', outsiderCookie, key)
      .expect(404)
      .expect((response) => expect(response.body.code).toBe('EVENT_NOT_FOUND'));
    await transition(event.id, 'archive', ownerCookie, key)
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_STATE_IDEMPOTENCY_CONFLICT'));

    const ownerOtherEvent = await createActivatedEvent(owner, catalog.service.id, catalog.plannerPrice.id);
    await transition(ownerOtherEvent.id, 'close', ownerCookie, key)
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_STATE_IDEMPOTENCY_CONFLICT'));

    const outsiderEvent = await createActivatedEvent(outsider, catalog.service.id, catalog.plannerPrice.id);
    await transition(outsiderEvent.id, 'close', ownerCookie, key)
      .expect(404)
      .expect((response) => expect(response.body.code).toBe('EVENT_NOT_FOUND'));
    await transition(outsiderEvent.id, 'close', outsiderCookie, key)
      .expect(409)
      .expect((response) => expect(response.body.code).toBe('EVENT_STATE_IDEMPOTENCY_CONFLICT'));
  });

  it('advances EVENT_DAY idempotently across midnight in America/Mexico_City without finance effects', async () => {
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const catalog = await createCatalog();
    const beforeMidnight = await createActivatedEvent(
      planner,
      catalog.service.id,
      catalog.plannerPrice.id,
      EventStatus.ACTIVE,
      new Date('2026-07-27T20:00:00.000Z')
    );
    const afterMidnight = await createActivatedEvent(
      planner,
      catalog.service.id,
      catalog.plannerPrice.id,
      EventStatus.ACTIVE,
      new Date('2026-07-28T20:00:00.000Z')
    );
    const financeBefore = await financialState(planner.clientId);

    expect(await lifecycle.advanceEventsToEventDay(new Date('2026-07-28T05:59:00.000Z'))).toBe(1);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: beforeMidnight.id } })).status).toBe(
      EventStatus.EVENT_DAY
    );
    expect((await prisma.event.findUniqueOrThrow({ where: { id: afterMidnight.id } })).status).toBe(EventStatus.ACTIVE);
    expect(await lifecycle.advanceEventsToEventDay(new Date('2026-07-28T05:59:00.000Z'))).toBe(0);
    expect(await lifecycle.advanceEventsToEventDay(new Date('2026-07-28T06:01:00.000Z'))).toBe(1);
    expect(await lifecycle.advanceEventsToEventDay(new Date('2026-07-28T06:01:00.000Z'))).toBe(0);

    expect(await prisma.auditLog.count({ where: { action: 'EVENT_ENTER_EVENT_DAY' } })).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { action: 'EVENT_ENTER_EVENT_DAY', actorType: AuditActorType.SYSTEM }
      })
    ).toBe(2);
    expect(await prisma.eventStateOperation.count({ where: { action: EventStateAction.EVENT_DAY } })).toBe(2);
    expect(await financialState(planner.clientId)).toEqual(financeBefore);
  });

  it('publishes every lifecycle endpoint and required idempotency header in OpenAPI', () => {
    const paths = createOpenApiDocument(app).paths;
    for (const action of ['close', 'reopen', 'cancel', 'archive']) {
      const operation = paths[`/api/v1/events/{eventId}/${action}`]?.post;
      expect(operation).toBeDefined();
      expect(operation?.parameters).toEqual(
        expect.arrayContaining([expect.objectContaining({ in: 'header', name: 'Idempotency-Key', required: true })])
      );
      expect(operation?.responses).toHaveProperty('200');
    }
  });

  function transition(eventId: string, action: string, cookie: string, idempotencyKey: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/${action}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey);
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

  async function createCatalog() {
    const service = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    const plannerPrice = await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.PLANNER,
        credits: 5,
        validFrom: new Date('2020-01-01T00:00:00.000Z')
      }
    });
    const organizationPrice = await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.ORGANIZATION,
        credits: 5,
        validFrom: new Date('2020-01-01T00:00:00.000Z')
      }
    });
    return { service, plannerPrice, organizationPrice };
  }

  async function createActivatedEvent(
    owner: { clientId: string; userId: string },
    serviceId: string,
    servicePriceId: string,
    status: EventStatus = EventStatus.ACTIVE,
    eventDateTime: Date = futureEventDate
  ) {
    const eventId = randomUUID();
    const idempotencyKey = `activation-fixture-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: {
        clientId: owner.clientId,
        operationType: 'EVENT_ACTIVATION',
        operationReference: eventId,
        idempotencyKey
      }
    });
    return prisma.event.create({
      data: {
        id: eventId,
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        serviceId,
        name: `Event ${eventId}`,
        socialType: EventSocialType.OTHER,
        status,
        eventDateTime,
        timeZone: 'America/Mexico_City',
        capacity: 100,
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        activatedByUserId: owner.userId,
        activatedServiceId: serviceId,
        activatedServicePriceId: servicePriceId,
        baseCostCredits: 5,
        promotionDiscountCredits: 0,
        finalCostCredits: 5,
        purchasedCreditsUsed: 5,
        creditLineCreditsUsed: 0,
        activationReceiptId: receipt.id,
        activationIdempotencyKey: idempotencyKey
      }
    });
  }

  function createDraft(owner: { clientId: string; userId: string }) {
    return prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        status: EventStatus.DRAFT,
        eventDateTime: futureEventDate,
        timeZone: 'America/Mexico_City'
      }
    });
  }

  function createReadyEvent(owner: { clientId: string; userId: string }, serviceId: string) {
    return prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        serviceId,
        name: `Event ${randomUUID()}`,
        socialType: EventSocialType.OTHER,
        status: EventStatus.READY_TO_ACTIVATE,
        eventDateTime: futureEventDate,
        timeZone: 'America/Mexico_City',
        capacity: 100,
        confirmationEnabled: true,
        locationUrl: 'https://maps.google.com/?q=19.4326,-99.1332',
        giftRegistryUrl: 'https://example.com/mesa-regalos'
      }
    });
  }

  async function createCompleteFlyerDesign(event: { id: string; clientId: string }, userId: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const createAsset = (fileType: FileAssetType) =>
        transaction.fileAsset.create({
          data: {
            clientId: event.clientId,
            eventId: event.id,
            ownerType: 'FLYER',
            fileType,
            storageKey: randomBytes(32).toString('hex'),
            originalName: 'lifecycle.png',
            mimeType: 'image/png',
            sizeBytes: 64,
            checksumSha256: randomBytes(32).toString('hex'),
            width: 10,
            height: 10,
            createdByUserId: userId,
            status: FileAssetStatus.READY
          }
        });
      const initial = await createAsset(FileAssetType.FLYER_INITIAL_IMAGE);
      const qr = await createAsset(FileAssetType.FLYER_QR_IMAGE);
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
      const contact = await transaction.contact.create({
        data: { eventId: event.id, name: 'Contacto activación', whatsappPhoneNormalized: '+525555555555' }
      });
      const invitation = await transaction.invitation.create({
        data: {
          eventId: event.id,
          contactId: contact.id,
          invitationTokenNonce: randomBytes(32).toString('hex'),
          qrTokenNonce: randomBytes(32).toString('hex')
        }
      });
      await transaction.assistant.create({
        data: { eventId: event.id, invitationId: invitation.id, name: 'Contacto activación', isPrimary: true }
      });
    });
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

  async function financialState(clientId: string) {
    const [ledger, receipts, balance] = await Promise.all([
      prisma.ledgerEntry.count({ where: { clientId } }),
      prisma.receipt.count({ where: { clientId } }),
      prisma.financeBalance.findUnique({ where: { clientId } })
    ]);
    return { ledger, receipts, balance };
  }

  function activationSnapshotOf(event: Record<string, unknown>) {
    return {
      activatedAt: event.activatedAt instanceof Date ? event.activatedAt.toISOString() : event.activatedAt,
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

  function principalFor(
    user: { clientId: string; userId: string; email: string },
    role: UserRole,
    clientType: ClientType
  ): AuthPrincipal {
    return {
      userId: user.userId,
      sessionId: randomUUID(),
      email: user.email,
      role,
      clientId: user.clientId,
      clientType,
      clientStatus: ClientStatus.ACTIVE
    };
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
        "event_state_operation",
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
