import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Client as PgClient } from 'pg';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlbumsService } from '../src/albums/albums.service';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientStatus,
  ClientType,
  EventSocialType,
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
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { FileStorage } from '../src/file-assets/file-storage';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const isolatedStorage = vi.hoisted(() => {
  const systemTemp =
    process.env.RUNNER_TEMP ??
    process.env.TMPDIR ??
    process.env.TEMP ??
    process.env.TMP ??
    (process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp');
  const separator = /[\\/]$/u.test(systemTemp) ? '' : process.platform === 'win32' ? '\\' : '/';
  const root = `${systemTemp}${separator}albums-vitest-${process.pid}-${Math.random().toString(16).slice(2)}`;
  process.env.FILE_STORAGE_LOCAL_ROOT = root;
  process.env.FILE_UPLOAD_MAX_BYTES = '10485760';
  process.env.FILE_IMAGE_MAX_PIXELS = '40000000';
  process.env.FILE_ORPHAN_RETENTION_SECONDS = '60';
  return { root, systemTemp };
});

describe('Albums', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let albums: AlbumsService;
  let audit: AuditService;
  let storage: FileStorage;
  let invitationTokens: InvitationTokenService;
  let image: Buffer;
  let jpegImage: Buffer;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    await rm(isolatedStorage.root, { recursive: true, force: true });
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'albums-integration-signing-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    albums = app.get(AlbumsService);
    audit = app.get(AuditService);
    storage = app.get(FileStorage);
    invitationTokens = app.get(InvitationTokenService);
    image = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#C5A46D' }
    })
      .png()
      .toBuffer();
    jpegImage = await sharp(image).jpeg().toBuffer();
  });

  beforeEach(resetDatabase, 60_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await resetDatabase();
    await app.close();
    const resolved = path.resolve(isolatedStorage.root);
    const resolvedTemp = path.resolve(isolatedStorage.systemTemp);
    const relative = path.relative(resolvedTemp, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Refusing to remove a non-temporary Album test directory.');
    }
    await rm(resolved, { recursive: true, force: true });
  }, 60_000);

  it('runs the real digital HTTP flow, restricts non-attendees, rotates access and archives on demand and expiry', async () => {
    const owner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const cookie = await login(owner.email);
    const service = await createService(ServiceCode.FLYER);
    await createFreePrice(service.id);

    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({
        name: 'Boda álbum',
        serviceId: service.id,
        socialType: EventSocialType.WEDDING,
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City',
        capacity: 10,
        confirmationEnabled: true,
        locationUrl: 'https://example.com/ubicacion',
        giftRegistryUrl: 'https://example.com/regalos'
      })
      .expect(201);
    const eventId = created.body.id as string;

    const contacts = [];
    for (const [name, phone] of [
      ['Asistente con ingreso', '+525511223344'],
      ['Asistente sin ingreso', '+525511223355']
    ]) {
      contacts.push(
        await request(app.getHttpServer())
          .post(`/api/v1/events/${eventId}/contacts`)
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send({ name, whatsappPhone: phone })
          .expect(201)
      );
    }
    const invitations = await prisma.invitation.findMany({
      where: { eventId },
      include: { assistants: true },
      orderBy: { createdAt: 'asc' }
    });
    expect(invitations).toHaveLength(2);

    const initial = await uploadImage(eventId, cookie, 'FLYER', 'FLYER_INITIAL_IMAGE').expect(201);
    const qr = await uploadImage(eventId, cookie, 'FLYER', 'FLYER_QR_IMAGE').expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/design/flyer`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ initialAssetId: initial.body.id, qrAssetId: qr.body.id })
      .expect(201);
    for (const action of [
      HotspotAction.RSVP,
      HotspotAction.LOCATION,
      HotspotAction.GIFT_REGISTRY,
      HotspotAction.QR_AREA
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/hotspots`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send({
          visualOwnerType: HotspotVisualOwnerType.FLYER,
          action,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          priority: 1
        })
        .expect(201);
    }
    const readiness = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/design/readiness`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200);
    expect(readiness.body).toMatchObject({ complete: true, blockers: [] });
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await transaction.event.update({
        where: { id: eventId },
        data: { status: EventStatus.READY_TO_ACTIVATE }
      });
    });
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/activate`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);

    const publicTokens = invitations.map((invitation) =>
      invitationTokens.issue('INVITATION', invitation.id, invitation.invitationTokenNonce)
    );
    for (const token of publicTokens) {
      await request(app.getHttpServer())
        .post(`/api/v1/public/invitations/${encodeURIComponent(token)}/confirm`)
        .send({ additionalAssistants: [] })
        .expect(200);
    }
    const staff = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ alias: 'Álbum' })
      .expect(201);
    const enteredAssistant = invitations[0]?.assistants.find(({ isPrimary }) => isPrimary);
    if (!enteredAssistant) throw new Error('Primary Assistant is required.');
    await request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(staff.body.token as string)}/check-in`)
      .set('Idempotency-Key', randomUUID())
      .send({ invitationId: invitations[0]?.id, assistantIds: [enteredAssistant.id] })
      .expect(200);

    await createAlbumHttp(eventId, cookie).expect(201);
    const albumJpg = await uploadImage(eventId, cookie, 'ALBUM_PHOTO', 'ALBUM_PHOTO_IMAGE', 'jpeg').expect(201);
    const albumPng = await uploadImage(eventId, cookie, 'ALBUM_PHOTO', 'ALBUM_PHOTO_IMAGE').expect(201);
    const associated = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/album/photos`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ fileAssetIds: [albumJpg.body.id, albumPng.body.id] })
      .expect(200);
    expect(associated.body.photos.map(({ position }: { position: number }) => position)).toEqual([1, 2]);
    const disposable = await uploadImage(eventId, cookie, 'ALBUM_PHOTO', 'ALBUM_PHOTO_IMAGE').expect(201);
    const withDisposable = await addPhotosRequest({ eventId, cookie }, [disposable.body.id as string]).expect(200);
    const disposablePhoto = withDisposable.body.photos.find(({ position }: { position: number }) => position === 3) as {
      id: string;
    };
    const disposableAsset = await prisma.fileAsset.findUniqueOrThrow({
      where: { id: disposable.body.id as string }
    });
    const bytesBeforeDelete = await storage.read(disposableAsset.storageKey);
    await deletePhotoRequest({ eventId, cookie }, disposablePhoto.id).expect(204);
    expect(await storage.read(disposableAsset.storageKey)).toEqual(bytesBeforeDelete);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/close`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const publishKey = randomUUID();
    const published = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/album/publish`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', publishKey)
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/album/publish`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', publishKey)
      .expect(200);
    expect(replay.body).toEqual(published.body);
    expect(published.body).toMatchObject({ status: 'PUBLISHED', photoCount: 2, eligibleInvitationCount: 1 });
    expect(await prisma.auditLog.count({ where: { eventId, action: 'ALBUM_PUBLISH' } })).toBe(1);

    const eligibleView = await publicInvitation(publicTokens[0]!).expect(200);
    expect(eligibleView.body.album).toMatchObject({ state: 'AVAILABLE' });
    const restrictedView = await publicInvitation(publicTokens[1]!).expect(200);
    expect(restrictedView.body.album).toEqual({
      state: 'RESTRICTED',
      message: 'Álbum disponible solo para asistentes'
    });
    const firstAlbumPath = eligibleView.body.album.contentPath as string;
    const publicAlbum = await request(app.getHttpServer()).get(firstAlbumPath).expect(200);
    expect(JSON.stringify(publicAlbum.body)).not.toMatch(
      /eventId|albumId|invitationId|contact|assistant|phone|storage|checksum|fileAsset/iu
    );
    expect(publicAlbum.body.album.photos).toHaveLength(2);
    const photoContent = await request(app.getHttpServer())
      .get(publicAlbum.body.album.photos[0].contentPath as string)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', (error: Error) => callback(error, undefined));
      })
      .expect(200);
    expect(photoContent.headers['cache-control']).toBe('private, no-store');
    expect(photoContent.headers['x-content-type-options']).toBe('nosniff');
    expect(photoContent.headers['referrer-policy']).toBe('no-referrer');
    expect(photoContent.headers['content-type']).toMatch(/^image\/(jpeg|png)/u);
    expect((photoContent.body as Buffer).length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/album/unpublish`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    await request(app.getHttpServer()).get(firstAlbumPath).expect(404);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).status).toBe(EventStatus.CLOSED);
    const republished = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/album/publish`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(republished.body.publishedAt).not.toBe(published.body.publishedAt);
    const secondView = await publicInvitation(publicTokens[0]!).expect(200);
    const secondAlbumPath = secondView.body.album.contentPath as string;
    expect(secondAlbumPath).not.toBe(firstAlbumPath);
    await request(app.getHttpServer()).get(firstAlbumPath).expect(404);
    await request(app.getHttpServer()).get(secondAlbumPath).expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/archive`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    await request(app.getHttpServer()).get(secondAlbumPath).expect(404);
    await publicInvitation(publicTokens[0]!).expect(404);
    expect(await prisma.albumPhoto.count({ where: { eventId, deletedAt: null } })).toBe(2);
    expect(await prisma.fileAsset.count({ where: { eventId, status: FileAssetStatus.READY } })).toBeGreaterThan(0);

    const expiry = await createPublishedFixture('expiry');
    const expired = await albums.expirePublishedAlbums(new Date(expiry.expiresAt.getTime() + 1));
    expect(expired).toBe(1);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: expiry.eventId } })).status).toBe(EventStatus.ARCHIVED);
    await request(app.getHttpServer()).get(expiry.albumPath).expect(404);
    expect(await prisma.auditLog.count({ where: { eventId: expiry.eventId, action: 'ALBUM_EXPIRE' } })).toBe(1);
  }, 120_000);

  it('enforces service, ownership, SQL integrity, the 35-photo limit and contiguous compaction', async () => {
    const flyer = await createTechnicalEvent(ServiceCode.FLYER, EventStatus.ACTIVE);
    const flipbook = await createTechnicalEvent(ServiceCode.FLIPBOOK, EventStatus.CLOSED);
    const physical = await createTechnicalEvent(ServiceCode.PHYSICAL_QR, EventStatus.ACTIVE);
    const demo = await createTechnicalEvent(ServiceCode.DEMO, EventStatus.ACTIVE);
    const flyerCookie = await login(flyer.email);
    const flipbookCookie = await login(flipbook.email);
    await createAlbumHttp(flyer.eventId, flyerCookie).expect(201);
    await createAlbumHttp(flipbook.eventId, flipbookCookie).expect(201);
    await createAlbumHttp(physical.eventId, await login(physical.email)).expect(409);
    await createAlbumHttp(demo.eventId, await login(demo.email)).expect(409);

    const foreign = await createTechnicalEvent(ServiceCode.FLYER, EventStatus.ACTIVE);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${flyer.eventId}/album`)
      .set('Cookie', await login(foreign.email))
      .expect(404);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${flyer.eventId}/album`)
      .set('Cookie', await login(platform.email))
      .expect(403);

    const organization = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, name: `OrganizaciÃ³n ${randomUUID()}`, status: ClientStatus.ACTIVE }
    });
    const organizationAdmin = await createUser(organization.id, UserRole.ORGANIZATION_ADMIN);
    const organizationPlanner = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const otherOrganizationPlanner = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const organizationEvent = await createTechnicalEvent(ServiceCode.FLYER, EventStatus.ACTIVE, {
      clientId: organization.id,
      userId: organizationPlanner.id,
      email: organizationPlanner.email
    });
    await createAlbumHttp(organizationEvent.eventId, await login(organizationPlanner.email)).expect(201);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${organizationEvent.eventId}/album`)
      .set('Cookie', await login(organizationAdmin.email))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${organizationEvent.eventId}/album`)
      .set('Cookie', await login(otherOrganizationPlanner.email))
      .expect(404);

    const album = await prisma.album.findUniqueOrThrow({ where: { eventId: flyer.eventId } });
    const assets = [];
    for (let index = 0; index < 35; index += 1) assets.push(await createReadyAlbumAsset(flyer, index));
    await request(app.getHttpServer())
      .post(`/api/v1/events/${flyer.eventId}/album/photos`)
      .set('Origin', origin)
      .set('Cookie', flyerCookie)
      .send({ fileAssetIds: assets.map(({ id }) => id) })
      .expect(200);
    const extra = await createReadyAlbumAsset(flyer, 36);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${flyer.eventId}/album/photos`)
      .set('Origin', origin)
      .set('Cookie', flyerCookie)
      .send({ fileAssetIds: [extra.id] })
      .expect(409);
    const foreignAsset = await createReadyAlbumAsset(foreign, 1);
    await addPhotosRequest({ eventId: flyer.eventId, cookie: flyerCookie }, [foreignAsset.id]).expect(409);
    const wrongMime = await createReadyAlbumAsset(flyer, 37, { mimeType: 'application/pdf' });
    await addPhotosRequest({ eventId: flyer.eventId, cookie: flyerCookie }, [wrongMime.id]).expect(409);
    const staging = await createReadyAlbumAsset(flyer, 38, {
      status: FileAssetStatus.UPLOADING,
      checksumSha256: null
    });
    await addPhotosRequest({ eventId: flyer.eventId, cookie: flyerCookie }, [staging.id]).expect(409);

    const photos = await prisma.albumPhoto.findMany({
      where: { albumId: album.id, deletedAt: null },
      orderBy: { position: 'asc' }
    });
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${flyer.eventId}/album/photos/${photos[10]?.id}`)
      .set('Origin', origin)
      .set('Cookie', flyerCookie)
      .expect(204);
    expect(
      (
        await prisma.albumPhoto.findMany({
          where: { albumId: album.id, deletedAt: null },
          orderBy: { position: 'asc' }
        })
      ).map(({ position }) => position)
    ).toEqual(Array.from({ length: 34 }, (_, index) => index + 1));
    expect((await prisma.fileAsset.findUniqueOrThrow({ where: { id: photos[10]!.fileAssetId } })).status).toBe(
      FileAssetStatus.HIDDEN
    );

    await expect(
      prisma.album.create({
        data: {
          eventId: physical.eventId,
          title: 'Inválido',
          themeSettings: theme,
          createdByUserId: physical.userId
        }
      })
    ).rejects.toThrow('ALBUM_SERVICE_NOT_SUPPORTED');
    await expect(
      prisma.fileAsset.update({ where: { id: photos[0]!.fileAssetId }, data: { status: FileAssetStatus.HIDDEN } })
    ).rejects.toThrow('ALBUM_PHOTO_FILE_ASSET_INVALID');
    await expect(prisma.albumPhoto.delete({ where: { id: photos[0]!.id } })).rejects.toThrow(
      'ALBUM_HARD_DELETE_FORBIDDEN'
    );
    await expect(prisma.album.delete({ where: { id: album.id } })).rejects.toThrow('ALBUM_HARD_DELETE_FORBIDDEN');

    const empty = await createTechnicalEvent(ServiceCode.FLYER, EventStatus.CLOSED);
    const emptyCookie = await login(empty.email);
    await createAlbumHttp(empty.eventId, emptyCookie).expect(201);
    await publishRequest({ eventId: empty.eventId, cookie: emptyCookie }, randomUUID()).expect(409);

    const cancelled = await createClosedAlbumFixture('cancelled');
    await prisma.invitation.update({
      where: { id: cancelled.invitationId },
      data: {
        cancelledAt: new Date(),
        cancelledByUserId: cancelled.userId,
        cancelIdempotencyKey: `album-cancelled-${randomUUID()}`
      }
    });
    const cancelledPublication = await publishRequest(cancelled, randomUUID()).expect(200);
    expect(cancelledPublication.body.eligibleInvitationCount).toBe(0);

    const publicationIntegrity = await createPublishedFixture('sql-publication-integrity');
    await expect(
      prisma.album.update({
        where: { eventId: publicationIntegrity.eventId },
        data: { publishedAt: null, expiresAt: null }
      })
    ).rejects.toThrow('ALBUM_PUBLICATION_INVALID');
  }, 120_000);

  it('returns a generic storage failure without exposing internal FileAsset data', async () => {
    const fixture = await createPublishedFixture('storage-failure');
    const publicAlbum = await request(app.getHttpServer()).get(fixture.albumPath).expect(200);
    const response = await request(app.getHttpServer())
      .get(publicAlbum.body.album.photos[0].contentPath as string)
      .expect(500);
    expect(JSON.stringify(response.body)).not.toMatch(
      /storageKey|checksum|album-test|fileAsset|originalName|windows|\/tmp/iu
    );
  });

  it('serializes concurrent creation and two final photo batches behind verified PostgreSQL lock barriers', async () => {
    const fixture = await createTechnicalEvent(ServiceCode.FLYER, EventStatus.ACTIVE);
    const cookie = await login(fixture.email);
    const creations = await startBehindVerifiedEventLock(fixture.eventId, () => [
      createAlbumHttp(fixture.eventId, cookie),
      createAlbumHttp(fixture.eventId, cookie)
    ]);
    expect(creations.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.album.count({ where: { eventId: fixture.eventId } })).toBe(1);

    const initial = [];
    for (let index = 0; index < 34; index += 1) initial.push(await createReadyAlbumAsset(fixture, index));
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/album/photos`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ fileAssetIds: initial.map(({ id }) => id) })
      .expect(200);
    const left = await createReadyAlbumAsset(fixture, 40);
    const right = await createReadyAlbumAsset(fixture, 41);
    const additions = await startBehindVerifiedEventLock(fixture.eventId, () => [
      request(app.getHttpServer())
        .post(`/api/v1/events/${fixture.eventId}/album/photos`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send({ fileAssetIds: [left.id] }),
      request(app.getHttpServer())
        .post(`/api/v1/events/${fixture.eventId}/album/photos`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send({ fileAssetIds: [right.id] })
    ]);
    expect(additions.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.albumPhoto.count({ where: { eventId: fixture.eventId, deletedAt: null } })).toBe(35);
  }, 120_000);

  it('serializes Album mutations, publication, lifecycle, attendance and public access in the required lock order', async () => {
    const addDelete = await createClosedAlbumFixture('add-delete');
    const addedAsset = await createReadyAlbumAsset(addDelete, 2);
    const [deleted, added] = await startOrderedBehindVerifiedEventLock(
      addDelete.eventId,
      () => deletePhotoRequest(addDelete, addDelete.photoId),
      () => addPhotosRequest(addDelete, [addedAsset.id])
    );
    expect([deleted.status, added.status]).toEqual([204, 200]);
    expect(
      (
        await prisma.albumPhoto.findMany({
          where: { eventId: addDelete.eventId, deletedAt: null },
          orderBy: { position: 'asc' }
        })
      ).map(({ position }) => position)
    ).toEqual([1]);

    const publishAdd = await createClosedAlbumFixture('publish-add');
    const publishAddAsset = await createReadyAlbumAsset(publishAdd, 2);
    const [publishedBeforeAdd, rejectedAdd] = await startOrderedBehindVerifiedEventLock(
      publishAdd.eventId,
      () => publishRequest(publishAdd, randomUUID()),
      () => addPhotosRequest(publishAdd, [publishAddAsset.id])
    );
    expect([publishedBeforeAdd.status, rejectedAdd.status]).toEqual([200, 409]);
    expect(publishedBeforeAdd.body.photoCount).toBe(1);

    const addPublish = await createClosedAlbumFixture('add-publish');
    const addPublishAsset = await createReadyAlbumAsset(addPublish, 2);
    const [addedBeforePublish, publishedAfterAdd] = await startOrderedBehindVerifiedEventLock(
      addPublish.eventId,
      () => addPhotosRequest(addPublish, [addPublishAsset.id]),
      () => publishRequest(addPublish, randomUUID())
    );
    expect([addedBeforePublish.status, publishedAfterAdd.status]).toEqual([200, 200]);
    expect(publishedAfterAdd.body.photoCount).toBe(2);

    const deletePublish = await createClosedAlbumFixture('delete-publish');
    const [deletedBeforePublish, rejectedPublishWithoutPhotos] = await startOrderedBehindVerifiedEventLock(
      deletePublish.eventId,
      () => deletePhotoRequest(deletePublish, deletePublish.photoId),
      () => publishRequest(deletePublish, randomUUID())
    );
    expect([deletedBeforePublish.status, rejectedPublishWithoutPhotos.status]).toEqual([204, 409]);

    const editPublish = await createClosedAlbumFixture('edit-publish');
    const [editedBeforePublish, publishedAfterEdit] = await startOrderedBehindVerifiedEventLock(
      editPublish.eventId,
      () =>
        request(app.getHttpServer())
          .patch(`/api/v1/events/${editPublish.eventId}/album`)
          .set('Origin', origin)
          .set('Cookie', editPublish.cookie)
          .send({ title: 'ConfiguraciÃ³n concurrente' }),
      () => publishRequest(editPublish, randomUUID())
    );
    expect([editedBeforePublish.status, publishedAfterEdit.status]).toEqual([200, 200]);
    expect((await prisma.album.findUniqueOrThrow({ where: { eventId: editPublish.eventId } })).title).toBe(
      'ConfiguraciÃ³n concurrente'
    );

    const reversalPublish = await createClosedAlbumFixture('reversal-publish');
    const [revertedBeforePublish, publishedWithoutEligibility] = await startOrderedBehindVerifiedEventLock(
      reversalPublish.eventId,
      () => revertCheckInRequest(reversalPublish),
      () => publishRequest(reversalPublish, randomUUID())
    );
    expect([revertedBeforePublish.status, publishedWithoutEligibility.status]).toEqual([200, 200]);
    expect(publishedWithoutEligibility.body.eligibleInvitationCount).toBe(0);
    expect(
      await prisma.invitation.count({
        where: { eventId: reversalPublish.eventId, albumTokenNonce: { not: null } }
      })
    ).toBe(0);

    const publishReversal = await createClosedAlbumFixture('publish-reversal');
    const [publishedBeforeReversal, rejectedReversal] = await startOrderedBehindVerifiedEventLock(
      publishReversal.eventId,
      () => publishRequest(publishReversal, randomUUID()),
      () => revertCheckInRequest(publishReversal)
    );
    expect([publishedBeforeReversal.status, rejectedReversal.status]).toEqual([200, 409]);
    expect(
      await prisma.invitation.count({
        where: { eventId: publishReversal.eventId, albumTokenNonce: { not: null } }
      })
    ).toBe(1);

    const reopenPublish = await createClosedAlbumFixture('reopen-publish');
    const [reopenedBeforePublish, rejectedAfterReopen] = await startOrderedBehindVerifiedEventLock(
      reopenPublish.eventId,
      () => lifecycleRequest(reopenPublish, 'reopen'),
      () => publishRequest(reopenPublish, randomUUID())
    );
    expect([reopenedBeforePublish.status, rejectedAfterReopen.status]).toEqual([200, 409]);

    const publishReopen = await createClosedAlbumFixture('publish-reopen');
    const [publishedBeforeReopen, rejectedReopen] = await startOrderedBehindVerifiedEventLock(
      publishReopen.eventId,
      () => publishRequest(publishReopen, randomUUID()),
      () => lifecycleRequest(publishReopen, 'reopen')
    );
    expect([publishedBeforeReopen.status, rejectedReopen.status]).toEqual([200, 409]);

    const publishArchive = await createClosedAlbumFixture('publish-archive');
    const [publishedBeforeArchive, archivedAfterPublish] = await startOrderedBehindVerifiedEventLock(
      publishArchive.eventId,
      () => publishRequest(publishArchive, randomUUID()),
      () => lifecycleRequest(publishArchive, 'archive')
    );
    expect([publishedBeforeArchive.status, archivedAfterPublish.status]).toEqual([200, 200]);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: publishArchive.eventId } })).status).toBe(
      EventStatus.ARCHIVED
    );

    const sameKey = await createClosedAlbumFixture('same-key');
    const sharedKey = randomUUID();
    const sameKeyPublications = await startBehindVerifiedEventLock(sameKey.eventId, () => [
      publishRequest(sameKey, sharedKey),
      publishRequest(sameKey, sharedKey)
    ]);
    expect(sameKeyPublications.map(({ status }) => status)).toEqual([200, 200]);
    expect(sameKeyPublications[0].body).toEqual(sameKeyPublications[1].body);
    expect(await prisma.eventStateOperation.count({ where: { eventId: sameKey.eventId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: sameKey.eventId, action: 'ALBUM_PUBLISH' } })).toBe(1);

    const differentKeys = await createClosedAlbumFixture('different-keys');
    const differentKeyPublications = await startBehindVerifiedEventLock(differentKeys.eventId, () => [
      publishRequest(differentKeys, randomUUID()),
      publishRequest(differentKeys, randomUUID())
    ]);
    expect(differentKeyPublications.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.eventStateOperation.count({ where: { eventId: differentKeys.eventId } })).toBe(1);

    const unpublishArchive = await createPublishedFixture('unpublish-archive');
    const [unpublishedBeforeArchive, archivedAfterUnpublish] = await startOrderedBehindVerifiedEventLock(
      unpublishArchive.eventId,
      () => unpublishRequest(unpublishArchive, randomUUID()),
      () => lifecycleRequest(unpublishArchive, 'archive')
    );
    expect([unpublishedBeforeArchive.status, archivedAfterUnpublish.status]).toEqual([200, 200]);

    const unpublishExpiry = await createPublishedFixture('unpublish-expiry');
    const expiryClock = new Date(unpublishExpiry.expiresAt.getTime() + 1);
    const [expiredBeforeUnpublish, rejectedUnpublish] = await startOrderedBehindVerifiedEventLock(
      unpublishExpiry.eventId,
      () => albums.expirePublishedAlbums(expiryClock),
      () => unpublishRequest(unpublishExpiry, randomUUID())
    );
    expect(expiredBeforeUnpublish).toBeGreaterThanOrEqual(1);
    expect(rejectedUnpublish.status).toBe(409);

    const expiryArchive = await createPublishedFixture('expiry-archive');
    const [expiredBeforeArchive, rejectedArchive] = await startOrderedBehindVerifiedEventLock(
      expiryArchive.eventId,
      () => albums.expirePublishedAlbums(new Date(expiryArchive.expiresAt.getTime() + 1)),
      () => lifecycleRequest(expiryArchive, 'archive')
    );
    expect(expiredBeforeArchive).toBeGreaterThanOrEqual(1);
    expect(rejectedArchive.status).toBe(409);

    const accessUnpublish = await createPublishedFixture('access-unpublish');
    const [accessedBeforeUnpublish, unpublishedAfterAccess] = await startOrderedBehindVerifiedEventLock(
      accessUnpublish.eventId,
      () => request(app.getHttpServer()).get(accessUnpublish.albumPath),
      () => unpublishRequest(accessUnpublish, randomUUID())
    );
    expect([accessedBeforeUnpublish.status, unpublishedAfterAccess.status]).toEqual([200, 200]);
    await request(app.getHttpServer()).get(accessUnpublish.albumPath).expect(404);

    const accessArchive = await createPublishedFixture('access-archive');
    const [archivedBeforeAccess, rejectedAccessAfterArchive] = await startOrderedBehindVerifiedEventLock(
      accessArchive.eventId,
      () => lifecycleRequest(accessArchive, 'archive'),
      () => request(app.getHttpServer()).get(accessArchive.albumPath)
    );
    expect([archivedBeforeAccess.status, rejectedAccessAfterArchive.status]).toEqual([200, 404]);

    const accessExpiry = await createPublishedFixture('access-expiry');
    const [expiredBeforeAccess, rejectedAccessAfterExpiry] = await startOrderedBehindVerifiedEventLock(
      accessExpiry.eventId,
      () => albums.expirePublishedAlbums(new Date(accessExpiry.expiresAt.getTime() + 1)),
      () => request(app.getHttpServer()).get(accessExpiry.albumPath)
    );
    expect(expiredBeforeAccess).toBeGreaterThanOrEqual(1);
    expect(rejectedAccessAfterExpiry.status).toBe(404);
  }, 120_000);

  it('rolls back publication when audit fails and persists no token, state operation or partial state', async () => {
    const fixture = await createClosedAlbumFixture();
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/album/publish`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie)
      .set('Idempotency-Key', 'album-audit-rollback')
      .expect(500);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).status).toBe(EventStatus.CLOSED);
    expect((await prisma.album.findUniqueOrThrow({ where: { eventId: fixture.eventId } })).publishedAt).toBeNull();
    expect(await prisma.eventStateOperation.count({ where: { eventId: fixture.eventId } })).toBe(0);
    expect(await prisma.invitation.count({ where: { eventId: fixture.eventId, albumTokenNonce: { not: null } } })).toBe(
      0
    );
  });

  function publishRequest(fixture: { eventId: string; cookie: string[] }, key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/album/publish`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie)
      .set('Idempotency-Key', key);
  }

  function unpublishRequest(fixture: { eventId: string; cookie: string[] }, key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/album/unpublish`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie)
      .set('Idempotency-Key', key);
  }

  function lifecycleRequest(fixture: { eventId: string; cookie: string[] }, action: 'reopen' | 'archive') {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/${action}`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie)
      .set('Idempotency-Key', randomUUID())
      .send({});
  }

  function addPhotosRequest(fixture: { eventId: string; cookie: string[] }, fileAssetIds: string[]) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/album/photos`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie)
      .send({ fileAssetIds });
  }

  function deletePhotoRequest(fixture: { eventId: string; cookie: string[] }, photoId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/events/${fixture.eventId}/album/photos/${photoId}`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie);
  }

  function revertCheckInRequest(fixture: { eventId: string; checkInId: string; cookie: string[] }) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/check-ins/${fixture.checkInId}/revert`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie)
      .set('Idempotency-Key', randomUUID())
      .send({});
  }

  async function createPublishedFixture(label: string) {
    const fixture = await createClosedAlbumFixture(label);
    const published = await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/album/publish`)
      .set('Origin', origin)
      .set('Cookie', fixture.cookie)
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    const view = await publicInvitation(fixture.invitationToken).expect(200);
    return {
      ...fixture,
      expiresAt: new Date(published.body.expiresAt as string),
      albumPath: view.body.album.contentPath as string
    };
  }

  async function createClosedAlbumFixture(label = 'closed') {
    const fixture = await createTechnicalEvent(ServiceCode.FLYER, EventStatus.ACTIVE);
    const cookie = await login(fixture.email);
    await createAlbumHttp(fixture.eventId, cookie).expect(201);
    const asset = await createReadyAlbumAsset(fixture, 1);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/album/photos`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ fileAssetIds: [asset.id] })
      .expect(200);
    const contact = await prisma.contact.create({
      data: {
        eventId: fixture.eventId,
        name: `Contacto ${label}`,
        whatsappPhoneNormalized: `+5255${String(Math.floor(Math.random() * 10 ** 8)).padStart(8, '0')}`
      }
    });
    const invitation = await prisma.invitation.create({
      data: {
        eventId: fixture.eventId,
        contactId: contact.id,
        invitationTokenNonce: 'a'.repeat(32) + randomUUID().replaceAll('-', '').slice(0, 32),
        qrTokenNonce: 'b'.repeat(32) + randomUUID().replaceAll('-', '').slice(0, 32),
        responseStatus: 'CONFIRMED',
        assistants: {
          create: {
            name: `Asistente ${label}`,
            isPrimary: true,
            responseStatus: 'CONFIRMED'
          }
        }
      },
      include: { assistants: true }
    });
    const staff = await prisma.staffToken.create({
      data: {
        eventId: fixture.eventId,
        tokenDigestSha256: randomUUID().replaceAll('-', '').repeat(2),
        tokenVersion: 1,
        alias: 'technical',
        createdByUserId: fixture.userId
      }
    });
    const checkedInAt = new Date();
    const checkIn = await prisma.checkIn.create({
      data: {
        eventId: fixture.eventId,
        invitationId: invitation.id,
        assistantId: invitation.assistants[0]!.id,
        staffTokenId: staff.id,
        checkedInAt,
        createdAt: checkedInAt,
        idempotencyKey: randomUUID(),
        requestSignature: 'c'.repeat(64),
        resultSnapshot: {}
      }
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await transaction.event.update({
        where: { id: fixture.eventId },
        data: { status: EventStatus.CLOSED }
      });
    });
    const album = await prisma.album.findUniqueOrThrow({
      where: { eventId: fixture.eventId },
      include: { photos: { where: { deletedAt: null } } }
    });
    return {
      ...fixture,
      cookie,
      albumId: album.id,
      photoId: album.photos[0]!.id,
      fileAssetId: asset.id,
      invitationId: invitation.id,
      assistantId: invitation.assistants[0]!.id,
      checkInId: checkIn.id,
      invitationToken: invitationTokens.issue(
        'INVITATION',
        invitation.id,
        invitation.invitationTokenNonce,
        invitation.invitationTokenVersion
      )
    };
  }

  async function createTechnicalEvent(
    serviceCode: ServiceCode,
    status: EventStatus,
    providedOwner?: { clientId: string; userId: string; email: string }
  ) {
    const owner = providedOwner ?? (await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER));
    const service = await createService(serviceCode);
    const activated =
      status === EventStatus.ACTIVE ||
      status === EventStatus.EVENT_DAY ||
      status === EventStatus.CLOSED ||
      status === EventStatus.ALBUM_PUBLISHED ||
      status === EventStatus.ARCHIVED;
    const event = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      return transaction.event.create({
        data: {
          clientId: owner.clientId,
          createdByUserId: owner.userId,
          serviceId: service.id,
          name: `Evento ${serviceCode}`,
          socialType: EventSocialType.OTHER,
          status,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: 100,
          ...(activated
            ? {
                activatedAt: new Date(),
                activatedByUserId: owner.userId,
                activatedServiceId: service.id,
                activatedServicePriceId: randomUUID(),
                baseCostCredits: 0,
                promotionDiscountCredits: 0,
                finalCostCredits: 0,
                purchasedCreditsUsed: 0,
                creditLineCreditsUsed: 0,
                activationReceiptId: randomUUID(),
                activationIdempotencyKey: `album-fixture-${randomUUID()}`
              }
            : {})
        }
      });
    });
    return { ...owner, eventId: event.id };
  }

  async function createReadyAlbumAsset(
    fixture: { clientId: string; userId: string; eventId: string },
    index: number,
    overrides: {
      mimeType?: string;
      status?: FileAssetStatus;
      checksumSha256?: string | null;
    } = {}
  ) {
    return prisma.fileAsset.create({
      data: {
        clientId: fixture.clientId,
        eventId: fixture.eventId,
        ownerType: FileAssetOwnerType.ALBUM_PHOTO,
        fileType: FileAssetType.ALBUM_PHOTO_IMAGE,
        storageProvider: StorageProvider.LOCAL,
        storageKey: `album-test/${randomUUID()}.png`,
        originalName: `${index}.png`,
        mimeType: overrides.mimeType ?? 'image/png',
        sizeBytes: image.length,
        checksumSha256: overrides.checksumSha256 === undefined ? 'd'.repeat(64) : overrides.checksumSha256,
        width: 32,
        height: 24,
        createdByUserId: fixture.userId,
        status: overrides.status ?? FileAssetStatus.READY
      }
    });
  }

  async function createClientUser(type: ClientType, role: UserRole) {
    const client = await prisma.client.create({
      data: { type, name: `Cliente ${randomUUID()}`, status: ClientStatus.ACTIVE }
    });
    const user = await createUser(client.id, role);
    return { clientId: client.id, userId: user.id, email: user.email };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    return prisma.user.create({
      data: {
        clientId,
        role,
        email: `${randomUUID()}@example.test`,
        passwordHash: await hashPassword(password)
      }
    });
  }

  async function createService(code: ServiceCode) {
    return (
      (await prisma.service.findUnique({ where: { code } })) ??
      (await prisma.service.create({ data: { code, isActive: true } }))
    );
  }

  async function createFreePrice(serviceId: string) {
    return prisma.servicePrice.create({
      data: {
        serviceId,
        clientType: ClientType.PLANNER,
        credits: 0,
        validFrom: new Date(Date.now() - 60_000)
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

  function createAlbumHttp(eventId: string, cookie: string[]) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/album`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({
        title: 'Nuestro gran día',
        thankYouMessage: 'Gracias por acompañarnos',
        theme,
        externalButton: { label: 'Ver video', url: 'https://example.com/video' }
      });
  }

  function uploadImage(
    eventId: string,
    cookie: string[],
    ownerType: 'FLYER' | 'ALBUM_PHOTO',
    fileType: 'FLYER_INITIAL_IMAGE' | 'FLYER_QR_IMAGE' | 'ALBUM_PHOTO_IMAGE',
    format: 'png' | 'jpeg' = 'png'
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/file-assets`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .field('ownerType', ownerType)
      .field('fileType', fileType)
      .attach('file', format === 'jpeg' ? jpegImage : image, {
        filename: `album.${format}`,
        contentType: `image/${format}`
      });
  }

  function publicInvitation(token: string) {
    return request(app.getHttpServer()).get(`/api/v1/public/invitations/${encodeURIComponent(token)}`);
  }

  async function startBehindVerifiedEventLock<A, B>(
    eventId: string,
    start: () => [PromiseLike<A>, PromiseLike<B>]
  ): Promise<[Awaited<A>, Awaited<B>]> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    const blocker = new PgClient({ connectionString: databaseUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT "id" FROM "event" WHERE "id" = $1::uuid FOR UPDATE', [eventId]);
      const operations = start().map((operation) => Promise.resolve(operation)) as [
        Promise<Awaited<A>>,
        Promise<Awaited<B>>
      ];
      await waitForLockWaiters(2);
      await blocker.query('COMMIT');
      return await Promise.all(operations);
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      await blocker.end();
    }
  }

  async function startOrderedBehindVerifiedEventLock<A, B>(
    eventId: string,
    first: () => PromiseLike<A>,
    second: () => PromiseLike<B>
  ): Promise<[Awaited<A>, Awaited<B>]> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    const blocker = new PgClient({ connectionString: databaseUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT "id" FROM "event" WHERE "id" = $1::uuid FOR UPDATE', [eventId]);
      const firstOperation = Promise.resolve(first());
      await waitForLockWaiters(1);
      const secondOperation = Promise.resolve(second());
      await waitForLockWaiters(2);
      await blocker.query('COMMIT');
      return await Promise.all([firstOperation, secondOperation]);
    } finally {
      await blocker.query('ROLLBACK').catch(() => undefined);
      await blocker.end();
    }
  }

  async function waitForLockWaiters(expected: number): Promise<void> {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS "count"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
      `;
      if (Number(rows[0]?.count ?? 0) >= expected) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`Expected ${expected} verified PostgreSQL lock waiters.`);
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "album_photo", "album", "physical_pass_generation_operation", "physical_pass", "staff_token",
        "hotspot", "flipbook_page", "invitation_design", "file_asset", "check_in", "assistant", "invitation",
        "contact_import_preview", "contact", "contact_group", "event_state_operation", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});

const theme = {
  backgroundColor: '#FFFFFF',
  textColor: '#111111',
  accentColor: '#C5A46D'
};
