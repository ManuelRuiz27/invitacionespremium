import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';
import { FileStorage } from '../src/file-assets/file-storage';
import { FileAssetsService } from '../src/file-assets/file-assets.service';
import { LocalFileStorage } from '../src/file-assets/local-file-storage';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const isolatedStorageRoot = vi.hoisted(() => {
  const root = `${process.env.TEMP ?? 'C:\\Windows\\Temp'}\\file-assets-vitest-${process.pid}-${Math.random()
    .toString(16)
    .slice(2)}`;
  process.env.FILE_STORAGE_LOCAL_ROOT = root;
  process.env.FILE_UPLOAD_MAX_BYTES = '10485760';
  process.env.FILE_IMAGE_MAX_PIXELS = '40000000';
  process.env.FILE_ORPHAN_RETENTION_SECONDS = '60';
  return root;
});

describe('FileAssets and local storage', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fileAssets: FileAssetsService;
  let storage: LocalFileStorage;
  let storageRoot: string;
  let jpeg: Buffer;
  let png: Buffer;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    storageRoot = isolatedStorageRoot;
    await rm(storageRoot, { recursive: true, force: true });
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
    fileAssets = app.get(FileAssetsService);
    storage = app.get(FileStorage) as LocalFileStorage;
    jpeg = await image('jpeg');
    png = await image('png');
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    const resolved = path.resolve(storageRoot);
    const systemTemp = path.resolve(process.env.TEMP ?? 'C:\\Windows\\Temp');
    if (!resolved.startsWith(`${systemTemp}${path.sep}`)) {
      throw new Error('Refusing to remove a non-temporary FileAsset test directory.');
    }
    await rm(resolved, { recursive: true, force: true });
  }, 60_000);

  it('uploads real JPG/PNG, derives safe metadata, serves content and soft-deletes idempotently', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const cookie = await login(owner.email);

    const jpgResponse = await upload(event.id, cookie, {
      file: jpeg,
      filename: '..\\..\\private-name.jpg',
      contentType: 'text/html',
      ownerType: 'FLYER',
      fileType: 'FLYER_INITIAL_IMAGE'
    }).expect(201);
    const pngResponse = await upload(event.id, cookie, {
      file: png,
      filename: 'image.png',
      contentType: 'application/pdf',
      ownerType: 'FLYER',
      fileType: 'FLYER_QR_IMAGE'
    }).expect(201);

    expect(jpgResponse.body).toMatchObject({
      eventId: event.id,
      ownerType: 'FLYER',
      ownerId: null,
      fileType: 'FLYER_INITIAL_IMAGE',
      mimeType: 'image/jpeg',
      width: 4,
      height: 3,
      status: 'READY'
    });
    expect(pngResponse.body.mimeType).toBe('image/png');
    for (const body of [jpgResponse.body, pngResponse.body]) {
      expect(body).not.toHaveProperty('storageKey');
      expect(body).not.toHaveProperty('checksumSha256');
      expect(body.originalName).not.toContain('..');
    }
    const auditText = JSON.stringify(await prisma.auditLog.findMany({ where: { eventId: event.id } }));
    expect(auditText).not.toContain(storedPathMarker());
    expect(auditText).not.toContain('private-name.jpg');

    const stored = await prisma.fileAsset.findUniqueOrThrow({ where: { id: jpgResponse.body.id } });
    expect(stored.storageKey).toMatch(/^[0-9a-f]{64}$/u);
    expect(stored.storageKey).not.toContain(stored.originalName);
    expect(stored.checksumSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(stored.sizeBytes).toBe((await storage.read(stored.storageKey)).length);

    const content = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/file-assets/${stored.id}/content`)
      .set('Cookie', cookie)
      .buffer(true)
      .expect(200);
    expect(content.headers['content-type']).toMatch(/^image\/jpeg/u);
    expect(content.headers['content-length']).toBe(String(stored.sizeBytes));
    expect(content.headers.etag).toMatch(/^"sha256-[0-9a-f]{32}"$/u);
    expect(content.headers['content-disposition']).toBe('inline');
    expect(Buffer.isBuffer(content.body)).toBe(true);

    await mutate('delete', `/events/${event.id}/file-assets/${stored.id}`, cookie).expect(204);
    await mutate('delete', `/events/${event.id}/file-assets/${stored.id}`, cookie).expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/file-assets/${stored.id}/content`)
      .set('Cookie', cookie)
      .expect(404);
    expect(await storage.exists(stored.storageKey)).toBe(true);
    expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id: stored.id } })).toMatchObject({
      status: FileAssetStatus.DELETED,
      deletedAt: expect.any(Date)
    });
  });

  it('rejects forged, forbidden, corrupt, oversized and incompatible uploads with stable errors', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const cookie = await login(owner.email);

    await expectUploadError(
      event.id,
      cookie,
      Buffer.from('%PDF-1.7'),
      'document.jpg',
      'image/jpeg',
      400,
      'FILE_UNSUPPORTED_TYPE'
    );
    await expectUploadError(
      event.id,
      cookie,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      'image.png',
      'image/png',
      400,
      'FILE_UNSUPPORTED_TYPE'
    );
    await expectUploadError(
      event.id,
      cookie,
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      'broken.jpg',
      'image/jpeg',
      400,
      'FILE_IMAGE_INVALID'
    );
    await upload(event.id, cookie, {
      file: jpeg,
      filename: 'wrong.jpg',
      contentType: 'image/jpeg',
      ownerType: 'FLOORPLAN',
      fileType: 'FLYER_INITIAL_IMAGE'
    })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_TYPE_OWNER_MISMATCH'));
    await upload(event.id, cookie, {
      file: jpeg,
      filename: 'generated.svg',
      contentType: 'image/jpeg',
      ownerType: 'INVITATION',
      fileType: 'INVITATION_QR_SVG'
    })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('FILE_UNSUPPORTED_TYPE'));

    await upload(event.id, cookie, {
      file: Buffer.alloc(10_485_761, 1),
      filename: 'too-large.jpg',
      contentType: 'image/jpeg',
      ownerType: 'FLYER',
      fileType: 'FLYER_INITIAL_IMAGE'
    })
      .expect(413)
      .expect(({ body }) => expect(body.code).toBe('FILE_SIZE_EXCEEDED'));

    const failed = await prisma.fileAsset.findMany({
      where: { eventId: event.id, status: FileAssetStatus.FAILED }
    });
    expect(failed).toHaveLength(3);
    expect(failed.map((asset) => asset.failureCode).sort()).toEqual([
      'FILE_IMAGE_INVALID',
      'FILE_UNSUPPORTED_TYPE',
      'FILE_UNSUPPORTED_TYPE'
    ]);
    for (const asset of failed) {
      expect(await storage.exists(asset.storageKey)).toBe(false);
    }
  });

  it('enforces all three ownership roles, planner isolation, Platform Admin denial and Event state locks', async () => {
    const independent = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const independentEvent = await createEvent(independent);
    const independentCookie = await login(independent.email);
    await validUpload(independentEvent.id, independentCookie, 'FLYER_INITIAL_IMAGE').expect(201);

    const organization = await createClient(ClientType.ORGANIZATION);
    const admin = await createUser(organization.id, UserRole.ORGANIZATION_ADMIN);
    const creator = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const otherPlanner = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const organizationEvent = await createEvent({ clientId: organization.id, userId: creator.id });
    await validUpload(organizationEvent.id, await login(admin.email), 'FLYER_INITIAL_IMAGE').expect(201);
    await validUpload(organizationEvent.id, await login(creator.email), 'FLYER_QR_IMAGE').expect(201);
    await validUpload(organizationEvent.id, await login(otherPlanner.email), 'FLYER_INITIAL_IMAGE').expect(404);

    const outsider = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${independentEvent.id}/file-assets`)
      .set('Cookie', await login(outsider.email))
      .expect(404);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${independentEvent.id}/file-assets`)
      .set('Cookie', await login(platform.email))
      .expect(403);

    await setEventStatus(independentEvent.id, EventStatus.CANCELLED);
    await validUpload(independentEvent.id, independentCookie, 'FLYER_QR_IMAGE')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_EVENT_STATE_LOCKED'));
    await prisma.event.update({ where: { id: organizationEvent.id }, data: { deletedAt: new Date() } });
    await validUpload(organizationEvent.id, await login(admin.email), 'FLYER_INITIAL_IMAGE').expect(404);
  });

  it('keeps assets isolated by Event and blocks non-ready content statuses', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const otherEvent = await createEvent(owner);
    const cookie = await login(owner.email);
    const response = await validUpload(event.id, cookie, 'FLYER_INITIAL_IMAGE').expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/events/${otherEvent.id}/file-assets/${response.body.id}`)
      .set('Cookie', cookie)
      .expect(404);
    await prisma.fileAsset.update({
      where: { id: response.body.id },
      data: { status: FileAssetStatus.HIDDEN }
    });
    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/file-assets/${response.body.id}/content`)
      .set('Cookie', cookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_NOT_READY'));

    const failed = await createTechnicalAsset(event, owner.userId, FileAssetStatus.FAILED);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/file-assets/${failed.id}/content`)
      .set('Cookie', cookie)
      .expect(409);
    const deleted = await createTechnicalAsset(event, owner.userId, FileAssetStatus.DELETED);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/file-assets/${deleted.id}/content`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('claims Invitation assets once, rejects cross-owner claims and preserves associated bytes', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const otherEvent = await createEvent(owner);
    const invitation = await createInvitation(event);
    const otherInvitation = await createInvitation(otherEvent);
    const staged = await createReadyInvitationAsset(event, owner.userId);

    const claimed = await fileAssets.claimReadyAsset(
      staged.id,
      { ownerType: FileAssetOwnerType.INVITATION, ownerId: invitation.id },
      owner.userId
    );
    expect(claimed).toMatchObject({
      ownerId: invitation.id,
      ownerType: FileAssetOwnerType.INVITATION,
      status: FileAssetStatus.READY
    });
    await expect(
      fileAssets.claimReadyAsset(
        staged.id,
        { ownerType: FileAssetOwnerType.INVITATION, ownerId: invitation.id },
        owner.userId
      )
    ).rejects.toMatchObject({ response: { code: 'FILE_OWNER_MISMATCH' } });

    const crossEvent = await createReadyInvitationAsset(event, owner.userId);
    await expect(
      fileAssets.claimReadyAsset(
        crossEvent.id,
        { ownerType: FileAssetOwnerType.INVITATION, ownerId: otherInvitation.id },
        owner.userId
      )
    ).rejects.toMatchObject({ response: { code: 'FILE_OWNER_MISMATCH' } });
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: crossEvent.id } })).ownerId).toBeNull();

    const cookie = await login(owner.email);
    await mutate('delete', `/events/${event.id}/file-assets/${staged.id}`, cookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FILE_ASSET_ASSOCIATED'));
    await setEventArchived(event, owner);
    expect(await storage.exists(staged.storageKey)).toBe(true);
    expect(await prisma.fileAsset.findUnique({ where: { id: staged.id } })).not.toBeNull();
  });

  it('creates generated Invitation assets internally and cleans only expired unassociated assets', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const invitation = await createInvitation(event);
    const generated = await fileAssets.createGeneratedAsset({
      owner: { ownerType: FileAssetOwnerType.INVITATION, ownerId: invitation.id },
      fileType: FileAssetType.INVITATION_QR_SVG,
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      mimeType: 'image/svg+xml',
      originalName: 'invitation.svg',
      actorUserId: owner.userId
    });
    const associated = await prisma.fileAsset.findUniqueOrThrow({ where: { id: generated.id } });
    expect(associated.ownerId).toBe(invitation.id);

    const orphan = await createReadyInvitationAsset(event, owner.userId);
    const failed = await createTechnicalAsset(event, owner.userId, FileAssetStatus.FAILED);
    const abandoned = await createTechnicalAsset(event, owner.userId, FileAssetStatus.UPLOADING);
    expect(await fileAssets.cleanupOrphans(new Date(Date.now() + 120_000))).toBe(3);
    for (const id of [orphan.id, failed.id, abandoned.id]) {
      expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: FileAssetStatus.DELETED,
        deletedAt: expect.any(Date)
      });
    }
    expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id: associated.id } })).toMatchObject({
      status: FileAssetStatus.READY,
      ownerId: invitation.id
    });
    expect(await storage.exists(associated.storageKey)).toBe(true);
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'FILE_ASSET_ORPHAN_CLEANUP', actorType: 'SYSTEM' }
      })
    ).toMatchObject({ metadata: { count: 3 } });
  });

  it('enforces PostgreSQL compatibility, metadata, immutability, transitions and TRUNCATE protection', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const base = {
      clientId: owner.clientId,
      eventId: event.id,
      storageKey: randomBytes(32).toString('hex'),
      originalName: 'asset.jpg',
      mimeType: 'application/octet-stream',
      sizeBytes: 0,
      createdByUserId: owner.userId
    };
    await expect(
      prisma.fileAsset.create({
        data: {
          ...base,
          ownerType: FileAssetOwnerType.FLYER,
          fileType: FileAssetType.FLOORPLAN_IMAGE
        }
      })
    ).rejects.toThrow();

    const ready = await createReadyImageAsset(event, owner.userId);
    await expect(
      prisma.fileAsset.update({
        where: { id: ready.id },
        data: { checksumSha256: '0'.repeat(64) }
      })
    ).rejects.toThrow(/binary metadata is immutable/);
    await expect(
      prisma.fileAsset.update({
        where: { id: ready.id },
        data: { clientId: (await createClient(ClientType.PLANNER)).id }
      })
    ).rejects.toThrow(/identity is immutable/);
    await prisma.fileAsset.update({
      where: { id: ready.id },
      data: { status: FileAssetStatus.DELETED, deletedAt: new Date() }
    });
    await expect(
      prisma.fileAsset.update({
        where: { id: ready.id },
        data: { status: FileAssetStatus.READY, deletedAt: null }
      })
    ).rejects.toThrow(/invalid file asset status transition/);
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "file_asset"')).rejects.toThrow(
      /file_asset cannot be truncated/
    );
  });

  it('documents all FileAsset endpoints in OpenAPI without storage internals', () => {
    const document = createOpenApiDocument(app);
    for (const pathName of [
      '/api/v1/events/{eventId}/file-assets',
      '/api/v1/events/{eventId}/file-assets/{fileAssetId}',
      '/api/v1/events/{eventId}/file-assets/{fileAssetId}/content'
    ]) {
      expect(document.paths).toHaveProperty(pathName);
    }
    const schema = document.components?.schemas?.FileAssetResponseDto as
      { properties?: Record<string, unknown> } | undefined;
    expect(schema?.properties).not.toHaveProperty('storageKey');
    expect(schema?.properties).not.toHaveProperty('checksumSha256');
  });

  async function expectUploadError(
    eventId: string,
    cookie: string,
    bytes: Buffer,
    filename: string,
    contentType: string,
    status: number,
    code: string
  ): Promise<void> {
    await upload(eventId, cookie, {
      file: bytes,
      filename,
      contentType,
      ownerType: 'FLYER',
      fileType: 'FLYER_INITIAL_IMAGE'
    })
      .expect(status)
      .expect(({ body }) => expect(body.code).toBe(code));
  }

  function validUpload(eventId: string, cookie: string, fileType: 'FLYER_INITIAL_IMAGE' | 'FLYER_QR_IMAGE') {
    return upload(eventId, cookie, {
      file: jpeg,
      filename: 'safe.jpg',
      contentType: 'image/jpeg',
      ownerType: 'FLYER',
      fileType
    });
  }

  function upload(
    eventId: string,
    cookie: string,
    input: {
      file: Buffer;
      filename: string;
      contentType: string;
      ownerType: string;
      fileType: string;
    }
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/file-assets`)
      .set('Cookie', cookie)
      .set('Origin', trustedOrigin)
      .field('ownerType', input.ownerType)
      .field('fileType', input.fileType)
      .attach('file', input.file, { filename: input.filename, contentType: input.contentType });
  }

  function mutate(method: 'delete', route: string, cookie: string) {
    return request(app.getHttpServer())[method](`/api/v1${route}`).set('Cookie', cookie).set('Origin', trustedOrigin);
  }

  async function createClientUser(role: UserRole) {
    const client = await createClient(ClientType.PLANNER);
    const user = await createUser(client.id, role);
    return { clientId: client.id, userId: user.id, email: user.email };
  }

  async function createClient(type: ClientType) {
    return prisma.client.create({ data: { type, name: `Client ${randomUUID()}` } });
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { id: user.id, email };
  }

  async function createEvent(owner: { clientId: string; userId: string }) {
    return prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        name: 'FileAsset Event',
        status: EventStatus.DRAFT,
        eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
        timeZone: 'America/Mexico_City'
      }
    });
  }

  async function createInvitation(event: { id: string; clientId: string }) {
    const contact = await prisma.contact.create({
      data: {
        eventId: event.id,
        name: 'Owner',
        whatsappPhoneNormalized: `+52${String(Math.floor(Math.random() * 10 ** 10)).padStart(10, '0')}`
      }
    });
    return prisma.$transaction(async (transaction) => {
      const invitation = await transaction.invitation.create({
        data: {
          eventId: event.id,
          contactId: contact.id,
          invitationTokenNonce: randomBytes(32).toString('hex'),
          qrTokenNonce: randomBytes(32).toString('hex')
        }
      });
      await transaction.assistant.create({
        data: {
          eventId: event.id,
          invitationId: invitation.id,
          name: contact.name,
          isPrimary: true
        }
      });
      return invitation;
    });
  }

  async function createReadyInvitationAsset(event: { id: string; clientId: string }, userId: string) {
    const key = randomBytes(32).toString('hex');
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await storage.write({ storageKey: key, bytes });
    return prisma.fileAsset.create({
      data: {
        clientId: event.clientId,
        eventId: event.id,
        ownerType: FileAssetOwnerType.INVITATION,
        fileType: FileAssetType.INVITATION_QR_SVG,
        storageKey: key,
        originalName: 'generated.svg',
        mimeType: 'image/svg+xml',
        sizeBytes: bytes.length,
        checksumSha256: hash(bytes),
        createdByUserId: userId,
        status: FileAssetStatus.READY
      }
    });
  }

  async function createReadyImageAsset(event: { id: string; clientId: string }, userId: string) {
    const key = randomBytes(32).toString('hex');
    await storage.write({ storageKey: key, bytes: jpeg });
    return prisma.fileAsset.create({
      data: {
        clientId: event.clientId,
        eventId: event.id,
        ownerType: FileAssetOwnerType.FLYER,
        fileType: FileAssetType.FLYER_INITIAL_IMAGE,
        storageProvider: StorageProvider.LOCAL,
        storageKey: key,
        originalName: 'asset.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: jpeg.length,
        checksumSha256: hash(jpeg),
        width: 4,
        height: 3,
        createdByUserId: userId,
        status: FileAssetStatus.READY
      }
    });
  }

  async function createTechnicalAsset(
    event: { id: string; clientId: string },
    userId: string,
    status: FileAssetStatus
  ) {
    return prisma.fileAsset.create({
      data: {
        clientId: event.clientId,
        eventId: event.id,
        ownerType: FileAssetOwnerType.FLYER,
        fileType: FileAssetType.FLYER_INITIAL_IMAGE,
        storageKey: randomBytes(32).toString('hex'),
        originalName: 'technical.jpg',
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        createdByUserId: userId,
        status,
        ...(status === FileAssetStatus.FAILED ? { failureCode: 'FILE_IMAGE_INVALID' } : {}),
        ...(status === FileAssetStatus.DELETED ? { deletedAt: new Date() } : {})
      }
    });
  }

  async function setEventStatus(eventId: string, status: EventStatus): Promise<void> {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      UPDATE "event" SET "status" = '${status.toLowerCase()}'::"event_status" WHERE "id" = '${eventId}'::uuid;
      COMMIT;
    `);
  }

  async function setEventArchived(event: { id: string; clientId: string }, owner: { userId: string }): Promise<void> {
    const service = await prisma.service.create({ data: { code: 'FLYER' } });
    const price = await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.PLANNER,
        credits: 1,
        validFrom: new Date('2025-01-01T00:00:00.000Z')
      }
    });
    const receipt = await prisma.receipt.create({
      data: {
        clientId: event.clientId,
        operationType: 'EVENT_ACTIVATION',
        operationReference: event.id,
        idempotencyKey: `archive-${randomUUID()}`
      }
    });
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      UPDATE "event"
      SET
        "status" = 'archived',
        "activated_at" = NOW(),
        "activated_by_user_id" = '${owner.userId}'::uuid,
        "activated_service_id" = '${service.id}'::uuid,
        "activated_service_price_id" = '${price.id}'::uuid,
        "base_cost_credits" = 0,
        "promotion_discount_credits" = 0,
        "final_cost_credits" = 0,
        "purchased_credits_used" = 0,
        "credit_line_credits_used" = 0,
        "credit_unit_value_mxn_cents_snapshot" = NULL,
        "activation_receipt_id" = '${receipt.id}'::uuid,
        "activation_idempotency_key" = 'archive-test-${event.id}'
      WHERE "id" = '${event.id}'::uuid;
      COMMIT;
    `);
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

async function image(format: 'jpeg' | 'png'): Promise<Buffer> {
  const pipeline = sharp({
    create: { width: 4, height: 3, channels: 3, background: '#663399' }
  });
  return format === 'jpeg' ? pipeline.jpeg().toBuffer() : pipeline.png().toBuffer();
}

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function storedPathMarker(): string {
  return 'file-assets-vitest-';
}
