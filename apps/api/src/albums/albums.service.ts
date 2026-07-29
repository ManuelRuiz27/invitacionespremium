import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import {
  AuditActorType,
  EventStateAction,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  Prisma,
  ServiceCode
} from '../generated/prisma/client';
import { FileAssetsService } from '../file-assets/file-assets.service';
import { FileStorage } from '../file-assets/file-storage';
import { albumError, albumNotFound } from './album-errors';
import { AlbumTokenService } from './album-token.service';
import type {
  AddAlbumPhotosInput,
  AlbumPublicationResponseDto,
  AlbumResponseDto,
  AlbumStatus,
  AlbumTheme,
  CreateAlbumInput,
  PublicAlbumResponseDto,
  UpdateAlbumInput
} from './albums.dto';

const MUTABLE_STATUSES = new Set<EventStatus>([EventStatus.ACTIVE, EventStatus.EVENT_DAY, EventStatus.CLOSED]);
const DIGITAL_SERVICES = new Set<ServiceCode>([ServiceCode.FLYER, ServiceCode.FLIPBOOK]);
const MAX_ATTEMPTS = 20;

const albumInclude = {
  event: { select: { status: true } },
  photos: {
    where: { deletedAt: null },
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
    include: { fileAsset: true }
  }
} satisfies Prisma.AlbumInclude;
type AlbumAggregate = Prisma.AlbumGetPayload<{ include: typeof albumInclude }>;

@Injectable()
export class AlbumsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly access: EventAccessPolicy,
    @Inject(FileAssetsService) private readonly fileAssets: FileAssetsService,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(AlbumTokenService) private readonly tokens: AlbumTokenService
  ) {}

  async get(eventId: string, principal: AuthPrincipal): Promise<AlbumResponseDto> {
    await this.requireOwnedEvent(this.prisma, eventId, principal);
    return toAlbumResponse(await this.requireAlbum(this.prisma, eventId));
  }

  async create(
    eventId: string,
    input: CreateAlbumInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<AlbumResponseDto> {
    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await this.requireOwnedEvent(tx, eventId, principal);
      assertMutableEvent(event);
      if (await tx.album.findUnique({ where: { eventId } })) {
        throw albumError('ALBUM_ALREADY_EXISTS', 'An Album already exists for this Event.');
      }
      const album = await tx.album.create({
        data: {
          eventId,
          title: input.title,
          thankYouMessage: input.thankYouMessage ?? null,
          themeSettings: input.theme,
          externalButtonLabel: input.externalButton?.label ?? null,
          externalUrl: input.externalButton?.url ?? null,
          createdByUserId: principal.userId
        },
        include: albumInclude
      });
      await this.audit.record(
        albumAudit(
          principal,
          event.clientId,
          eventId,
          album.id,
          'ALBUM_CREATE',
          {
            albumId: album.id,
            themeKeys: Object.keys(input.theme).sort(),
            externalButtonEnabled: input.externalButton !== null && input.externalButton !== undefined
          },
          operationId
        ),
        tx
      );
      return toAlbumResponse(album);
    });
  }

  async update(
    eventId: string,
    input: UpdateAlbumInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<AlbumResponseDto> {
    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await this.requireOwnedEvent(tx, eventId, principal);
      assertMutableEvent(event);
      await lockAlbum(tx, eventId);
      const current = await this.requireAlbum(tx, eventId);
      const album = await tx.album.update({
        where: { id: current.id },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.thankYouMessage === undefined ? {} : { thankYouMessage: input.thankYouMessage }),
          ...(input.theme === undefined ? {} : { themeSettings: input.theme }),
          ...(input.externalButton === undefined
            ? {}
            : {
                externalButtonLabel: input.externalButton?.label ?? null,
                externalUrl: input.externalButton?.url ?? null
              })
        },
        include: albumInclude
      });
      await this.audit.record(
        albumAudit(
          principal,
          event.clientId,
          eventId,
          album.id,
          'ALBUM_UPDATE',
          {
            albumId: album.id,
            ...(input.theme ? { themeKeys: Object.keys(input.theme).sort() } : {}),
            ...(input.externalButton === undefined ? {} : { externalButtonEnabled: input.externalButton !== null })
          },
          operationId
        ),
        tx
      );
      return toAlbumResponse(album);
    });
  }

  async addPhotos(
    eventId: string,
    input: AddAlbumPhotosInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<AlbumResponseDto> {
    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await this.requireOwnedEvent(tx, eventId, principal);
      assertMutableEvent(event);
      await lockAlbum(tx, eventId);
      const album = await this.requireAlbum(tx, eventId);
      await lockAlbumPhotos(tx, album.id);
      const activeCount = album.photos.length;
      if (activeCount + input.fileAssetIds.length > 35) {
        throw albumError('ALBUM_PHOTO_LIMIT_EXCEEDED', 'An Album supports at most 35 active photos.');
      }

      for (const [offset, fileAssetId] of [...input.fileAssetIds].sort().entries()) {
        const photoId = randomUUID();
        await tx.albumPhoto.create({
          data: {
            id: photoId,
            albumId: album.id,
            eventId,
            fileAssetId,
            position: activeCount + offset + 1
          }
        });
        await this.fileAssets.claimReadyAssetInTransaction(
          tx,
          fileAssetId,
          { ownerType: FileAssetOwnerType.ALBUM_PHOTO, ownerId: photoId },
          principal.userId,
          operationId
        );
      }
      await this.audit.record(
        albumAudit(
          principal,
          event.clientId,
          eventId,
          album.id,
          'ALBUM_PHOTOS_ADD',
          {
            albumId: album.id,
            photoCount: input.fileAssetIds.length
          },
          operationId
        ),
        tx
      );
      return toAlbumResponse(await this.requireAlbum(tx, eventId));
    });
  }

  async deletePhoto(eventId: string, photoId: string, principal: AuthPrincipal, operationId?: string): Promise<void> {
    await this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await this.requireOwnedEvent(tx, eventId, principal);
      assertMutableEvent(event);
      await lockAlbum(tx, eventId);
      const album = await this.requireAlbum(tx, eventId);
      await lockAlbumPhotos(tx, album.id);
      const photo = album.photos.find((candidate) => candidate.id === photoId);
      if (!photo) throw albumNotFound();
      await tx.albumPhoto.update({ where: { id: photo.id }, data: { deletedAt: new Date() } });
      for (const remaining of album.photos.filter(({ position }) => position > photo.position)) {
        await tx.albumPhoto.update({
          where: { id: remaining.id },
          data: { position: remaining.position - 1 }
        });
      }
      await this.fileAssets.hideOwnedAssetInTransaction(
        tx,
        photo.fileAssetId,
        { ownerType: FileAssetOwnerType.ALBUM_PHOTO, ownerId: photo.id },
        principal.userId,
        operationId
      );
      await this.audit.record(
        albumAudit(
          principal,
          event.clientId,
          eventId,
          album.id,
          'ALBUM_PHOTO_DELETE',
          {
            albumId: album.id,
            photoId: photo.id,
            position: photo.position
          },
          operationId
        ),
        tx
      );
    });
  }

  publish(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<AlbumPublicationResponseDto> {
    return this.changePublication(eventId, EventStateAction.PUBLISH_ALBUM, idempotencyKey, principal, operationId);
  }

  unpublish(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<AlbumPublicationResponseDto> {
    return this.changePublication(eventId, EventStateAction.UNPUBLISH_ALBUM, idempotencyKey, principal, operationId);
  }

  async expirePublishedAlbums(at: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.album.findMany({
      where: {
        deletedAt: null,
        expiresAt: { lte: at },
        event: { status: EventStatus.ALBUM_PUBLISHED, deletedAt: null }
      },
      select: { eventId: true, expiresAt: true },
      orderBy: { eventId: 'asc' }
    });
    let expired = 0;
    for (const candidate of candidates) {
      if (candidate.expiresAt && (await this.expireOne(candidate.eventId, candidate.expiresAt, at))) expired += 1;
    }
    return expired;
  }

  async resolvePublic(albumToken: string, at: Date = new Date()): Promise<PublicAlbumResponseDto> {
    return this.serializable(async (tx) => {
      const context = await this.resolvePublicContext(tx, albumToken, at);
      const encodedToken = encodeURIComponent(albumToken);
      return {
        status: 'AVAILABLE',
        event: { name: context.event.name },
        album: {
          title: context.album.title,
          thankYouMessage: context.album.thankYouMessage,
          theme: context.album.themeSettings as AlbumTheme,
          externalButton:
            context.album.externalButtonLabel && context.album.externalUrl
              ? { label: context.album.externalButtonLabel, url: context.album.externalUrl }
              : null,
          publishedAt: context.album.publishedAt!.toISOString(),
          expiresAt: context.album.expiresAt!.toISOString(),
          photos: context.album.photos.map((photo) => ({
            id: photo.id,
            position: photo.position,
            contentPath: `/api/v1/public/albums/${encodedToken}/photos/${photo.id}/content`
          }))
        }
      };
    });
  }

  async publicPhotoContent(albumToken: string, photoId: string, at: Date = new Date()) {
    const asset = await this.serializable(async (tx) => {
      const context = await this.resolvePublicContext(tx, albumToken, at);
      const photo = context.album.photos.find((candidate) => candidate.id === photoId);
      if (!photo || !photo.fileAsset.checksumSha256) throw albumNotFound();
      return {
        storageKey: photo.fileAsset.storageKey,
        mimeType: photo.fileAsset.mimeType,
        sizeBytes: photo.fileAsset.sizeBytes,
        etag: `"sha256-${photo.fileAsset.checksumSha256.slice(0, 32)}"`
      };
    });
    try {
      return { ...asset, bytes: await this.storage.read(asset.storageKey) };
    } catch {
      throw albumError(
        'FILE_STORAGE_FAILURE',
        'The requested Album photo is temporarily unavailable.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async changePublication(
    eventId: string,
    action: EventStateAction,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<AlbumPublicationResponseDto> {
    await this.requireOwnedEvent(this.prisma, eventId, principal, true);
    const replay = await this.findPublicationResult(this.prisma, eventId, action, idempotencyKey);
    if (replay) return replay;

    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await this.requireOwnedEvent(tx, eventId, principal);
      const repeated = await this.findPublicationResult(tx, eventId, action, idempotencyKey);
      if (repeated) return repeated;
      assertDigitalService(event.service?.code);
      await lockAlbum(tx, eventId);
      const album = await this.requireAlbum(tx, eventId);
      await lockAlbumPhotos(tx, album.id);
      await lockAlbumFileAssets(tx, album.id);
      await lockAlbumInvitationContext(tx, eventId);

      let result: AlbumPublicationResponseDto;
      if (action === EventStateAction.PUBLISH_ALBUM) {
        if (event.status !== EventStatus.CLOSED) {
          throw albumError('ALBUM_EVENT_STATE_INVALID', 'Album publication requires a closed Event.');
        }
        if (
          album.photos.length < 1 ||
          album.photos.length > 35 ||
          album.photos.some(
            ({ fileAsset }) =>
              fileAsset.status !== FileAssetStatus.READY ||
              fileAsset.deletedAt !== null ||
              !['image/jpeg', 'image/png'].includes(fileAsset.mimeType)
          )
        ) {
          throw albumError('ALBUM_NOT_READY', 'Album requires between 1 and 35 ready photos.');
        }
        const [clock] = await tx.$queryRaw<Array<{ now: Date; expiresAt: Date }>>`
          SELECT "now", "now" + interval '30 days' AS "expiresAt"
          FROM (SELECT clock_timestamp() AS "now") publication_clock
        `;
        if (!clock) throw new Error('PostgreSQL did not return the Album publication clock.');
        const { now, expiresAt } = clock;
        const eligible = await eligibleInvitationIds(tx, eventId);
        await tx.invitation.updateMany({
          where: { eventId },
          data: { albumTokenNonce: null, albumTokenVersion: null, albumAccessExpiresAt: null }
        });
        for (const invitationId of eligible) {
          await tx.invitation.update({
            where: { id: invitationId },
            data: {
              albumTokenNonce: this.tokens.createNonce(),
              albumTokenVersion: 1,
              albumAccessExpiresAt: expiresAt
            }
          });
        }
        await tx.album.update({ where: { id: album.id }, data: { publishedAt: now, expiresAt } });
        await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.ALBUM_PUBLISHED } });
        result = {
          eventId,
          albumId: album.id,
          status: 'PUBLISHED',
          publishedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          photoCount: album.photos.length,
          eligibleInvitationCount: eligible.length
        };
      } else {
        if (event.status !== EventStatus.ALBUM_PUBLISHED) {
          throw albumError('ALBUM_EVENT_STATE_INVALID', 'Only a published Album can be unpublished.');
        }
        await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.CLOSED } });
        await tx.invitation.updateMany({
          where: { eventId },
          data: { albumTokenNonce: null, albumTokenVersion: null, albumAccessExpiresAt: null }
        });
        await tx.album.update({ where: { id: album.id }, data: { publishedAt: null, expiresAt: null } });
        result = {
          eventId,
          albumId: album.id,
          status: 'DRAFT',
          publishedAt: null,
          expiresAt: null,
          photoCount: album.photos.length,
          eligibleInvitationCount: 0
        };
      }

      await this.audit.record(
        albumAudit(
          principal,
          event.clientId,
          eventId,
          album.id,
          action === EventStateAction.PUBLISH_ALBUM ? 'ALBUM_PUBLISH' : 'ALBUM_UNPUBLISH',
          {
            albumId: album.id,
            photoCount: result.photoCount,
            publishedAt: result.publishedAt,
            expiresAt: result.expiresAt,
            eligibleInvitationCount: result.eligibleInvitationCount
          },
          operationId
        ),
        tx
      );
      await tx.eventStateOperation.create({
        data: {
          eventId,
          action,
          idempotencyKey,
          resultSnapshot: result as unknown as Prisma.InputJsonObject
        }
      });
      return result;
    });
  }

  private async expireOne(eventId: string, expiresAt: Date, at: Date): Promise<boolean> {
    const key = `system:album-expiry:${eventId}:${expiresAt.toISOString()}`;
    return this.serializable(async (tx) => {
      await lockEvent(tx, eventId);
      const event = await tx.event.findFirst({
        where: { id: eventId, status: EventStatus.ALBUM_PUBLISHED, deletedAt: null },
        include: { album: true }
      });
      if (!event?.album?.expiresAt || event.album.expiresAt > at) return false;
      const prior = await tx.eventStateOperation.findUnique({ where: { idempotencyKey: key } });
      if (prior) return false;
      await lockAlbum(tx, eventId);
      await lockAlbumInvitationContext(tx, eventId);
      await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.ARCHIVED } });
      await tx.invitation.updateMany({
        where: { eventId },
        data: { albumTokenNonce: null, albumTokenVersion: null, albumAccessExpiresAt: null }
      });
      await this.audit.record(
        {
          actor: { type: AuditActorType.SYSTEM },
          clientId: event.clientId,
          eventId,
          resourceType: 'ALBUM',
          resourceId: event.album.id,
          action: 'ALBUM_EXPIRE',
          metadata: {
            albumId: event.album.id,
            publishedAt: event.album.publishedAt?.toISOString() ?? null,
            expiresAt: event.album.expiresAt.toISOString()
          }
        },
        tx
      );
      await tx.eventStateOperation.create({
        data: {
          eventId,
          action: EventStateAction.EXPIRE_ALBUM,
          idempotencyKey: key,
          resultSnapshot: {
            eventId,
            albumId: event.album.id,
            status: 'ARCHIVED',
            expiresAt: event.album.expiresAt.toISOString()
          }
        }
      });
      return true;
    });
  }

  private async resolvePublicContext(tx: Prisma.TransactionClient, token: string, at: Date) {
    const verified = this.tokens.verify(token);
    if (!verified) throw albumNotFound();
    await lockEventByAlbum(tx, verified.albumId);
    await tx.$queryRaw`SELECT "id" FROM "album" WHERE "id" = ${verified.albumId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "invitation" WHERE "id" = ${verified.invitationId}::uuid FOR UPDATE`;
    const album = await tx.album.findFirst({
      where: {
        id: verified.albumId,
        deletedAt: null,
        publishedAt: { not: null },
        expiresAt: { gt: at },
        event: { status: EventStatus.ALBUM_PUBLISHED, deletedAt: null }
      },
      include: {
        event: { select: { id: true, name: true } },
        photos: {
          where: { deletedAt: null },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: { fileAsset: true }
        }
      }
    });
    if (
      !album ||
      !album.event.name ||
      !album.publishedAt ||
      !album.expiresAt ||
      album.photos.length < 1 ||
      album.photos.some(
        (photo) =>
          photo.fileAsset.status !== FileAssetStatus.READY ||
          photo.fileAsset.deletedAt !== null ||
          !['image/jpeg', 'image/png'].includes(photo.fileAsset.mimeType)
      )
    ) {
      throw albumNotFound();
    }
    const invitation = await tx.invitation.findFirst({
      where: {
        id: verified.invitationId,
        eventId: album.event.id,
        albumTokenNonce: verified.nonce,
        albumTokenVersion: verified.version,
        albumAccessExpiresAt: { gt: at },
        cancelledAt: null,
        deletedAt: null,
        contact: { deletedAt: null },
        assistants: {
          some: {
            deletedAt: null,
            checkIns: { some: { revertedAt: null } }
          }
        }
      },
      select: { id: true }
    });
    if (!invitation) throw albumNotFound();
    return { album, event: { name: album.event.name } };
  }

  private async requireOwnedEvent(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal,
    includeDeleted = false
  ) {
    const event = await database.event.findFirst({
      where: {
        id: eventId,
        ...this.access.ownedWhere(principal),
        ...(includeDeleted ? {} : { deletedAt: null })
      },
      include: { service: { select: { code: true } } }
    });
    if (!event) throw eventNotFound();
    return event;
  }

  private async requireAlbum(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string
  ): Promise<AlbumAggregate> {
    const album = await database.album.findFirst({ where: { eventId, deletedAt: null }, include: albumInclude });
    if (!album) throw albumNotFound();
    return album;
  }

  private async findPublicationResult(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string,
    action: EventStateAction,
    idempotencyKey: string
  ): Promise<AlbumPublicationResponseDto | null> {
    const operation = await database.eventStateOperation.findUnique({ where: { idempotencyKey } });
    if (!operation) return null;
    if (operation.eventId !== eventId || operation.action !== action) {
      throw albumError(
        'EVENT_STATE_IDEMPOTENCY_CONFLICT',
        'Idempotency key is already assigned to another Event state action.'
      );
    }
    return operation.resultSnapshot as unknown as AlbumPublicationResponseDto;
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isRetryable(error) && attempt < MAX_ATTEMPTS - 1) continue;
        throw mapAlbumDatabaseError(error);
      }
    }
    throw albumError('ALBUM_CONCURRENCY_CONFLICT', 'Album operation could not be serialized.');
  }
}

function assertMutableEvent(event: { status: EventStatus; service: { code: ServiceCode } | null }): void {
  assertDigitalService(event.service?.code);
  if (!MUTABLE_STATUSES.has(event.status)) {
    throw albumError('ALBUM_EVENT_STATE_INVALID', 'Album cannot be modified in the current Event state.');
  }
}

function assertDigitalService(service: ServiceCode | undefined): void {
  if (!service || !DIGITAL_SERVICES.has(service)) {
    throw albumError('ALBUM_SERVICE_NOT_SUPPORTED', 'Album is only available for Flyer and Flipbook Events.');
  }
}

async function lockEvent(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
}
async function lockEventByAlbum(tx: Prisma.TransactionClient, albumId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT e."id" FROM "event" e
    JOIN "album" a ON a."event_id" = e."id"
    WHERE a."id" = ${albumId}::uuid
    FOR UPDATE OF e
  `;
}
async function lockAlbum(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "album" WHERE "event_id" = ${eventId}::uuid FOR UPDATE`;
}
async function lockAlbumPhotos(tx: Prisma.TransactionClient, albumId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT "id" FROM "album_photo"
    WHERE "album_id" = ${albumId}::uuid
    ORDER BY "id" FOR UPDATE
  `;
}
async function lockAlbumFileAssets(tx: Prisma.TransactionClient, albumId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT f."id" FROM "file_asset" f
    JOIN "album_photo" p ON p."file_asset_id" = f."id"
    WHERE p."album_id" = ${albumId}::uuid AND p."deleted_at" IS NULL
    ORDER BY f."id" FOR UPDATE OF f
  `;
}
async function lockAlbumInvitationContext(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
  await tx.$queryRaw`
    SELECT "id" FROM "invitation"
    WHERE "event_id" = ${eventId}::uuid
    ORDER BY "id" FOR UPDATE
  `;
  await tx.$queryRaw`
    SELECT "id" FROM "assistant"
    WHERE "event_id" = ${eventId}::uuid
    ORDER BY "id" FOR UPDATE
  `;
  await tx.$queryRaw`
    SELECT "id" FROM "check_in"
    WHERE "event_id" = ${eventId}::uuid
    ORDER BY "id" FOR UPDATE
  `;
}

async function eligibleInvitationIds(tx: Prisma.TransactionClient, eventId: string): Promise<string[]> {
  const invitations = await tx.invitation.findMany({
    where: {
      eventId,
      deletedAt: null,
      cancelledAt: null,
      contact: { deletedAt: null },
      assistants: { some: { deletedAt: null, checkIns: { some: { revertedAt: null } } } }
    },
    select: { id: true },
    orderBy: { id: 'asc' }
  });
  return invitations.map(({ id }) => id);
}

function toAlbumResponse(album: AlbumAggregate): AlbumResponseDto {
  return {
    id: album.id,
    eventId: album.eventId,
    title: album.title,
    thankYouMessage: album.thankYouMessage,
    theme: album.themeSettings as AlbumTheme,
    externalButton:
      album.externalButtonLabel && album.externalUrl
        ? { label: album.externalButtonLabel, url: album.externalUrl }
        : null,
    status: albumStatus(album),
    publishedAt: album.publishedAt?.toISOString() ?? null,
    expiresAt: album.expiresAt?.toISOString() ?? null,
    photos: album.photos.map((photo) => ({
      id: photo.id,
      position: photo.position,
      contentPath: `/api/v1/events/${album.eventId}/file-assets/${photo.fileAssetId}/content`
    })),
    createdAt: album.createdAt.toISOString(),
    updatedAt: album.updatedAt.toISOString()
  };
}

function albumStatus(album: Pick<AlbumAggregate, 'event' | 'publishedAt' | 'expiresAt'>): AlbumStatus {
  if (album.event.status === EventStatus.ARCHIVED) return 'ARCHIVED';
  if (album.event.status === EventStatus.ALBUM_PUBLISHED && album.publishedAt && album.expiresAt) return 'PUBLISHED';
  return 'DRAFT';
}

function albumAudit(
  principal: AuthPrincipal,
  clientId: string,
  eventId: string,
  albumId: string,
  action: string,
  metadata: Prisma.InputJsonObject,
  operationId?: string
) {
  return {
    actor: { type: AuditActorType.USER, id: principal.userId },
    clientId,
    eventId,
    resourceType: 'ALBUM',
    resourceId: albumId,
    action,
    metadata,
    ...(operationId ? { operationId } : {})
  };
}

function mapAlbumDatabaseError(error: unknown): unknown {
  const message = databaseMessage(error);
  const mappings: Array<[string, string, string]> = [
    ['album_service_compatible', 'ALBUM_SERVICE_NOT_SUPPORTED', 'Album is not supported by the Event service.'],
    ['album_event_state', 'ALBUM_EVENT_STATE_INVALID', 'Album cannot be modified in the current Event state.'],
    ['album_photo_active_limit', 'ALBUM_PHOTO_LIMIT_EXCEEDED', 'An Album supports at most 35 active photos.'],
    ['album_photo_file_asset_compatible', 'ALBUM_PHOTO_FILE_ASSET_INVALID', 'Album photo FileAsset is invalid.'],
    ['event_album_published_valid', 'ALBUM_NOT_READY', 'Album is not ready for publication.'],
    ['album_invitation_eligibility', 'ALBUM_ELIGIBILITY_INVALID', 'Album invitation eligibility is invalid.']
  ];
  for (const [needle, code, publicMessage] of mappings) {
    if (message.includes(needle)) return albumError(code, publicMessage);
  }
  if (hasCode(error, 'P2002')) return albumError('ALBUM_CONFLICT', 'Album operation conflicts with existing data.');
  return error;
}

function databaseMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  return JSON.stringify(error).toLowerCase();
}
function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
function isRetryable(error: unknown): boolean {
  if (hasCode(error, 'P2034')) return true;
  const message = databaseMessage(error);
  return message.includes('40001') || message.includes('40p01') || message.includes('transactionwriteconflict');
}
