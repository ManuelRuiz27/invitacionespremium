import { randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  ServiceCode,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const isolatedStorage = vi.hoisted(() => {
  const systemTemp =
    process.env.RUNNER_TEMP ??
    process.env.TMPDIR ??
    process.env.TEMP ??
    process.env.TMP ??
    (process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp');
  const separator = /[\\/]$/u.test(systemTemp) ? '' : process.platform === 'win32' ? '\\' : '/';
  const root = `${systemTemp}${separator}op02c-file-assets-vitest-${process.pid}-${Math.random().toString(16).slice(2)}`;
  process.env.FILE_STORAGE_LOCAL_ROOT = root;
  process.env.FILE_UPLOAD_MAX_BYTES = '10485760';
  process.env.FILE_IMAGE_MAX_PIXELS = '40000000';
  process.env.FILE_ORPHAN_RETENTION_SECONDS = '60';
  return { root, systemTemp };
});

describe('OP-02C provider Invitation FileAssets', () => {
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
        background: { r: 100, g: 50, b: 180, alpha: 1 }
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
      throw new Error('Refusing to remove a non-temporary OP-02C FileAsset test directory.');
    }
    await rm(resolved, { recursive: true, force: true });
  }, 60_000);

  it('lists and serves only same-target Invitation images and preserves delete boundaries', async () => {
    const fixture = await createFixture();
    const adminCookie = await login(fixture.adminEmail);
    const plannerCookie = await login(fixture.plannerEmail);

    await upload(fixture.clientId, fixture.eventId, adminCookie, FileAssetType.FLYER_INITIAL_IMAGE)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_DESIGN_KICKOFF_REQUIRED'));
    await request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design-kickoff`)
      .set('Cookie', adminCookie)
      .set('Origin', trustedOrigin)
      .expect(200);

    const initial = await upload(
      fixture.clientId,
      fixture.eventId,
      adminCookie,
      FileAssetType.FLYER_INITIAL_IMAGE
    ).expect(201);
    const qr = await upload(fixture.clientId, fixture.eventId, adminCookie, FileAssetType.FLYER_QR_IMAGE).expect(201);
    const page = await upload(fixture.clientId, fixture.eventId, adminCookie, FileAssetType.FLIPBOOK_PAGE_IMAGE).expect(
      201
    );

    await prisma.fileAsset.create({
      data: {
        clientId: fixture.clientId,
        eventId: fixture.eventId,
        ownerType: FileAssetOwnerType.FLOORPLAN,
        fileType: FileAssetType.FLOORPLAN_IMAGE,
        storageProvider: StorageProvider.LOCAL,
        storageKey: randomBytes(32).toString('hex'),
        originalName: 'floorplan.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        checksumSha256: randomBytes(32).toString('hex'),
        width: 10,
        height: 10,
        createdByUserId: fixture.plannerId,
        status: FileAssetStatus.READY
      }
    });

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design/file-assets`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(new Set(listed.body.map(({ id }: { id: string }) => id))).toEqual(
      new Set([initial.body.id, qr.body.id, page.body.id])
    );
    expect(
      listed.body.every(({ fileType }: { fileType: FileAssetType }) => fileType !== FileAssetType.FLOORPLAN_IMAGE)
    ).toBe(true);

    const content = await request(app.getHttpServer())
      .get(
        `/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design/file-assets/${initial.body.id}/content`
      )
      .set('Cookie', adminCookie)
      .buffer(true)
      .expect(200);
    expect(content.headers['content-type']).toMatch(/^image\/png/u);
    expect(content.headers['content-disposition']).toBe('inline');
    expect(content.headers['cache-control']).toBe('private, no-store');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers.etag).toMatch(/^"sha256-[0-9a-f]{32}"$/u);
    expect(Buffer.isBuffer(content.body)).toBe(true);

    await request(app.getHttpServer())
      .get(
        `/api/v1/admin/clients/${randomUUID()}/events/${fixture.eventId}/design/file-assets/${initial.body.id}/content`
      )
      .set('Cookie', adminCookie)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('EVENT_NOT_FOUND'));

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design/file-assets/${page.body.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', trustedOrigin)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design/file-assets/${page.body.id}`)
      .set('Cookie', adminCookie)
      .set('Origin', trustedOrigin)
      .expect(204);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design/flyer`)
      .set('Cookie', adminCookie)
      .set('Origin', trustedOrigin)
      .send({ initialAssetId: initial.body.id, qrAssetId: qr.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .delete(
        `/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/design/file-assets/${initial.body.id}`
      )
      .set('Cookie', adminCookie)
      .set('Origin', trustedOrigin)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_ASSET_ASSOCIATED'));

    await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${fixture.clientId}/events/${fixture.eventId}/file-assets`)
      .set('Cookie', adminCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/file-assets`)
      .set('Cookie', adminCookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/file-assets`)
      .set('Cookie', plannerCookie)
      .expect(200);
  });

  async function createFixture() {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: `Client ${randomUUID()}` } });
    const plannerEmail = `${randomUUID()}@example.com`;
    const adminEmail = `${randomUUID()}@example.com`;
    const passwordHash = await hashPassword(password);
    const planner = await prisma.user.create({
      data: {
        clientId: client.id,
        email: plannerEmail,
        passwordHash,
        role: UserRole.INDEPENDENT_PLANNER
      }
    });
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: UserRole.PLATFORM_ADMIN }
    });
    const service =
      (await prisma.service.findUnique({ where: { code: ServiceCode.FLYER } })) ??
      (await prisma.service.create({ data: { code: ServiceCode.FLYER } }));
    const price = await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.STANDARD,
        capacityMin: 1,
        capacityMax: 150,
        credits: 10,
        validFrom: new Date(Date.now() - 60_000)
      }
    });
    const commercialAt = new Date();
    const event = await prisma.event.create({
      data: {
        clientId: client.id,
        createdByUserId: planner.id,
        serviceId: service.id,
        name: 'OP-02C Assets',
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
        commercialVenueTierSnapshot: price.venueTier
      }
    });
    return {
      clientId: client.id,
      eventId: event.id,
      plannerId: planner.id,
      plannerEmail,
      adminEmail
    };
  }

  function upload(clientId: string, eventId: string, cookie: string, fileType: FileAssetType) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events/${eventId}/design/file-assets`)
      .set('Cookie', cookie)
      .set('Origin', trustedOrigin)
      .field('fileType', fileType)
      .attach('file', png, { filename: 'invitation.png', contentType: 'image/png' });
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
