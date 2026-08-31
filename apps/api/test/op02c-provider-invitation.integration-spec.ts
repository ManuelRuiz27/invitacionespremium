import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientType,
  CommercialChannel,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  HotspotAction,
  HotspotVisualOwnerType,
  ServiceCode,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('OP-02C provider Invitation Design', () => {
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

  it('prepares a Flyer with the real Platform Admin and preserves Planner authorization', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const adminCookie = await login(fixture.admin.email);
    const plannerCookie = await login(fixture.planner.email);
    const initial = await readyAsset(
      fixture.event,
      fixture.admin.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_INITIAL_IMAGE
    );
    const qr = await readyAsset(
      fixture.event,
      fixture.admin.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_QR_IMAGE
    );

    await plannerGet(`/events/${fixture.event.id}/design`, adminCookie).expect(403);
    await adminGet(fixture.client.id, fixture.event.id, 'design/readiness', adminCookie)
      .expect(200)
      .expect(({ body }) => expect(body.blockers).toContain('INVITATION_DESIGN_MISSING'));

    const wrongClient = await prisma.client.create({
      data: { type: ClientType.PLANNER, name: `Wrong ${randomUUID()}` }
    });
    await adminGet(wrongClient.id, fixture.event.id, 'design/readiness', adminCookie)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));
    await adminGet(randomUUID(), fixture.event.id, 'design/readiness', adminCookie)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));
    await adminGet(fixture.client.id, randomUUID(), 'design/readiness', adminCookie)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));

    const created = await adminPost(fixture.client.id, fixture.event.id, 'design/flyer', adminCookie)
      .send({ initialAssetId: initial.id, qrAssetId: qr.id })
      .expect(201);
    expect(created.body).toMatchObject({
      eventId: fixture.event.id,
      type: 'FLYER',
      flyerInitialAssetId: initial.id,
      flyerQrAssetId: qr.id
    });
    expect(await ownerIds([initial.id, qr.id])).toEqual([created.body.id, created.body.id]);

    for (const action of [
      HotspotAction.RSVP,
      HotspotAction.LOCATION,
      HotspotAction.GIFT_REGISTRY,
      HotspotAction.QR_AREA
    ]) {
      await adminPost(fixture.client.id, fixture.event.id, 'hotspots', adminCookie)
        .send(flyerHotspot(action))
        .expect(201);
    }
    await adminGet(fixture.client.id, fixture.event.id, 'design/readiness', adminCookie)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ complete: true, blockers: [] }));

    const hotspots = await adminGet(fixture.client.id, fixture.event.id, 'hotspots', adminCookie).expect(200);
    const rsvp = hotspots.body.find(({ action }: { action: HotspotAction }) => action === HotspotAction.RSVP);
    await adminPatch(fixture.client.id, fixture.event.id, `hotspots/${rsvp.id}`, adminCookie)
      .send({ priority: 9, x: 0.2 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ priority: 9, x: 0.2 }));
    await adminDelete(fixture.client.id, fixture.event.id, `hotspots/${rsvp.id}`, adminCookie).expect(204);
    await adminGet(fixture.client.id, fixture.event.id, 'design/readiness', adminCookie)
      .expect(200)
      .expect(({ body }) => expect(body.blockers).toContain('FLYER_RSVP_HOTSPOT_MISSING'));

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { eventId: fixture.event.id, action: 'INVITATION_DESIGN_FLYER_CREATE' }
    });
    expect(audit).toMatchObject({
      actorId: fixture.admin.id,
      clientId: fixture.client.id,
      eventId: fixture.event.id,
      resourceType: 'INVITATION_DESIGN',
      operationId: expect.any(String)
    });
    expect(audit.actorId).not.toBe(fixture.planner.id);

    await plannerGet(`/events/${fixture.event.id}/design`, plannerCookie).expect(200);
  });

  it('keeps staged-asset isolation atomic for Flyer create and replace', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const foreign = await createFixture(ServiceCode.FLYER);
    const adminCookie = await login(fixture.admin.email);
    const initial = await readyAsset(
      fixture.event,
      fixture.admin.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_INITIAL_IMAGE
    );
    const foreignQr = await readyAsset(
      foreign.event,
      foreign.admin.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_QR_IMAGE
    );

    await adminPost(fixture.client.id, fixture.event.id, 'design/flyer', adminCookie)
      .send({ initialAssetId: initial.id, qrAssetId: foreignQr.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_OWNER_MISMATCH'));
    expect(await prisma.invitationDesign.count({ where: { eventId: fixture.event.id, deletedAt: null } })).toBe(0);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: initial.id } })).ownerId).toBeNull();

    const qr = await readyAsset(
      fixture.event,
      fixture.admin.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_QR_IMAGE
    );
    const created = await adminPost(fixture.client.id, fixture.event.id, 'design/flyer', adminCookie)
      .send({ initialAssetId: initial.id, qrAssetId: qr.id })
      .expect(201);
    const foreignReplacement = await readyAsset(
      foreign.event,
      foreign.admin.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_INITIAL_IMAGE
    );

    await adminPatch(fixture.client.id, fixture.event.id, 'design/flyer/initial-image', adminCookie)
      .send({ assetId: foreignReplacement.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_OWNER_MISMATCH'));
    expect(
      (await prisma.invitationDesign.findUniqueOrThrow({ where: { id: created.body.id } })).flyerInitialAssetId
    ).toBe(initial.id);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: initial.id } })).status).toBe(
      FileAssetStatus.READY
    );
  });

  it('manages Flipbook pages through the existing shared domain', async () => {
    const fixture = await createFixture(ServiceCode.FLIPBOOK);
    const adminCookie = await login(fixture.admin.email);
    await adminPost(fixture.client.id, fixture.event.id, 'design/flipbook', adminCookie).expect(201);

    const assets = await Promise.all(
      Array.from({ length: 4 }, () =>
        readyAsset(fixture.event, fixture.admin.id, FileAssetOwnerType.FLIPBOOK_PAGE, FileAssetType.FLIPBOOK_PAGE_IMAGE)
      )
    );
    let pages: Array<{ id: string; fileAssetId: string; position: number }> = [];
    for (const asset of assets.slice(0, 3)) {
      const response = await adminPost(fixture.client.id, fixture.event.id, 'design/flipbook/pages', adminCookie)
        .send({ fileAssetId: asset.id })
        .expect(201);
      pages = response.body.pages;
    }
    expect(pages.map(({ position }) => position)).toEqual([1, 2, 3]);

    const reversed = [...pages].reverse().map(({ id }) => id);
    const reordered = await adminPatch(
      fixture.client.id,
      fixture.event.id,
      'design/flipbook/pages/reorder',
      adminCookie
    )
      .send({ pageIds: reversed })
      .expect(200);
    expect(reordered.body.pages.map(({ id }: { id: string }) => id)).toEqual(reversed);

    const first = reordered.body.pages[0];
    await adminPatch(fixture.client.id, fixture.event.id, `design/flipbook/pages/${first.id}/asset`, adminCookie)
      .send({ assetId: assets[3]!.id })
      .expect(200);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: first.fileAssetId } })).status).toBe(
      FileAssetStatus.HIDDEN
    );
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: assets[3]!.id } })).ownerId).toBe(first.id);

    const deleted = await adminDelete(
      fixture.client.id,
      fixture.event.id,
      `design/flipbook/pages/${reordered.body.pages[1].id}`,
      adminCookie
    ).expect(200);
    expect(deleted.body.pages.map(({ position }: { position: number }) => position)).toEqual([1, 2]);
  });

  it('preserves state/service guards and exposes only the authorized Admin OpenAPI paths', async () => {
    const active = await createFixture(ServiceCode.FLIPBOOK);
    const adminCookie = await login(active.admin.email);
    await setEventStatus(active.event.id, EventStatus.CANCELLED);
    await adminPost(active.client.id, active.event.id, 'design/flipbook', adminCookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INVITATION_DESIGN_EVENT_STATE_LOCKED'));

    const physical = await createFixture(ServiceCode.PHYSICAL_QR);
    await adminPost(physical.client.id, physical.event.id, 'design/flipbook', await login(physical.admin.email))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_DESIGN_KICKOFF_NOT_APPLICABLE'));

    const paths = createOpenApiDocument(app).paths;
    for (const route of [
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/readiness',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer/initial-image',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer/qr-image',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages/reorder',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages/{pageId}/asset',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/hotspots',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/hotspots/{hotspotId}',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets/{fileAssetId}',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets/{fileAssetId}/content'
    ]) {
      expect(paths[route]).toBeDefined();
    }
    for (const route of [
      '/api/v1/admin/clients/{clientId}/events/{eventId}/file-assets',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/contacts',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/invitations',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/seating',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/scanner'
    ]) {
      expect(paths[route]).toBeUndefined();
    }
    for (const route of [
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/hotspots',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets'
    ]) {
      expect(paths[route]?.post?.responses?.[201]).toBeDefined();
    }
  });

  async function createFixture(serviceCode: ServiceCode) {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: `Client ${randomUUID()}` } });
    const planner = await createUser(client.id, UserRole.INDEPENDENT_PLANNER);
    const admin = await createUser(null, UserRole.PLATFORM_ADMIN);
    const service =
      (await prisma.service.findUnique({ where: { code: serviceCode } })) ??
      (await prisma.service.create({ data: { code: serviceCode } }));
    const price =
      (await prisma.servicePrice.findFirst({
        where: {
          serviceId: service.id,
          pricingVersion: 2,
          commercialChannel: CommercialChannel.STANDARD,
          capacityMin: 1,
          capacityMax: 150
        }
      })) ??
      (await prisma.servicePrice.create({
        data: {
          serviceId: service.id,
          pricingVersion: 2,
          commercialChannel: CommercialChannel.STANDARD,
          capacityMin: 1,
          capacityMax: 150,
          credits: 10,
          validFrom: new Date('2029-01-01T00:00:00.000Z')
        }
      }));
    const commercialAt = new Date('2029-06-01T00:00:00.000Z');
    const event = await prisma.event.create({
      data: {
        clientId: client.id,
        createdByUserId: planner.id,
        assignedPlannerUserId: planner.id,
        serviceId: service.id,
        name: 'OP-02C Event',
        socialType: 'WEDDING',
        status: EventStatus.CONFIGURED,
        eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
        timeZone: 'America/Mexico_City',
        capacity: 100,
        confirmationEnabled: true,
        commercialAuthorizedAt: commercialAt,
        commercialAuthorizedByUserId: admin.id,
        commercialPriceLockedAt: commercialAt,
        commercialServicePriceId: price.id,
        commercialBaseCostCredits: price.credits,
        commercialPromotionDiscountCredits: 0,
        commercialFinalCostCredits: price.credits,
        commercialChannelSnapshot: CommercialChannel.STANDARD,
        commercialCapacitySnapshot: 100,
        commercialCapacityMinSnapshot: price.capacityMin,
        commercialCapacityMaxSnapshot: price.capacityMax,
        commercialVenueTierSnapshot: null,
        ...(serviceCode === ServiceCode.FLYER || serviceCode === ServiceCode.FLIPBOOK
          ? { designKickoffAt: commercialAt, designKickoffByUserId: admin.id }
          : {})
      }
    });
    return { client, planner, admin, event };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { id: user.id, email };
  }

  function adminGet(clientId: string, eventId: string, suffix: string, cookie: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${clientId}/events/${eventId}/${suffix}`)
      .set('Cookie', cookie);
  }

  function adminPost(clientId: string, eventId: string, suffix: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events/${eventId}/${suffix}`)
      .set('Cookie', cookie)
      .set('Origin', trustedOrigin);
  }

  function adminPatch(clientId: string, eventId: string, suffix: string, cookie: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}/events/${eventId}/${suffix}`)
      .set('Cookie', cookie)
      .set('Origin', trustedOrigin);
  }

  function adminDelete(clientId: string, eventId: string, suffix: string, cookie: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/admin/clients/${clientId}/events/${eventId}/${suffix}`)
      .set('Cookie', cookie)
      .set('Origin', trustedOrigin);
  }

  function plannerGet(route: string, cookie: string) {
    return request(app.getHttpServer()).get(`/api/v1${route}`).set('Cookie', cookie);
  }

  async function readyAsset(
    event: { id: string; clientId: string },
    userId: string,
    ownerType: FileAssetOwnerType,
    fileType: FileAssetType
  ) {
    return prisma.fileAsset.create({
      data: {
        clientId: event.clientId,
        eventId: event.id,
        ownerType,
        fileType,
        storageProvider: StorageProvider.LOCAL,
        storageKey: randomBytes(32).toString('hex'),
        originalName: 'design.png',
        mimeType: 'image/png',
        sizeBytes: 64,
        checksumSha256: randomBytes(32).toString('hex'),
        width: 100,
        height: 100,
        createdByUserId: userId,
        status: FileAssetStatus.READY
      }
    });
  }

  async function ownerIds(ids: string[]): Promise<Array<string | null>> {
    const assets = await prisma.fileAsset.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'asc' },
      select: { ownerId: true }
    });
    return assets.map(({ ownerId }) => ownerId);
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

  async function setEventStatus(eventId: string, status: EventStatus): Promise<void> {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      UPDATE "event" SET "status" = '${status.toLowerCase()}'::"event_status" WHERE "id" = '${eventId}'::uuid;
      COMMIT;
    `);
  }

  async function resetDatabase(): Promise<void> {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "hotspot",
        "flipbook_page",
        "invitation_design",
        "file_asset",
        "assistant",
        "invitation",
        "contact_import_preview",
        "contact",
        "contact_group",
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

function flyerHotspot(action: HotspotAction) {
  return {
    visualOwnerType: HotspotVisualOwnerType.FLYER,
    action,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    priority: 1
  };
}
