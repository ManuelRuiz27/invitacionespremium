import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { FileStorage } from '../src/file-assets/file-storage';
import {
  AssistantResponseStatus,
  AuditActorType,
  ClientType,
  EventStatus,
  FileAssetStatus,
  FileAssetType,
  InvitationResponseStatus,
  LedgerMovementType,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { createOpenApiDocument } from '../src/openapi/openapi';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Public RSVP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: InvitationTokenService;
  let storage: FileStorage;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-public-rsvp-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(InvitationTokenService);
    storage = app.get(FileStorage);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('resolves the private view, reconciles nominal assistants idempotently, rejects and supports close/reopen override', async () => {
    const fixture = await createFixture({ capacity: 4, withDesign: true });
    const cookie = await login(fixture.email);
    const view = await publicGet(fixture.token).expect(200);
    expect(view.body).toMatchObject({
      status: 'AVAILABLE',
      event: { name: 'Evento RSVP', timeZone: 'America/Mexico_City' },
      invitation: { id: fixture.invitationId, responseStatus: 'PENDING' },
      confirmation: { open: true },
      designType: 'FLYER'
    });
    const serialized = JSON.stringify(view.body);
    for (const forbidden of ['clientId', 'contactId', 'storageKey', 'checksum', 'qrTokenNonce', '+5255']) {
      expect(serialized).not.toContain(forbidden);
    }

    const payload = { additionalAssistants: [{ name: 'Acompañante Uno' }, { name: 'Acompañante Uno' }] };
    const first = await publicPost(fixture.token, 'confirm', payload).expect(200);
    const repeated = await publicPost(fixture.token, 'confirm', payload).expect(200);
    expect(repeated.body).toEqual(first.body);
    expect(first.body).toMatchObject({ responseStatus: 'CONFIRMED' });
    expect(await prisma.assistant.count({ where: { invitationId: fixture.invitationId, deletedAt: null } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { resourceId: fixture.invitationId, action: 'RSVP_CONFIRM' } })).toBe(
      1
    );

    const [primary, extra] = first.body.assistants as Array<{ id: string; isPrimary: boolean }>;
    expect(primary?.isPrimary).toBe(true);
    await publicPatch(fixture.token, { additionalAssistants: [{ id: extra!.id, name: 'Nombre actualizado' }] })
      .expect(200)
      .expect(({ body }) => expect(body.assistants).toHaveLength(2));
    await publicPost(fixture.token, 'reject').expect(200);
    expect(
      await prisma.assistant.count({
        where: { invitationId: fixture.invitationId, deletedAt: null, responseStatus: AssistantResponseStatus.REJECTED }
      })
    ).toBe(2);

    const closed = await authPost(`/events/${fixture.eventId}/confirmation/close`, cookie).expect(200);
    const repeatedClose = await authPost(`/events/${fixture.eventId}/confirmation/close`, cookie).expect(200);
    expect(repeatedClose.body).toEqual(closed.body);
    await publicPost(fixture.token, 'confirm', { additionalAssistants: [] })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('RSVP_CLOSED');
        expect(body.message).toBe('La confirmación de asistencia ya fue cerrada. Contacta al organizador.');
      });
    await authPut(`/events/${fixture.eventId}/invitations/${fixture.invitationId}/confirmation`, cookie, {
      responseStatus: 'CONFIRMED',
      additionalAssistants: []
    }).expect(200);
    await authPost(`/events/${fixture.eventId}/confirmation/reopen`, cookie).expect(200);
    await publicPost(fixture.token, 'reject').expect(200);
    expect(await prisma.auditLog.count({ where: { actorType: AuditActorType.PUBLIC_TOKEN } })).toBeGreaterThan(0);
    const publicAudits = await prisma.auditLog.findMany({ where: { actorType: AuditActorType.PUBLIC_TOKEN } });
    expect(JSON.stringify(publicAudits)).not.toContain(fixture.token);
    expect(JSON.stringify(publicAudits)).not.toContain('Nombre actualizado');
  });

  it('serializes invitations competing for the final capacity place and never commits an over-capacity state', async () => {
    const fixture = await createFixture({ capacity: 1 });
    const second = await addInvitation(fixture.eventId, 'Segunda');
    const results = await Promise.all([
      publicPost(fixture.token, 'confirm', { additionalAssistants: [] }),
      publicPost(second.token, 'confirm', { additionalAssistants: [] })
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(results.find(({ status }) => status === 409)?.body.code).toBe('RSVP_EVENT_CAPACITY_EXCEEDED');
    expect(
      await prisma.assistant.count({
        where: { eventId: fixture.eventId, deletedAt: null, responseStatus: AssistantResponseStatus.CONFIRMED }
      })
    ).toBe(1);

    const sameInvitation = await Promise.all([
      publicPost(fixture.token, 'reject'),
      publicPost(fixture.token, 'confirm', { additionalAssistants: [] })
    ]);
    expect(sameInvitation.every(({ status }) => [200, 409].includes(status))).toBe(true);
    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(
      invitation.assistants.every(
        ({ responseStatus }) => responseStatus === (invitation.responseStatus as unknown as AssistantResponseStatus)
      )
    ).toBe(true);
  });

  it('serializes same-invitation, close, override, cancellation and asset races without mixed aggregates', async () => {
    const fixture = await createFixture({ capacity: 4, withDesign: true });
    const cookie = await login(fixture.email);
    const samePayload = { additionalAssistants: [{ name: 'Mismo acompañante' }] };
    const sameInvitation = await Promise.all([
      publicPost(fixture.token, 'confirm', samePayload),
      publicPost(fixture.token, 'confirm', samePayload)
    ]);
    expect(sameInvitation.every(({ status }) => status === 200)).toBe(true);
    let stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(stored.assistants).toHaveLength(2);
    const extraId = stored.assistants.find(({ isPrimary }) => !isPrimary)!.id;

    const sameId = { additionalAssistants: [{ id: extraId, name: 'Nombre concurrente' }] };
    expect(
      (await Promise.all([publicPatch(fixture.token, sameId), publicPatch(fixture.token, sameId)])).every(
        ({ status }) => status === 200
      )
    ).toBe(true);
    expect(await prisma.assistant.count({ where: { invitationId: fixture.invitationId, deletedAt: null } })).toBe(2);

    const closeAgainstConfirm = await Promise.all([
      publicPost(fixture.token, 'confirm', sameId),
      authPost(`/events/${fixture.eventId}/confirmation/close`, cookie)
    ]);
    expect(closeAgainstConfirm.every(({ status }) => [200, 409].includes(status))).toBe(true);
    const closedEvent = await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } });
    expect(Boolean(closedEvent.confirmationClosedAt)).toBe(Boolean(closedEvent.confirmationClosedByUserId));

    const closeAgainstReopen = await Promise.all([
      authPost(`/events/${fixture.eventId}/confirmation/close`, cookie),
      authPost(`/events/${fixture.eventId}/confirmation/reopen`, cookie)
    ]);
    expect(closeAgainstReopen.every(({ status }) => status === 200)).toBe(true);
    const closureResult = await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } });
    expect(Boolean(closureResult.confirmationClosedAt)).toBe(Boolean(closureResult.confirmationClosedByUserId));
    if (closureResult.confirmationClosedAt) {
      await authPost(`/events/${fixture.eventId}/confirmation/reopen`, cookie).expect(200);
    }

    const overrideAgainstPublic = await Promise.all([
      authPut(`/events/${fixture.eventId}/invitations/${fixture.invitationId}/confirmation`, cookie, {
        responseStatus: 'REJECTED',
        additionalAssistants: []
      }),
      publicPost(fixture.token, 'confirm', sameId)
    ]);
    expect(overrideAgainstPublic.every(({ status }) => status === 200)).toBe(true);
    stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(
      stored.assistants.every(
        ({ responseStatus }) => responseStatus === (stored.responseStatus as unknown as AssistantResponseStatus)
      )
    ).toBe(true);

    const asset = await prisma.fileAsset.findFirstOrThrow({
      where: { eventId: fixture.eventId, fileType: FileAssetType.FLYER_INITIAL_IMAGE }
    });
    const assetAgainstCancel = await Promise.all([
      request(app.getHttpServer()).get(`/api/v1/public/invitations/${fixture.token}/assets/${asset.id}/content`),
      authCancel(fixture.eventId, fixture.invitationId, cookie)
    ]);
    expect([200, 404]).toContain(assetAgainstCancel[0].status);
    expect(assetAgainstCancel[1].status).toBe(200);
    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations/${fixture.token}/assets/${asset.id}/content`)
      .expect(404);
    await publicPost(fixture.token, 'confirm', sameId)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('RSVP_INVITATION_CANCELLED'));
  });

  it('serves only a currently referenced READY asset with private headers and hides cross-event assets', async () => {
    const fixture = await createFixture({ capacity: 2, withDesign: true });
    const asset = await prisma.fileAsset.findFirstOrThrow({ where: { eventId: fixture.eventId } });
    const content = await request(app.getHttpServer())
      .get(`/api/v1/public/invitations/${fixture.token}/assets/${asset.id}/content`)
      .expect(200);
    expect(content.headers).toMatchObject({
      'content-type': 'image/png',
      'content-disposition': 'inline',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    expect(content.headers.etag).toMatch(/^"sha256-/u);

    const other = await createFixture({ capacity: 2, withDesign: true });
    const otherAsset = await prisma.fileAsset.findFirstOrThrow({ where: { eventId: other.eventId } });
    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations/${fixture.token}/assets/${otherAsset.id}/content`)
      .expect(404);
    const hidden = await prisma.fileAsset.create({
      data: {
        clientId: fixture.clientId,
        eventId: fixture.eventId,
        ownerType: 'FLYER',
        fileType: FileAssetType.FLYER_INITIAL_IMAGE,
        storageKey: storage.generateKey(),
        originalName: 'hidden.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        checksumSha256: randomBytes(32).toString('hex'),
        width: 1,
        height: 1,
        createdByUserId: fixture.userId,
        status: FileAssetStatus.HIDDEN
      }
    });
    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations/${fixture.token}/assets/${hidden.id}/content`)
      .expect(404);
  });

  it('enforces closure actor, frozen destinations, deferred response coherence and truncate protection in PostgreSQL', async () => {
    const fixture = await createFixture({ capacity: 2 });
    const outsider = await createUser(null, UserRole.PLATFORM_ADMIN);
    await expect(
      prisma.event.update({
        where: { id: fixture.eventId },
        data: { confirmationClosedAt: new Date(), confirmationClosedByUserId: outsider.userId }
      })
    ).rejects.toThrow(/confirmation closure actor is not authorized/u);
    await expect(
      prisma.event.update({ where: { id: fixture.eventId }, data: { locationUrl: 'https://example.com/otro' } })
    ).rejects.toThrow(/frozen after activation/u);
    await expect(
      prisma.invitation.update({
        where: { id: fixture.invitationId },
        data: { responseStatus: InvitationResponseStatus.CONFIRMED }
      })
    ).rejects.toThrow(/response states must agree/u);
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "assistant"')).rejects.toThrow(/cannot be truncated/u);
  });

  it('publishes every CODEX-070 operation in OpenAPI', () => {
    const paths = createOpenApiDocument(app).paths;
    for (const path of [
      '/api/v1/public/invitations/{invitationToken}',
      '/api/v1/public/invitations/{invitationToken}/assets/{fileAssetId}/content',
      '/api/v1/public/invitations/{invitationToken}/confirm',
      '/api/v1/public/invitations/{invitationToken}/reject',
      '/api/v1/public/invitations/{invitationToken}/assistants',
      '/api/v1/events/{eventId}/confirmation',
      '/api/v1/events/{eventId}/confirmation/close',
      '/api/v1/events/{eventId}/confirmation/reopen',
      '/api/v1/events/{eventId}/invitations/{invitationId}/confirmation'
    ])
      expect(paths).toHaveProperty(path);
  });

  async function createFixture(input: { capacity: number; withDesign?: boolean }) {
    const owner = await createClientUser();
    const event = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const service = await tx.service.upsert({
        where: { code: ServiceCode.FLYER },
        create: { code: ServiceCode.FLYER },
        update: {}
      });
      const price =
        (await tx.servicePrice.findFirst({ where: { serviceId: service.id, clientType: ClientType.PLANNER } })) ??
        (await tx.servicePrice.create({
          data: {
            serviceId: service.id,
            clientType: ClientType.PLANNER,
            credits: 0,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        }));
      const activationKey = `rsvp-activation-${randomUUID()}`;
      const receipt = await tx.receipt.create({
        data: {
          folio: 8_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000_000)),
          clientId: owner.clientId,
          operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
          operationReference: activationKey,
          idempotencyKey: activationKey
        }
      });
      return tx.event.create({
        data: {
          clientId: owner.clientId,
          createdByUserId: owner.userId,
          serviceId: service.id,
          name: 'Evento RSVP',
          status: EventStatus.ACTIVE,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: input.capacity,
          confirmationEnabled: true,
          locationUrl: 'https://maps.google.com/?q=19.4326,-99.1332',
          giftRegistryUrl: 'https://example.com/mesa?evento=1',
          activatedAt: new Date(),
          activatedByUserId: owner.userId,
          activatedServiceId: service.id,
          activatedServicePriceId: price.id,
          baseCostCredits: 0,
          promotionDiscountCredits: 0,
          finalCostCredits: 0,
          purchasedCreditsUsed: 0,
          creditLineCreditsUsed: 0,
          activationReceiptId: receipt.id,
          activationIdempotencyKey: activationKey
        }
      });
    });
    const invitation = await addInvitation(event.id, 'Principal');
    if (input.withDesign) await addFlyerDesign(owner, event.id);
    return { ...owner, eventId: event.id, invitationId: invitation.invitationId, token: invitation.token };
  }

  async function addInvitation(eventId: string, name: string) {
    const nonce = randomBytes(32).toString('hex');
    const invitation = await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          eventId,
          name,
          whatsappPhoneNormalized: `+5255${String(Math.random()).slice(2, 10).padEnd(8, '0')}`
        }
      });
      const created = await tx.invitation.create({
        data: {
          eventId,
          contactId: contact.id,
          additionalAssistantLimit: 2,
          invitationTokenNonce: nonce,
          qrTokenNonce: randomBytes(32).toString('hex')
        }
      });
      await tx.assistant.create({ data: { eventId, invitationId: created.id, name, isPrimary: true } });
      return created;
    });
    return { invitationId: invitation.id, token: tokens.issue('INVITATION', invitation.id, nonce) };
  }

  async function addFlyerDesign(owner: { clientId: string; userId: string }, eventId: string) {
    const bytes = Buffer.from('public-rsvp-image');
    const createAsset = async (fileType: FileAssetType) => {
      const key = storage.generateKey();
      await storage.write({ storageKey: key, bytes });
      return prisma.fileAsset.create({
        data: {
          clientId: owner.clientId,
          eventId,
          ownerType: 'FLYER',
          fileType,
          storageKey: key,
          originalName: 'public.png',
          mimeType: 'image/png',
          sizeBytes: bytes.length,
          checksumSha256: randomBytes(32).toString('hex'),
          width: 10,
          height: 10,
          createdByUserId: owner.userId,
          status: FileAssetStatus.READY
        }
      });
    };
    const initial = await createAsset(FileAssetType.FLYER_INITIAL_IMAGE);
    const qr = await createAsset(FileAssetType.FLYER_QR_IMAGE);
    await prisma.$transaction(async (tx) => {
      const design = await tx.invitationDesign.create({
        data: { eventId, type: 'FLYER', flyerInitialAssetId: initial.id, flyerQrAssetId: qr.id }
      });
      await tx.fileAsset.updateMany({
        where: { id: { in: [initial.id, qr.id] } },
        data: { ownerId: design.id, associatedAt: new Date() }
      });
      for (const action of ['RSVP', 'LOCATION', 'GIFT_REGISTRY', 'QR_AREA'] as const) {
        await tx.hotspot.create({
          data: {
            eventId,
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
    });
  }

  async function createClientUser() {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: randomUUID() } });
    const user = await createUser(client.id, UserRole.INDEPENDENT_PLANNER);
    return { clientId: client.id, ...user };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { userId: user.id, email };
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing cookie.');
    return cookie;
  }

  function publicGet(token: string) {
    return request(app.getHttpServer()).get(`/api/v1/public/invitations/${token}`);
  }

  function publicPost(token: string, action: 'confirm' | 'reject', body?: object) {
    const call = request(app.getHttpServer()).post(`/api/v1/public/invitations/${token}/${action}`);
    return body ? call.send(body) : call.send({});
  }

  function publicPatch(token: string, body: object) {
    return request(app.getHttpServer()).patch(`/api/v1/public/invitations/${token}/assistants`).send(body);
  }

  function authPost(path: string, cookie: string) {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', origin).set('Cookie', cookie).send({});
  }

  function authPut(path: string, cookie: string, body: object) {
    return request(app.getHttpServer()).put(`/api/v1${path}`).set('Origin', origin).set('Cookie', cookie).send(body);
  }

  function authCancel(eventId: string, invitationId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/invitations/${invitationId}/cancel`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', `rsvp-cancel-${randomUUID()}`)
      .send({});
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "hotspot", "flipbook_page", "invitation_design", "file_asset",
        "assistant", "invitation", "contact_import_preview", "contact", "contact_group", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
