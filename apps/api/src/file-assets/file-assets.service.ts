import { createHash } from 'node:crypto';
import path from 'node:path';
import { ConflictException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { activeWhere } from '../common/persistence/soft-delete.repository';
import { AppConfigService } from '../config/app-config.service';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import {
  AuditActorType,
  EventStatus,
  FileAssetStatus,
  FileAssetType,
  StorageProvider,
  type FileAsset
} from '../generated/prisma/client';
import { assertCompatibleFileAssetType, USER_IMAGE_FILE_TYPES } from './file-asset-compatibility';
import { FileAssetOwnerRegistry, type FileAssetOwnerReference, ownerMismatch } from './file-asset-owner.registry';
import { FileImageValidator } from './file-image-validator';
import { FileStorage } from './file-storage';
import type { FileAssetResponseDto, UploadFileAssetInput } from './file-assets.dto';

const UPLOAD_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
]);
const GENERATED_FILE_TYPES = new Set<FileAssetType>([
  FileAssetType.GENERATED_REPORT_PDF,
  FileAssetType.INVITATION_QR_SVG,
  FileAssetType.PHYSICAL_PASS_QR_SVG
]);

export interface UploadedImageFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface FileAssetContent {
  bytes: Buffer;
  mimeType: string;
  sizeBytes: number;
  etag: string;
}

export interface CreateGeneratedAssetInput {
  owner: FileAssetOwnerReference;
  fileType: FileAssetType;
  bytes: Buffer;
  mimeType: 'application/pdf' | 'image/svg+xml';
  originalName: string;
  actorUserId: string;
  operationId?: string;
}

@Injectable()
export class FileAssetsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly eventAccess: EventAccessPolicy,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(FileImageValidator) private readonly imageValidator: FileImageValidator,
    @Inject(FileAssetOwnerRegistry) private readonly owners: FileAssetOwnerRegistry,
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  async uploadImage(
    eventId: string,
    input: UploadFileAssetInput,
    file: UploadedImageFile | undefined,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FileAssetResponseDto> {
    assertCompatibleFileAssetType(input.ownerType, input.fileType);
    if (!USER_IMAGE_FILE_TYPES.has(input.fileType) || !file) {
      throw fileError('FILE_UNSUPPORTED_TYPE', 'Only JPEG and PNG image uploads are accepted.');
    }
    const event = await this.requireOwnedEvent(eventId, principal);
    if (!UPLOAD_EVENT_STATUSES.has(event.status)) {
      throw new ConflictException({
        code: 'FILE_EVENT_STATE_LOCKED',
        message: 'File uploads are locked for the current Event state.'
      });
    }

    const storageKey = this.storage.generateKey();
    const staged = await this.prisma.fileAsset.create({
      data: {
        clientId: event.clientId,
        eventId,
        ownerType: input.ownerType,
        fileType: input.fileType,
        storageProvider: StorageProvider.LOCAL,
        storageKey,
        originalName: safeOriginalName(file.originalname),
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        createdByUserId: principal.userId,
        status: FileAssetStatus.UPLOADING
      }
    });

    let wroteBytes = false;
    try {
      const validated = await this.imageValidator.validate(file.buffer);
      await this.storage.write({ storageKey, bytes: validated.bytes });
      wroteBytes = true;
      const ready = await this.prisma.$transaction(async (transaction) => {
        const asset = await transaction.fileAsset.update({
          where: { id: staged.id },
          data: {
            mimeType: validated.mimeType,
            sizeBytes: validated.sizeBytes,
            checksumSha256: validated.checksumSha256,
            width: validated.width,
            height: validated.height,
            status: FileAssetStatus.READY
          }
        });
        await this.audit.record(
          fileAssetAudit(asset, principal.userId, 'FILE_ASSET_UPLOAD_READY', operationId),
          transaction
        );
        return asset;
      }, CRITICAL_TRANSACTION_OPTIONS);
      return toFileAssetResponse(ready);
    } catch (error) {
      if (wroteBytes) {
        await this.storage.delete(storageKey).catch(() => undefined);
      }
      await this.markFailed(staged, failureCode(error), principal.userId, operationId);
      throw error;
    }
  }

  async list(eventId: string, principal: AuthPrincipal): Promise<FileAssetResponseDto[]> {
    await this.requireOwnedEvent(eventId, principal);
    const assets = await this.prisma.fileAsset.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });
    return assets.map(toFileAssetResponse);
  }

  async get(eventId: string, fileAssetId: string, principal: AuthPrincipal): Promise<FileAssetResponseDto> {
    await this.requireOwnedEvent(eventId, principal);
    return toFileAssetResponse(await this.requireEventAsset(eventId, fileAssetId, false));
  }

  async content(eventId: string, fileAssetId: string, principal: AuthPrincipal): Promise<FileAssetContent> {
    await this.requireOwnedEvent(eventId, principal);
    const asset = await this.requireEventAsset(eventId, fileAssetId, false);
    if (asset.status !== FileAssetStatus.READY || !asset.checksumSha256) {
      throw new ConflictException({
        code: 'FILE_NOT_READY',
        message: 'File asset content is not available.'
      });
    }
    const bytes = await this.storage.read(asset.storageKey);
    return {
      bytes,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      etag: `"sha256-${asset.checksumSha256.slice(0, 32)}"`
    };
  }

  async softDelete(
    eventId: string,
    fileAssetId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<void> {
    await this.requireOwnedEvent(eventId, principal);
    const current = await this.requireEventAsset(eventId, fileAssetId, true);
    if (current.status === FileAssetStatus.DELETED) {
      return;
    }
    if (current.ownerId !== null) {
      throw new ConflictException({
        code: 'FILE_ASSET_ASSOCIATED',
        message: 'An associated file asset cannot be deleted through the generic endpoint.'
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      const asset = await transaction.fileAsset.update({
        where: { id: fileAssetId },
        data: {
          status: FileAssetStatus.DELETED,
          failureCode: null,
          deletedAt: new Date()
        }
      });
      await this.audit.record(
        fileAssetAudit(asset, principal.userId, 'FILE_ASSET_SOFT_DELETE', operationId),
        transaction
      );
    }, CRITICAL_TRANSACTION_OPTIONS);
  }

  async claimReadyAsset(
    fileAssetId: string,
    owner: FileAssetOwnerReference,
    actorUserId: string,
    operationId?: string
  ): Promise<FileAssetResponseDto> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "file_asset" WHERE "id" = ${fileAssetId}::uuid FOR UPDATE
      `;
      const asset = await transaction.fileAsset.findUnique({ where: { id: fileAssetId } });
      if (!asset || asset.status !== FileAssetStatus.READY || asset.deletedAt !== null) {
        throw ownerMismatch();
      }
      assertCompatibleFileAssetType(owner.ownerType, asset.fileType);
      if (asset.ownerType !== owner.ownerType || asset.ownerId !== null) {
        throw ownerMismatch();
      }
      const resolved = await this.owners.resolve(transaction, owner);
      if (resolved.clientId !== asset.clientId || resolved.eventId !== asset.eventId) {
        throw ownerMismatch();
      }
      const claimed = await transaction.fileAsset.update({
        where: { id: fileAssetId },
        data: { ownerId: owner.ownerId, associatedAt: new Date() }
      });
      await this.audit.record(fileAssetAudit(claimed, actorUserId, 'FILE_ASSET_CLAIM', operationId), transaction);
      return toFileAssetResponse(claimed);
    }, CRITICAL_TRANSACTION_OPTIONS);
  }

  async createGeneratedAsset(input: CreateGeneratedAssetInput): Promise<FileAssetResponseDto> {
    if (!GENERATED_FILE_TYPES.has(input.fileType) || input.bytes.length === 0) {
      throw fileError('FILE_UNSUPPORTED_TYPE', 'Generated file content is invalid.');
    }
    assertCompatibleFileAssetType(input.owner.ownerType, input.fileType);
    if (
      (input.fileType === FileAssetType.GENERATED_REPORT_PDF && input.mimeType !== 'application/pdf') ||
      (input.fileType !== FileAssetType.GENERATED_REPORT_PDF && input.mimeType !== 'image/svg+xml')
    ) {
      throw fileError('FILE_UNSUPPORTED_TYPE', 'Generated file content does not match its type.');
    }
    if (input.bytes.length > this.config.fileUploadMaxBytes) {
      throw fileError('FILE_SIZE_EXCEEDED', 'File size exceeds the configured limit.', HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const resolved = await this.prisma.$transaction(
      (transaction) => this.owners.resolve(transaction, input.owner),
      CRITICAL_TRANSACTION_OPTIONS
    );
    const storageKey = this.storage.generateKey();
    const asset = await this.prisma.fileAsset.create({
      data: {
        clientId: resolved.clientId,
        eventId: resolved.eventId,
        ownerType: input.owner.ownerType,
        fileType: input.fileType,
        storageKey,
        originalName: safeOriginalName(input.originalName),
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        createdByUserId: input.actorUserId
      }
    });
    let wroteBytes = false;
    try {
      await this.storage.write({ storageKey, bytes: input.bytes });
      wroteBytes = true;
      return await this.prisma.$transaction(async (transaction) => {
        const owner = await this.owners.resolve(transaction, input.owner);
        if (owner.clientId !== asset.clientId || owner.eventId !== asset.eventId) {
          throw ownerMismatch();
        }
        await transaction.fileAsset.update({
          where: { id: asset.id },
          data: {
            mimeType: input.mimeType,
            sizeBytes: input.bytes.length,
            checksumSha256: createHash('sha256').update(input.bytes).digest('hex'),
            status: FileAssetStatus.READY
          }
        });
        const claimed = await transaction.fileAsset.update({
          where: { id: asset.id },
          data: { ownerId: input.owner.ownerId, associatedAt: new Date() }
        });
        await this.audit.record(
          fileAssetAudit(claimed, input.actorUserId, 'FILE_ASSET_GENERATED_READY', input.operationId),
          transaction
        );
        return toFileAssetResponse(claimed);
      }, CRITICAL_TRANSACTION_OPTIONS);
    } catch (error) {
      if (wroteBytes) {
        await this.storage.delete(storageKey).catch(() => undefined);
      }
      await this.markFailed(asset, failureCode(error), input.actorUserId, input.operationId);
      throw error;
    }
  }

  async cleanupOrphans(at: Date = new Date()): Promise<number> {
    const cutoff = new Date(at.getTime() - this.config.fileOrphanRetentionSeconds * 1000);
    const candidates = await this.prisma.fileAsset.findMany({
      where: {
        ownerId: null,
        createdAt: { lt: cutoff },
        OR: [
          { status: FileAssetStatus.UPLOADING },
          { status: FileAssetStatus.FAILED },
          { status: FileAssetStatus.DELETED },
          { status: FileAssetStatus.READY }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });
    let cleaned = 0;
    for (const asset of candidates) {
      await this.storage.delete(asset.storageKey);
      const result = await this.prisma.fileAsset.updateMany({
        where: { id: asset.id, ownerId: null, status: asset.status },
        data: {
          status: FileAssetStatus.DELETED,
          failureCode: null,
          deletedAt: asset.deletedAt ?? at
        }
      });
      cleaned += result.count;
    }
    if (cleaned > 0) {
      await this.audit.record({
        actor: { type: AuditActorType.SYSTEM },
        resourceType: 'FILE_ASSET',
        action: 'FILE_ASSET_ORPHAN_CLEANUP',
        metadata: { count: cleaned }
      });
    }
    return cleaned;
  }

  private async requireOwnedEvent(eventId: string, principal: AuthPrincipal) {
    const event = await this.prisma.event.findFirst({
      where: activeWhere({ id: eventId, ...this.eventAccess.ownedWhere(principal) }),
      select: { id: true, clientId: true, status: true }
    });
    if (!event) {
      throw eventNotFound();
    }
    return event;
  }

  private async requireEventAsset(eventId: string, fileAssetId: string, includeDeleted: boolean): Promise<FileAsset> {
    const asset = await this.prisma.fileAsset.findFirst({
      where: {
        id: fileAssetId,
        eventId,
        ...(includeDeleted ? {} : { deletedAt: null })
      }
    });
    if (!asset) {
      throw new NotFoundException({
        code: 'FILE_ASSET_NOT_FOUND',
        message: 'File asset not found.'
      });
    }
    return asset;
  }

  private async markFailed(staged: FileAsset, code: string, actorUserId: string, operationId?: string): Promise<void> {
    await this.prisma
      .$transaction(async (transaction) => {
        const failed = await transaction.fileAsset.update({
          where: { id: staged.id },
          data: { status: FileAssetStatus.FAILED, failureCode: code }
        });
        await this.audit.record(
          fileAssetAudit(failed, actorUserId, 'FILE_ASSET_UPLOAD_FAILED', operationId),
          transaction
        );
      }, CRITICAL_TRANSACTION_OPTIONS)
      .catch(() => undefined);
  }
}

function safeOriginalName(input: string): string {
  const base = [...path.basename(input.replaceAll('\\', '/'))]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .trim();
  return (base || 'upload').slice(0, 255);
}

function failureCode(error: unknown): string {
  if (error instanceof DomainError) {
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null && 'code' in response) {
      return String((response as { code: unknown }).code).slice(0, 80);
    }
  }
  return 'FILE_STORAGE_FAILURE';
}

function fileError(code: string, message: string, status = HttpStatus.BAD_REQUEST): DomainError {
  return new DomainError(code, message, status);
}

function fileAssetAudit(asset: FileAsset, actorUserId: string, action: string, operationId?: string) {
  return {
    actor: { type: AuditActorType.USER, id: actorUserId },
    clientId: asset.clientId,
    eventId: asset.eventId,
    resourceType: 'FILE_ASSET',
    resourceId: asset.id,
    action,
    afterData: {
      id: asset.id,
      eventId: asset.eventId,
      clientId: asset.clientId,
      ownerType: asset.ownerType,
      ownerId: asset.ownerId,
      fileType: asset.fileType,
      sizeBytes: asset.sizeBytes,
      status: asset.status
    },
    ...(operationId === undefined ? {} : { operationId })
  };
}

export function toFileAssetResponse(asset: FileAsset): FileAssetResponseDto {
  return {
    id: asset.id,
    eventId: asset.eventId,
    ownerType: asset.ownerType,
    ownerId: asset.ownerId,
    fileType: asset.fileType,
    storageProvider: asset.storageProvider,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    status: asset.status,
    associatedAt: asset.associatedAt?.toISOString() ?? null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deletedAt: asset.deletedAt?.toISOString() ?? null
  };
}
