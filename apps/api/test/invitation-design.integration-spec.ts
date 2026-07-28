import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
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
  UserRole
} from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('InvitationDesignModule', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;

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
    audit = app.get(AuditService);
  });

  beforeEach(resetDatabase, 60_000);
  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('creates a complete Flyer, audits readiness and replaces each asset without exposing storage data', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLYER);
    const cookie = await login(owner.email);
    const initial = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_INITIAL_IMAGE);
    const qr = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_QR_IMAGE);

    const created = await mutate('post', `/events/${event.id}/design/flyer`, cookie)
      .send({ initialAssetId: initial.id, qrAssetId: qr.id })
      .expect(201);
    expect(created.body).toMatchObject({
      eventId: event.id,
      type: 'FLYER',
      flyerInitialAssetId: initial.id,
      flyerQrAssetId: qr.id,
      pages: [],
      hotspots: []
    });
    expect(JSON.stringify(created.body)).not.toMatch(/storage|checksum|token|phone/iu);
    expect(await ownerIds([initial.id, qr.id])).toEqual([created.body.id, created.body.id]);

    await read(`/events/${event.id}/design/readiness`, cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.complete).toBe(false);
        expect(body.blockers).toEqual(['INVITATION_DESIGN_HOTSPOT_MISSING']);
      });
    await mutate('post', `/events/${event.id}/hotspots`, cookie).send(flyerHotspot(HotspotAction.RSVP)).expect(201);
    await read(`/events/${event.id}/design/readiness`, cookie)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ complete: true, blockers: [] }));

    const nextInitial = await readyAsset(
      event,
      owner.userId,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_INITIAL_IMAGE
    );
    const nextQr = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_QR_IMAGE);
    await mutate('patch', `/events/${event.id}/design/flyer/initial-image`, cookie)
      .send({ assetId: nextInitial.id })
      .expect(200);
    await mutate('patch', `/events/${event.id}/design/flyer/qr-image`, cookie).send({ assetId: nextQr.id }).expect(200);
    expect(
      await prisma.fileAsset.findMany({
        where: { id: { in: [initial.id, qr.id, nextInitial.id, nextQr.id] } },
        orderBy: { createdAt: 'asc' },
        select: { status: true }
      })
    ).toEqual([
      { status: FileAssetStatus.HIDDEN },
      { status: FileAssetStatus.HIDDEN },
      { status: FileAssetStatus.READY },
      { status: FileAssetStatus.READY }
    ]);
    const auditText = JSON.stringify(await prisma.auditLog.findMany({ where: { eventId: event.id } }));
    expect(auditText).toContain('INVITATION_DESIGN_READINESS_CHANGED');
    expect(auditText).not.toContain(initial.storageKey);
    expect(auditText).not.toContain(initial.checksumSha256);
  });

  it('rolls back Flyer creation for foreign or already claimed assets', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const foreign = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLYER);
    const foreignEvent = await createEvent(foreign, ServiceCode.FLYER);
    const cookie = await login(owner.email);
    const initial = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_INITIAL_IMAGE);
    const foreignQr = await readyAsset(
      foreignEvent,
      foreign.userId,
      FileAssetOwnerType.FLYER,
      FileAssetType.FLYER_QR_IMAGE
    );
    await mutate('post', `/events/${event.id}/design/flyer`, cookie)
      .send({ initialAssetId: initial.id, qrAssetId: foreignQr.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_OWNER_MISMATCH'));
    expect(await prisma.invitationDesign.count()).toBe(0);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: initial.id } })).ownerId).toBeNull();
  });

  it('creates, replaces, reorders and deletes Flipbook pages with continuous compact positions', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLIPBOOK);
    const cookie = await login(owner.email);
    await mutate('post', `/events/${event.id}/design/flipbook`, cookie).expect(201);

    const assets = await Promise.all(
      Array.from({ length: 4 }, () =>
        readyAsset(event, owner.userId, FileAssetOwnerType.FLIPBOOK_PAGE, FileAssetType.FLIPBOOK_PAGE_IMAGE)
      )
    );
    for (const asset of assets.slice(0, 3)) {
      await mutate('post', `/events/${event.id}/design/flipbook/pages`, cookie)
        .send({ fileAssetId: asset.id })
        .expect(201);
    }
    await mutate('post', `/events/${event.id}/design/flipbook/pages`, cookie)
      .send({ fileAssetId: assets[0]!.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_OWNER_MISMATCH'));
    let design = (await read(`/events/${event.id}/design`, cookie).expect(200)).body;
    const reversed = [...design.pages].reverse().map((page: { id: string }) => page.id);
    design = (
      await mutate('patch', `/events/${event.id}/design/flipbook/pages/reorder`, cookie)
        .send({ pageIds: reversed })
        .expect(200)
    ).body;
    expect(design.pages.map((page: { position: number }) => page.position)).toEqual([1, 2, 3]);
    expect(design.pages.map((page: { id: string }) => page.id)).toEqual(reversed);
    const original = [...reversed].reverse();
    const concurrent = await Promise.all([
      mutate('patch', `/events/${event.id}/design/flipbook/pages/reorder`, cookie).send({ pageIds: original }),
      mutate('patch', `/events/${event.id}/design/flipbook/pages/reorder`, cookie).send({ pageIds: reversed })
    ]);
    expect(concurrent.map(({ status }) => status)).toEqual([200, 200]);
    const afterConcurrent = (await read(`/events/${event.id}/design`, cookie).expect(200)).body.pages;
    expect(afterConcurrent.map((page: { position: number }) => page.position)).toEqual([1, 2, 3]);
    expect([original, reversed]).toContainEqual(afterConcurrent.map((page: { id: string }) => page.id));

    design = { ...design, pages: afterConcurrent };
    const first = design.pages[0];
    await mutate('patch', `/events/${event.id}/design/flipbook/pages/${first.id}/asset`, cookie)
      .send({ assetId: assets[3]!.id })
      .expect(200);
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: first.fileAssetId } })).status).toBe(
      FileAssetStatus.HIDDEN
    );

    design = (
      await mutate('delete', `/events/${event.id}/design/flipbook/pages/${design.pages[1].id}`, cookie).expect(200)
    ).body;
    expect(design.pages.map((page: { position: number }) => page.position)).toEqual([1, 2]);
    expect(await prisma.flipbookPage.count({ where: { deletedAt: null } })).toBe(2);
    expect((await read(`/events/${event.id}/design`, cookie).expect(200)).body.pages).toHaveLength(2);
  });

  it('enforces exactly ten Flipbook pages and rejects page eleven under deterministic concurrency', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLIPBOOK);
    const cookie = await login(owner.email);
    await mutate('post', `/events/${event.id}/design/flipbook`, cookie).expect(201);
    const assets = await Promise.all(
      Array.from({ length: 11 }, () =>
        readyAsset(event, owner.userId, FileAssetOwnerType.FLIPBOOK_PAGE, FileAssetType.FLIPBOOK_PAGE_IMAGE)
      )
    );
    for (const asset of assets.slice(0, 9)) {
      await mutate('post', `/events/${event.id}/design/flipbook/pages`, cookie)
        .send({ fileAssetId: asset.id })
        .expect(201);
    }
    const results = await Promise.all([
      mutate('post', `/events/${event.id}/design/flipbook/pages`, cookie).send({ fileAssetId: assets[9]!.id }),
      mutate('post', `/events/${event.id}/design/flipbook/pages`, cookie).send({ fileAssetId: assets[10]!.id })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await prisma.flipbookPage.count({ where: { deletedAt: null } })).toBe(10);
    const positions = await prisma.flipbookPage.findMany({
      where: { deletedAt: null },
      orderBy: { position: 'asc' },
      select: { position: true }
    });
    expect(positions.map(({ position }) => position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  }, 60_000);

  it('supports every Hotspot action, validates URLs and enforces three external links', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLYER);
    const cookie = await login(owner.email);
    const initial = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_INITIAL_IMAGE);
    const qr = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_QR_IMAGE);
    await mutate('post', `/events/${event.id}/design/flyer`, cookie)
      .send({ initialAssetId: initial.id, qrAssetId: qr.id })
      .expect(201);

    const builtInHotspots: Array<{ id: string }> = [];
    for (const action of [
      HotspotAction.RSVP,
      HotspotAction.LOCATION,
      HotspotAction.GIFT_REGISTRY,
      HotspotAction.QR_AREA
    ]) {
      builtInHotspots.push(
        (await mutate('post', `/events/${event.id}/hotspots`, cookie).send(flyerHotspot(action)).expect(201)).body
      );
    }
    for (let index = 0; index < 3; index += 1) {
      await mutate('post', `/events/${event.id}/hotspots`, cookie)
        .send(flyerHotspot(HotspotAction.EXTERNAL_LINK, `https://example.com/link-${index}`))
        .expect(201);
    }
    await mutate('post', `/events/${event.id}/hotspots`, cookie)
      .send(flyerHotspot(HotspotAction.EXTERNAL_LINK, 'https://example.com/four'))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('HOTSPOT_EXTERNAL_LINK_LIMIT_EXCEEDED'));
    await mutate('post', `/events/${event.id}/hotspots`, cookie)
      .send(flyerHotspot(HotspotAction.EXTERNAL_LINK, 'javascript:alert(1)'))
      .expect(400);
    await mutate('post', `/events/${event.id}/hotspots`, cookie)
      .send({ ...flyerHotspot(HotspotAction.LOCATION), x: 0.9, width: 0.2 })
      .expect(400);

    const rsvp = builtInHotspots[0] as { id: string };
    await mutate('patch', `/events/${event.id}/hotspots/${rsvp.id}`, cookie)
      .send({ priority: 7, x: 0.1, y: 0.1 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ priority: 7, x: 0.1, y: 0.1 }));
    const [concurrentUpdate, concurrentDelete] = await Promise.all([
      mutate('patch', `/events/${event.id}/hotspots/${rsvp.id}`, cookie).send({ priority: 8 }),
      mutate('delete', `/events/${event.id}/hotspots/${rsvp.id}`, cookie)
    ]);
    expect(concurrentDelete.status).toBe(204);
    expect([200, 404]).toContain(concurrentUpdate.status);
    expect((await read(`/events/${event.id}/hotspots`, cookie).expect(200)).body).toHaveLength(6);
    expect(await prisma.hotspot.count({ where: { id: rsvp.id, deletedAt: null } })).toBe(0);
  });

  it('enforces ownership for all operational roles and freezes every mutation after activation', async () => {
    const organization = await createOwner(UserRole.ORGANIZATION_PLANNER, ClientType.ORGANIZATION);
    const admin = await createUser(organization.clientId, UserRole.ORGANIZATION_ADMIN);
    const otherPlanner = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const event = await createEvent(organization, ServiceCode.FLIPBOOK);
    const plannerCookie = await login(organization.email);
    const adminCookie = await login(admin.email);
    const otherCookie = await login(otherPlanner.email);
    await mutate('post', `/events/${event.id}/design/flipbook`, plannerCookie).expect(201);
    await read(`/events/${event.id}/design`, adminCookie).expect(200);
    await read(`/events/${event.id}/design`, otherCookie)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));

    await setEventStatus(event.id, EventStatus.ACTIVE);
    const asset = await readyAsset(
      event,
      organization.userId,
      FileAssetOwnerType.FLIPBOOK_PAGE,
      FileAssetType.FLIPBOOK_PAGE_IMAGE
    );
    await mutate('post', `/events/${event.id}/design/flipbook/pages`, plannerCookie)
      .send({ fileAssetId: asset.id })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INVITATION_DESIGN_EVENT_STATE_LOCKED'));
    await read(`/events/${event.id}/design`, plannerCookie).expect(200);

    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    await read(`/events/${event.id}/design`, await login(platform.email)).expect(403);
  });

  it('blocks activation before finance when design is incomplete and exposes all routes in OpenAPI', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLIPBOOK);
    const cookie = await login(owner.email);
    await mutate('post', `/events/${event.id}/design/flipbook`, cookie).expect(201);
    await setEventStatus(event.id, EventStatus.READY_TO_ACTIVATE);
    await mutate('post', `/events/${event.id}/activate`, cookie)
      .set('Idempotency-Key', randomUUID())
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_INVITATION_DESIGN_INCOMPLETE'));
    expect(await prisma.ledgerEntry.count()).toBe(0);
    expect(await prisma.receipt.count()).toBe(0);

    const paths = createOpenApiDocument(app).paths;
    for (const path of [
      '/api/v1/events/{eventId}/design',
      '/api/v1/events/{eventId}/design/readiness',
      '/api/v1/events/{eventId}/design/flyer',
      '/api/v1/events/{eventId}/design/flipbook',
      '/api/v1/events/{eventId}/design/flipbook/pages',
      '/api/v1/events/{eventId}/design/flipbook/pages/reorder',
      '/api/v1/events/{eventId}/hotspots',
      '/api/v1/events/{eventId}/hotspots/{hotspotId}'
    ]) {
      expect(paths[path]).toBeDefined();
    }
  });

  it('rolls back design, asset claims and persistence when transactional auditing fails', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLYER);
    const cookie = await login(owner.email);
    const initial = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_INITIAL_IMAGE);
    const qr = await readyAsset(event, owner.userId, FileAssetOwnerType.FLYER, FileAssetType.FLYER_QR_IMAGE);
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('forced audit failure'));
    await mutate('post', `/events/${event.id}/design/flyer`, cookie)
      .send({ initialAssetId: initial.id, qrAssetId: qr.id })
      .expect(500);
    expect(await prisma.invitationDesign.count()).toBe(0);
    expect(await ownerIds([initial.id, qr.id])).toEqual([null, null]);
    expect(await prisma.auditLog.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('rejects direct invalid coordinates, cross-design owners and TRUNCATE at PostgreSQL', async () => {
    const owner = await createOwner(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const event = await createEvent(owner, ServiceCode.FLIPBOOK);
    const cookie = await login(owner.email);
    const design = (await mutate('post', `/events/${event.id}/design/flipbook`, cookie).expect(201)).body;
    const asset = await readyAsset(
      event,
      owner.userId,
      FileAssetOwnerType.FLIPBOOK_PAGE,
      FileAssetType.FLIPBOOK_PAGE_IMAGE
    );
    const withPage = (
      await mutate('post', `/events/${event.id}/design/flipbook/pages`, cookie)
        .send({ fileAssetId: asset.id })
        .expect(201)
    ).body;

    await expect(
      prisma.$executeRaw`
        INSERT INTO "hotspot" (
          "design_id", "event_id", "visual_owner_type", "flipbook_page_id", "action",
          "x", "y", "width", "height", "updated_at"
        ) VALUES (
          ${design.id}::uuid, ${event.id}::uuid, 'FLIPBOOK_PAGE', ${withPage.pages[0].id}::uuid, 'RSVP',
          0.9, 0, 0.2, 0.2, NOW()
        )
      `
    ).rejects.toThrow();

    const otherEvent = await createEvent(owner, ServiceCode.FLIPBOOK);
    const otherDesign = (await mutate('post', `/events/${otherEvent.id}/design/flipbook`, cookie).expect(201)).body;
    await expect(
      prisma.$executeRaw`
        INSERT INTO "hotspot" (
          "design_id", "event_id", "visual_owner_type", "flipbook_page_id", "action",
          "x", "y", "width", "height", "updated_at"
        ) VALUES (
          ${otherDesign.id}::uuid, ${otherEvent.id}::uuid, 'FLIPBOOK_PAGE',
          ${withPage.pages[0].id}::uuid, 'RSVP', 0, 0, 0.2, 0.2, NOW()
        )
      `
    ).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "hotspot"')).rejects.toThrow(/cannot be truncated/u);
    expect(await prisma.hotspot.count()).toBe(0);
  });

  function mutate(method: 'post' | 'patch' | 'delete', route: string, cookie: string) {
    return request(app.getHttpServer())[method](`/api/v1${route}`).set('Cookie', cookie).set('Origin', trustedOrigin);
  }

  function read(route: string, cookie: string) {
    return request(app.getHttpServer()).get(`/api/v1${route}`).set('Cookie', cookie);
  }

  async function createOwner(role: UserRole, type: ClientType) {
    const client = await prisma.client.create({ data: { type, name: `Client ${randomUUID()}` } });
    const user = await createUser(client.id, role);
    return { clientId: client.id, userId: user.id, email: user.email };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { id: user.id, email, clientId };
  }

  async function createEvent(owner: { clientId: string; userId: string }, serviceCode: ServiceCode) {
    const service =
      (await prisma.service.findUnique({ where: { code: serviceCode } })) ??
      (await prisma.service.create({ data: { code: serviceCode } }));
    return prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        serviceId: service.id,
        name: 'Invitation Design Event',
        socialType: 'WEDDING',
        status: EventStatus.CONFIGURED,
        eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
        timeZone: 'America/Mexico_City',
        capacity: 100,
        confirmationEnabled: true
      }
    });
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
    if (status === EventStatus.ACTIVE) {
      const event = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { client: true, service: true }
      });
      if (!event.service) throw new Error('Active test Event requires service.');
      const price = await prisma.servicePrice.create({
        data: {
          serviceId: event.service.id,
          clientType: event.client.type,
          credits: 1,
          validFrom: new Date('2025-01-01T00:00:00.000Z')
        }
      });
      const receipt = await prisma.receipt.create({
        data: {
          clientId: event.clientId,
          operationType: 'EVENT_ACTIVATION',
          operationReference: event.id,
          idempotencyKey: `design-active-${randomUUID()}`
        }
      });
      await prisma.$executeRawUnsafe(`
        BEGIN;
        SET LOCAL session_replication_role = replica;
        UPDATE "event"
        SET
          "status" = 'active',
          "activated_at" = NOW(),
          "activated_by_user_id" = '${event.createdByUserId}'::uuid,
          "activated_service_id" = '${event.service.id}'::uuid,
          "activated_service_price_id" = '${price.id}'::uuid,
          "base_cost_credits" = 1,
          "promotion_discount_credits" = 0,
          "final_cost_credits" = 1,
          "purchased_credits_used" = 1,
          "credit_line_credits_used" = 0,
          "credit_unit_value_mxn_cents_snapshot" = NULL,
          "activation_receipt_id" = '${receipt.id}'::uuid,
          "activation_idempotency_key" = 'design-active-${event.id}'
        WHERE "id" = '${eventId}'::uuid;
        COMMIT;
      `);
      return;
    }
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

function flyerHotspot(action: HotspotAction, url?: string) {
  return {
    visualOwnerType: HotspotVisualOwnerType.FLYER,
    action,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    priority: 1,
    ...(url ? { url } : {})
  };
}
