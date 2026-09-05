import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { InvitationMode } from '../generated/prisma/client';

const uuid = z.string().uuid();
const scanSchema = z.object({ qrToken: z.string().trim().min(1).max(512) }).strict();
const searchSchema = z
  .object({
    query: z
      .string()
      .transform((value) => value.trim().replace(/\s+/gu, ' '))
      .pipe(z.string().min(1).max(160))
  })
  .strict();
const checkInSchema = z
  .object({ invitationId: uuid, assistantIds: z.array(uuid).min(1).max(100) })
  .strict()
  .refine(({ assistantIds }) => new Set(assistantIds).size === assistantIds.length, {
    message: 'assistantIds must not contain duplicates.'
  });

export class ScannerScanRequestDto {
  @ApiProperty({ type: String, example: 'qr1.payload.signature' })
  qrToken!: string;
}

export class ScannerSearchRequestDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 160 })
  query!: string;
}

export class ScannerCheckInRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ type: String, format: 'uuid', isArray: true, minItems: 1, uniqueItems: true })
  assistantIds!: string[];
}

export class ScannerInvitationDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: InvitationMode })
  mode!: InvitationMode;
}

export class PendingAssistantDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Boolean })
  isPrimary!: boolean;

  @ApiProperty({ type: () => ScannerTableDto, nullable: true })
  table!: ScannerTableDto | null;

  @ApiProperty({ type: () => ScannerSeatDto, nullable: true })
  seat!: ScannerSeatDto | null;
}

export class ScannerTableDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;
}

export class ScannerSeatDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ type: Number }) x!: number;
  @ApiProperty({ type: Number }) y!: number;
}

export class ScannerInvitationResultDto {
  @ApiProperty({ type: ScannerInvitationDto })
  invitation!: ScannerInvitationDto;

  @ApiProperty({ type: PendingAssistantDto, isArray: true })
  pendingAssistants!: PendingAssistantDto[];

  @ApiProperty({ type: Number })
  confirmedCount!: number;

  @ApiProperty({ type: Number })
  pendingCount!: number;

  @ApiProperty({ type: Number })
  checkedInCount!: number;
}

export class ScannerScanResponseDto extends ScannerInvitationResultDto {
  @ApiProperty({ enum: ['AVAILABLE', 'NO_PENDING'] })
  status!: 'AVAILABLE' | 'NO_PENDING';
}

export class ScannerSearchResponseDto {
  @ApiProperty({ enum: ['MATCHES', 'NO_MATCHES'] })
  status!: 'MATCHES' | 'NO_MATCHES';

  @ApiProperty({ type: ScannerInvitationResultDto, isArray: true })
  results!: ScannerInvitationResultDto[];
}

export class CheckedInAssistantDto {
  @ApiProperty({ type: String, format: 'uuid' })
  checkInId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  assistantId!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  checkedInAt!: string;

  @ApiProperty({ type: ScannerTableDto, nullable: true })
  table!: ScannerTableDto | null;

  @ApiProperty({ type: () => ScannerSeatDto, nullable: true })
  seat!: ScannerSeatDto | null;
}

export class ScannerCheckInResponseDto {
  @ApiProperty({ enum: ['CHECKED_IN'] })
  status!: 'CHECKED_IN';

  @ApiProperty({ type: String, format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ type: CheckedInAssistantDto, isArray: true })
  checkedIn!: CheckedInAssistantDto[];

  @ApiProperty({ type: PendingAssistantDto, isArray: true })
  remainingPendingAssistants!: PendingAssistantDto[];

  @ApiProperty({ type: Number })
  remainingPendingCount!: number;
}

export class CheckInRevertResponseDto {
  @ApiProperty({ enum: ['REVERTED'] })
  status!: 'REVERTED';

  @ApiProperty({ type: String, format: 'uuid' })
  checkInId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  assistantId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  revertedAt!: string;
}

export type ScannerScanInput = z.infer<typeof scanSchema>;
export type ScannerSearchInput = z.infer<typeof searchSchema>;
export type ScannerCheckInInput = z.infer<typeof checkInSchema>;

export function parseScannerScan(input: unknown): ScannerScanInput {
  return parse(scanSchema, input);
}

export function parseScannerSearch(input: unknown): ScannerSearchInput {
  return parse(searchSchema, input);
}

export function parseScannerCheckIn(input: unknown): ScannerCheckInInput {
  return parse(checkInSchema, input);
}

export function parseCheckInId(value: string): string {
  return parse(uuid, value);
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid Scanner request.' });
  }
  return result.data;
}
