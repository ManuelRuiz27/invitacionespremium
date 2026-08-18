import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientType,
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
const isolatedStorage = (() => {
  const systemTemp =
    process.env.RUNNER_TEMP ??
    process.env.TMPDIR ??
    process.env.TEMP ??
    process.env.TMP ??
    (process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp');
  const separator = /[\\/]$/u.test(systemTemp) ? '' : process.platform === 'win32' ? '\\' : '/';
  const root = `${systemTemp}${separator}op02c-vitest-${process.pid}-${Math.random().toString(16).slice(2)}`;
  process.env.FILE_STORAGE_LOCAL_ROOT = root;
  process.env.FILE_UPLOAD_MAX_BYTES = '10485760';
  process.env.FILE_IMAGE_MAX_PIXELS = '40000000';
  process.env.FILE_ORPHAN_RETENTION_SECONDS = '60';
  return { root, systemTemp };
})();

describe('OP-02C provider Invitation capability', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let png: Buffer;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    await rm(isolatedStorage.root, { recursive: true, force: true });
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
    png = await sharp({
      create: {
        width: 4,
        height: 3,
        channels: 4,
        background: { r: 30, g: 90, b: 150, alpha: 1 }
      }
    })
      .png()
      .toBuffer();
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    const resolved = path.resolve(isolatedStorage.root);
    const resolvedTemp = path.resolve(isolatedStorage.systemTemp);
    const relative = path.relative(resolvedTemp, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Refusing to remove a non-temporary OP-02C test directory.');
    }
    await rm(resolved, { recursive: true, force: true });
  }, 60_000);

  it('prepares a Flyer as the real Platform Admin with strict assets, Hotspots, readiness and audit', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const adminCookie = await login(fixture.admin.email);
    const plannerCookie = await login(fixture.planner.email);

    await read(`/events/${fixture.event.id}/design`, adminCookie).expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.event.id}/file-assets`)
      .set('Cookie', adminCookie)
      .expect(403);

    const wrongClient = await prisma.client.create({
      data: { type: ClientType.PLANNER, name: `Wrong ${randomUUID()}` }
    });
    for (const clientId of [wrongClient.id, randomUUID()]) {
      await adminRead(clientId, fixture.event.id, 'design/readiness', adminCookie)
        .expect(404)
        .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));
    }
    await adminRead(fixture.client.id, randomUUID(), 'design/readiness', adminCookie)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));

    const initial = await adminUpload(
      fixture.client.id,
      fixture.event.id,
      adminCookie,
      FileAssetType.FLYER_INITIAL_IMAGE,
      FileAssetOwnerType.FLOORPLAN
    ).expect(201);
    const qr = await adminUpload(
      fixture.client.id,
      fixture.event.id,
      adminCookie,
      FileAssetType.FLYER_QR_IMAGE,
      FileAssetOwnerType.ALBUM_PHOTO
    ).expect(201);
    expect(initial.body).toMatchObject({
      eventId: fixture.event.id,
      ownerType: FileAssetOwnerType.FLYER,
      ownerId: null,
      fileType: FileAssetType.FLYER_INITIAL_IMAGE,
      status: FileAssetStatus.READY
    });
    expect(qr.body).toMatchObject({
      ownerType: FileAssetOwnerType.FLYER,
      fileType: FileAssetType.FLYER_QR_IMAGE
    });

    for (const forbidden of [
      FileAssetType.FLOORPLAN_IMAGE,
      FileAssetType.ALBUM_PHOTO_IMAGE,
      FileAssetType.INVITATION_QR_SVG,
      FileAssetType.PHYSICAL_PASS_QR_SVG,
      FileAssetType.GENERATED_REPORT_PDF
    ]) {
      await adminUpload(fixture.client.id, fixture.event.id, adminCookie, forbidden).expect(400);
    }

    const unassociated = await adminUpload(
      fixture.client.id,
      fixture.event.id,
      adminCookie,
      FileAssetType.FLIPBOOK_PAGE_IMAGE
    ).expect(201);
    await adminMutate(
      'delete',
      fixture.client.id,
      fixture.event.id,
      `design/file-assets/${unassociated.body.id}`,
      adminCookie
    ).expect(204);

    const created = await adminMutate('post', fixture.client.id, fixture.event.id, 'design/flyer', adminCookie)
      .send({ initialAssetId: initial.body.id, qrAssetId: qr.body.id })
      .expect(201);
    expect(created.body).toMatchObject({
      eventId: fixture.event.id,
      type: 'FLYER',
      flyerInitialAssetId: initial.body.id,
      flyerQrAssetId: qr.body.id
    });
    expect(await ownerIds([initial.body.id, qr.body.id])).toEqual([created.body.id, created.body.id]);

    await adminMutate(
      'delete',
      fixture.client.id,
      fixture.event.id,
      `design/file-assets/${initial.body.id}`,
      adminCookie
    )
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_ASSET_ASSOCIATED'));

    const nextInitial = await adminUpload(
      fixture.client.id,
      fixture.event.id,
      adminCookie,
      FileAssetType.FLYER_INITIAL_IMAGE
    ).expect(201);
    await adminMutate(
      'patch',
      fixture.client.id,
      fixture.event.id,
      'design/flyer/initial-image',
      adminCookie
    )
      .send({ assetId: nextInitial.body.id })
      .expect(200);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: initial.body.id } })).status).toBe(
      FileAssetStatus.HIDDEN
    );
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: nextInitial.body.id } })).ownerId).toBe(
      created.body.id
    );

    const blockers = (
      await adminRead(fixture.client.id, fixture.event.id, 'design/readiness', adminCookie).expect(200)
    ).body.blockers;
    expect(blockers).toEqual([
      'FLYER_RSVP_HOTSPOT_MISSING',
      'FLYER_LOCATION_HOTSPOT_MISSING',
      'FLYER_GIFT_REGISTRY_HOTSPOT_MISSING',
      'FLYER_QR_AREA_HOTSPOT_MISSING'
    ]);

    const hotspots: Array<{ id: string; action: HotspotAction }> = [];
    for (const action of [
      HotspotAction.RSVP,
      HotspotAction.LOCATION,
      HotspotAction.GIFT_REGISTRY,
      HotspotAction.QR_AREA
    ]) {
      hotspots.push(
        (
          await adminMutate('post', fixture.client.id, fixture.event.id, 'hotspots', adminCookie)
            .send(flyerHotspot(action))
            .expect(201)
        ).body
      );
    }
    await adminRead(fixture.client.id, fixture.event.id, 'design/readiness', adminCookie)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ complete: true, blockers: [] }));

    const rsvp = hotspots.find(({ action }) => action === HotspotAction.RSVP)!;
    await adminMutate('patch', fixture.client.id, fixture.event.id, `hotspots/${rsvp.id}`, adminCookie)
      .send({ priority: 9, x: 0.2 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ priority: 9, x: 0.2 }));
    await adminMutate('delete', fixture.client.id, fixture.event.id, `hotspots/${rsvp.id}`, adminCookie).expect(204);
    await adminRead(fixture.client.id, fixture.event.id, 'design/readiness', adminCookie)
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

    await read(`/events/${fixture.event.id}/design`, plannerCookie).expect(200);
  });

  it('preserves atomic target and staged-asset isolation for Admin Flyer mutations', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const foreign = await createFixture(ServiceCode.FLYER);
    const adminCookie = await login(fixture.admin.email);

    const initial = await adminUpload(
      fixture.client.id,
      fixture.event.id,
      adminCookie,
      FileAssetType.FLYER_INITIAL_IMAGE
    ).expect(201);
    const foreignQr = await readyAsset(
      foreign.event,
      foreign.planner.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_QR_IMAGE
    );
    await adminMutate('post', fixture.client.id, fixture.event.id, 'design/flyer', adminCookie)
      .send({ initialAssetId: initial.body.id, qrAssetId: foreignQr.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_OWNER_MISMATCH'));
    expect(await prisma.invitationDesign.count({ where: { eventId: fixture.event.id, deletedAt: null } })).toBe(0);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: initial.body.id } })).ownerId).toBeNull();

    const qr = await adminUpload(
      fixture.client.id,
      fixture.event.id,
      adminCookie,
      FileAssetType.FLYER_QR_IMAGE
    ).expect(201);
    const created = await adminMutate('post', fixture.client.id, fixture.event.id, 'design/flyer', adminCookie)
      .send({ initialAssetId: initial.body.id, qrAssetId: qr.body.id })
      .expect(201);
    const foreignReplacement = await readyAsset(
      foreign.event,
      foreign.planner.id,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_INITIAL_IMAGE
    );
    await adminMutate(
      'patch',
      fixture.client.id,
      fixture.event.id,
      'design/flyer/initial-image',
      adminCookie
    )
      .send({ assetId: foreignReplacement.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_OWNER_MISMATCH'));
    const after = await prisma.invitationDesign.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(after.flyerInitialAssetId).toBe(initial.body.id);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: initial.body.id } })).status).toBe(
      FileAssetStatus.READY
    );
  });

  it('manages Flipbook pages and Hotspots through the same domain invariants', async () => {
    const fixture = await createFixture(ServiceCode.FLIPBOOK);
    const adminCookie = await login(fixture.admin.email);
    await adminMutate('post', fixture.client.id, fixture.event.id, 'design/flipbook', adminCookie).expect(201);

    const assets = [];
    for (let index = 0; index < 4; index += 1) {
      assets.push(
        (
          await adminUpload(
            fixture.client.id,
            fixture.event.id,
            adminCookie,
            FileAssetType.FLIPBOOK_PAGE_IMAGE
          ).expect(201)
        ).body
      );
    }
    let design: { pages: Array<{ id: string; fileAssetId: string; position: number }> } = { pages: [] };
    for (const asset of assets.slice(0, 3)) {
      design = (
        await adminMutate('post', fixture.client.id, fixture.event.id, 'design/flipbook/pages', adminCookie)
          .send({ fileAssetId: asset.id })
          .expect(201)
      ).body;
    }
    expect(design.pages.map(({ position }) => position)).toEqual([1, 2, 3]);
    const reversed = [...design.pages].reverse().map(({ id }) => id);
    design = (
      await adminMutate(
        'patch',
        fixture.client.id,
        fixture.event.id,
        'design/flipbook/pages/reorder',
        adminCookie
      )
        .send({ pageIds: reversed })
        .expect(200)
    ).body;
    expect(design.pages.map(({ id }) => id)).toEqual(reversed);

    const first = design.pages[0]!;
    await adminMutate(
      'patch',
      fixture.client.id,
      fixture.event.id,
      `design/flipbook/pages/${first.id}/asset`,
      adminCookie
    )
      .send({ assetId: assets[3]!.id })
      .expect(200);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: first.fileAssetId } })).status).toBe(
      FileAssetStatus.HIDDEN
    );
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: assets[3]!.id } })).ownerId).toBe(first.id);

    design = (
      await adminMutate(
        'delete',
        fixture.client.id,
        fixture.event.id,
        `design/flipbook/pages/${design.pages[1]!.id}`,
        adminCookie
      ).expect(200)
    ).body;
    expect(design.pages.map(({ position }) => position)).toEqual([1, 2]);

    const cover = design.pages[0]!;
    const qrPage = design.pages[1]!;
    const coverHotspot = (
      await adminMutate('post', fixture.client.id, fixture.event.id, 'hotspots', adminCookie)
        .send(pageHotspot(cover.id, HotspotAction.RSVP))
        .expect(201)
    ).body as { id: string };
    await adminMutate('post', fixture.client.id, fixture.event.id, 'hotspots', adminCookie)
      .send(pageHotspot(qrPage.id, HotspotAction.QR_AREA))
      .expect(201);
    await adminMutate('post', fixture.client.id, fixture.event.id, 'hotspots', adminCookie)
      .send(pageHotspot(qrPage.id, HotspotAction.LOCATION))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('HOTSPOT_VISUAL_OWNER_NOT_OPERATIONAL'));
    await adminMutate('patch', fixture.client.id, fixture.event.id, `hotspots/${coverHotspot.id}`, adminCookie)
      .send({ priority: 3 })
      .expect(200);
    await adminMutate('delete', fixture.client.id, fixture.event.id, `hotspots/${coverHotspot.id}`, adminCookie).expect(
      204
    );
  });

  it('preserves Event-state/service guards and exposes only the authorized Admin OpenAPI surface', async () => {
    const active = await createFixture(ServiceCode.FLIPBOOK);
    const adminCookie = await login(active.admin.email);
    await setEventStatus(active.event.id, EventStatus.ACTIVE);
    await adminMutate('post', active.client.id, active.event.id, 'design/flipbook', adminCookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INVITATION_DESIGN_EVENT_STATE_LOCKED'));

    const physical = await createFixture(ServiceCode.PHYSICAL_QR);
    await adminMutate('post', physical.client.id, physical.event.id, 'design/flipbook', await login(physical.admin.email))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INVITATION_DESIGN_SERVICE_MISMATCH'));

    const paths = createOpenApiDocument(app).paths;
    const required = [
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
    ];
    for (const route of required) expect(paths[route]).toBeDefined();
    const postPaths = [
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flyer',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/flipbook/pages',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/hotspots',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/design/file-assets'
    ];
    for (const route of postPaths) {
      const responses = paths[route]?.post?.responses;
      expect(responses?.[201]).toBeDefined();
    }
    for (const forbidden of [
      '/api/v1/admin/clients/{clientId}/events/{eventId}/file-assets',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/contacts',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/invitations',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/seating',
      '/api/v1/admin/clients/{clientId}/events/{eventId}/scanner'
    ]) {
      expect(paths[forbidden]).toBeUndefined();
    }
  });

  async function createFixture(serviceCode: ServiceCode) {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: `Client ${randomUUID()}` } });
    const planner = await createUser(client.id, UserRole.INDEPENDENT_PLANNER);
    const admin = await createUser(null, UserRole.PLATFORM_ADMIN);
    const service =
      (await prisma.service.findUnique({ where: { code: serviceCode } })) ??
      (await prisma.service.create({ data: { code: serviceCode } }));
    const event = await prisma.event.create({
      data: {
        clientId: client.id,
        createdByUserId: planner.id,
        serviceId: service.id,
        name: 'OP-02C Event',
        socialType: 'WEDDING',
        status: EventStatus.CONFIGURED,
        eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
        timeZone: 'America/Mexico_City',
        capacity: 100,
        confirmationEnabled: true
      }
    });
    return { client, planner, admin, event };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { id: user.id, email, clientId };
  }

  async function adminUpload(
    clientId: string,
    eventId: string,
    cookie: string,
    fileType: FileAssetType,
    maliciousOwnerType?: FileAssetOwnerType
  ) {
    let call = request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events/${eventId}/design/file-assets`)
      .set('Cookie', cookie)
      .set('Origin', trustedOrigin)
      .field('fileType', fileType);
    if (maliciousOwnerType) call = call.field('ownerType', maliciousOwnerType);
    return call.attach('file', png, { filename: 'invitation.png', contentType: 'image/png' });
  }

  function adminMutate(
    method: 'post' | 'patch' | 'delete',
    clientId: string,
    eventId: string,
    suffix: string,
    cookie: string
  ) {
    return request(app.getHttpServer())
      [method](`/api/v1/admin/clients/${clientId}/events/${eventId}/${suffix}`)
      .set('Cookie', cookie)
      .set('Origin', trustedOrigin);
  }

  function adminRead(clientId: string, eventId: string, suffix: string, cookie: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${clientId}/events/${eventId}/${suffix}`)
      .set('Cookie', cookie);
  }

  function read(route: string, cookie: string) {
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

function pageHotspot(pageId: string, action: HotspotAction) {
  return {
    visualOwnerType: HotspotVisualOwnerType.FLIPBOOK_PAGE,
    flipbookPageId: pageId,
    action,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    priority: 1
  };
}
