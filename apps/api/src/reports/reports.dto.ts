import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import type {
  GeneratedReportPrivacyMode,
  GeneratedReportStatus,
  GeneratedReportType
} from '../generated/prisma/client';

const uuid = z.string().uuid();
const uploadFields = z
  .object({
    templateVersion: z.coerce.number().int().positive(),
    datasetHashSha256: z.string().regex(/^[0-9a-f]{64}$/u)
  })
  .strict();

export interface ReportParameters {
  locale: 'es-MX';
  pageSize: 'A4';
  timeZone: string;
}

export interface ReportAuthorizationResponse {
  reportId: string;
  reportType: GeneratedReportType;
  status: GeneratedReportStatus;
  privacyMode: GeneratedReportPrivacyMode;
  templateVersion: number;
  generatedAtSnapshot: string;
  detailedUntil: string;
  retentionUntil: string;
  uploadExpiresAt: string;
  datasetHashSha256: string;
  dataset: Record<string, unknown>;
  parameters: ReportParameters;
  fileUploadPath?: string;
}

export interface ReportListItem {
  id: string;
  type: GeneratedReportType;
  status: GeneratedReportStatus;
  privacyMode: GeneratedReportPrivacyMode;
  templateVersion: number;
  generatedAtSnapshot: string;
  detailedUntil: string;
  retentionUntil: string;
  readyAt: string | null;
  hiddenAt: string | null;
  expiredAt: string | null;
  downloadPath?: string;
}

export interface AdminReportListItem extends ReportListItem {
  clientId: string;
  eventId: string;
  requestedByUserId: string;
}

export class ReportAuthorizationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) reportId!: string;
  @ApiProperty({ type: String, enum: ['ATTENDANCE', 'PHYSICAL_PASSES'] }) reportType!: GeneratedReportType;
  @ApiProperty({ type: String, enum: ['AUTHORIZED', 'READY', 'HIDDEN', 'EXPIRED'] })
  status!: GeneratedReportStatus;
  @ApiProperty({ type: String, enum: ['DETAILED', 'AGGREGATE'] }) privacyMode!: GeneratedReportPrivacyMode;
  @ApiProperty({ type: Number }) templateVersion!: number;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAtSnapshot!: string;
  @ApiProperty({ type: String, format: 'date-time' }) detailedUntil!: string;
  @ApiProperty({ type: String, format: 'date-time' }) retentionUntil!: string;
  @ApiProperty({ type: String, format: 'date-time' }) uploadExpiresAt!: string;
  @ApiProperty({ type: String }) datasetHashSha256!: string;
  @ApiProperty({ type: Object }) dataset!: Record<string, unknown>;
  @ApiProperty({ type: Object }) parameters!: ReportParameters;
  @ApiPropertyOptional({ type: String }) fileUploadPath?: string;
}

export class ReportListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, enum: ['ATTENDANCE', 'PHYSICAL_PASSES'] }) type!: GeneratedReportType;
  @ApiProperty({ type: String, enum: ['AUTHORIZED', 'READY', 'HIDDEN', 'EXPIRED'] })
  status!: GeneratedReportStatus;
  @ApiProperty({ type: String, enum: ['DETAILED', 'AGGREGATE'] }) privacyMode!: GeneratedReportPrivacyMode;
  @ApiProperty({ type: Number }) templateVersion!: number;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAtSnapshot!: string;
  @ApiProperty({ type: String, format: 'date-time' }) detailedUntil!: string;
  @ApiProperty({ type: String, format: 'date-time' }) retentionUntil!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) readyAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) hiddenAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) expiredAt!: string | null;
  @ApiPropertyOptional({ type: String }) downloadPath?: string;
}

export class ReportFileUploadRequestDto {
  @ApiProperty({ type: 'string', format: 'binary' }) file!: unknown;
  @ApiProperty({ type: Number }) templateVersion!: number;
  @ApiProperty({ type: String }) datasetHashSha256!: string;
}

export class AdminReportListItemDto extends ReportListItemDto {
  @ApiProperty({ type: String, format: 'uuid' }) clientId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
  @ApiProperty({ type: String, format: 'uuid' }) requestedByUserId!: string;
}

export type ReportFileUploadInput = z.infer<typeof uploadFields>;

export function parseReportUpload(value: unknown): ReportFileUploadInput {
  const result = uploadFields.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid report upload fields.' });
  }
  return result.data;
}

export function parseReportId(value: string): string {
  const result = uuid.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid report identifier.' });
  }
  return result.data;
}
