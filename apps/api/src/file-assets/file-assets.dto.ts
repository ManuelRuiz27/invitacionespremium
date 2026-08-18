import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { FileAssetOwnerType, FileAssetStatus, FileAssetType, StorageProvider } from '../generated/prisma/client';
import { ADMIN_INVITATION_IMAGE_FILE_TYPES } from './file-asset-compatibility';

const uuidSchema = z.string().uuid();
const uploadSchema = z
  .object({
    ownerType: z.enum(FileAssetOwnerType),
    fileType: z.enum(FileAssetType)
  })
  .strict();
const administrativeInvitationUploadSchema = z.object({ fileType: z.enum(FileAssetType) }).strict().superRefine((value, context) => {
  if (!ADMIN_INVITATION_IMAGE_FILE_TYPES.has(value.fileType)) {
    context.addIssue({ code: 'custom', message: 'File type is not available through the administrative Invitation surface.' });
  }
});

export type UploadFileAssetInput = z.infer<typeof uploadSchema>;
export type AdministrativeInvitationUploadInput = z.infer<typeof administrativeInvitationUploadSchema>;

export class UploadFileAssetRequestDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: unknown;

  @ApiProperty({ enum: FileAssetOwnerType, enumName: 'FileAssetOwnerType' })
  ownerType!: FileAssetOwnerType;

  @ApiProperty({ enum: FileAssetType, enumName: 'FileAssetType' })
  fileType!: FileAssetType;
}

export class AdministrativeInvitationFileAssetUploadRequestDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file!: unknown;

  @ApiProperty({
    enum: [FileAssetType.FLYER_INITIAL_IMAGE, FileAssetType.FLYER_QR_IMAGE, FileAssetType.FLIPBOOK_PAGE_IMAGE]
  })
  fileType!: FileAssetType;
}

export class FileAssetResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ enum: FileAssetOwnerType, enumName: 'FileAssetOwnerType' })
  ownerType!: FileAssetOwnerType;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  ownerId!: string | null;

  @ApiProperty({ enum: FileAssetType, enumName: 'FileAssetType' })
  fileType!: FileAssetType;

  @ApiProperty({ enum: StorageProvider, enumName: 'StorageProvider' })
  storageProvider!: StorageProvider;

  @ApiProperty({ type: String })
  originalName!: string;

  @ApiProperty({ type: String })
  mimeType!: string;

  @ApiProperty({ type: Number })
  sizeBytes!: number;

  @ApiPropertyOptional({ type: Number, nullable: true })
  width!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({ enum: FileAssetStatus, enumName: 'FileAssetStatus' })
  status!: FileAssetStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  associatedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;
}

export function parseFileAssetUpload(input: unknown): UploadFileAssetInput {
  return parse(uploadSchema, input);
}

export function parseAdministrativeInvitationFileAssetUpload(input: unknown): AdministrativeInvitationUploadInput {
  return parse(administrativeInvitationUploadSchema, input);
}

export function parseFileAssetId(input: unknown): string {
  return parse(uuidSchema, input);
}

export function parseFileAssetEventId(input: unknown): string {
  return parse(uuidSchema, input);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid FileAsset request.'
    });
  }
  return result.data;
}
