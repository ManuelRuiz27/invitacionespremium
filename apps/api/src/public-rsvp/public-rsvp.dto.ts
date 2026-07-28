import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AssistantResponseStatus,
  HotspotAction,
  HotspotVisualOwnerType,
  InvitationDesignType,
  InvitationMode,
  InvitationResponseStatus
} from '../generated/prisma/client';
import { z } from 'zod';

const uuid = z.string().uuid();
const assistant = z
  .object({
    id: uuid.optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .transform((value) => value.replace(/\s+/gu, ' '))
  })
  .strict();
const assistantList = z.array(assistant).max(149);
const assistants = z
  .object({ additionalAssistants: assistantList })
  .strict()
  .superRefine((value, context) => {
    const ids = value.additionalAssistants.flatMap(({ id }) => (id ? [id] : []));
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Assistant ids must be unique.' });
    }
  });
const override = z
  .object({
    additionalAssistants: assistantList,
    responseStatus: z.enum(['CONFIRMED', 'REJECTED'])
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.additionalAssistants.flatMap(({ id }) => (id ? [id] : []));
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Assistant ids must be unique.' });
    }
  });

export type RsvpAssistantsInput = z.infer<typeof assistants>;
export type RsvpOverrideInput = z.infer<typeof override>;

export class RsvpAssistantInputDto {
  @ApiPropertyOptional({ type: String, format: 'uuid' })
  id?: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 160 })
  name!: string;
}

export class RsvpAssistantsRequestDto {
  @ApiProperty({ type: RsvpAssistantInputDto, isArray: true })
  additionalAssistants!: RsvpAssistantInputDto[];
}

export class RsvpOverrideRequestDto extends RsvpAssistantsRequestDto {
  @ApiProperty({ enum: ['CONFIRMED', 'REJECTED'] })
  responseStatus!: 'CONFIRMED' | 'REJECTED';
}

export class ConfirmationStateResponseDto {
  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiProperty({ type: Boolean })
  open!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  closedByUserId!: string | null;
}

export class PublicRsvpAssistantResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Boolean })
  isPrimary!: boolean;

  @ApiProperty({ enum: AssistantResponseStatus })
  responseStatus!: AssistantResponseStatus;
}

export class RsvpMutationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ enum: InvitationResponseStatus })
  responseStatus!: InvitationResponseStatus;

  @ApiProperty({ type: PublicRsvpAssistantResponseDto, isArray: true })
  assistants!: PublicRsvpAssistantResponseDto[];
}

export class PublicRsvpEventResponseDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  eventDateTime!: Date;

  @ApiProperty({ type: String })
  timeZone!: string;
}

export class PublicRsvpInvitationResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: InvitationMode })
  mode!: InvitationMode;

  @ApiProperty({ enum: InvitationResponseStatus })
  responseStatus!: InvitationResponseStatus;

  @ApiProperty({ type: Number, minimum: 0 })
  additionalAssistantLimit!: number;

  @ApiProperty({ type: Boolean })
  cancelled!: boolean;
}

export class PublicRsvpConfirmationResponseDto {
  @ApiProperty({ type: Boolean })
  open!: boolean;

  @ApiPropertyOptional({ type: String })
  message?: string;
}

export class PublicRsvpAssetReferenceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  contentPath!: string;
}

export class PublicRsvpPageResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  position!: number;

  @ApiProperty({ type: PublicRsvpAssetReferenceDto })
  asset!: PublicRsvpAssetReferenceDto;
}

export class PublicRsvpHotspotResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: HotspotVisualOwnerType })
  visualOwnerType!: HotspotVisualOwnerType;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  flipbookPageId!: string | null;

  @ApiProperty({ enum: HotspotAction })
  action!: HotspotAction;

  @ApiProperty({ type: Number })
  x!: number;

  @ApiProperty({ type: Number })
  y!: number;

  @ApiProperty({ type: Number })
  width!: number;

  @ApiProperty({ type: Number })
  height!: number;

  @ApiProperty({ type: Number })
  priority!: number;

  @ApiProperty({ type: String, nullable: true })
  destination!: string | null;
}

export class PublicRsvpDesignResponseDto {
  @ApiProperty({ enum: InvitationDesignType })
  type!: InvitationDesignType;

  @ApiPropertyOptional({ type: PublicRsvpAssetReferenceDto })
  flyerInitialAsset?: PublicRsvpAssetReferenceDto;

  @ApiPropertyOptional({ type: PublicRsvpAssetReferenceDto })
  flyerQrAsset?: PublicRsvpAssetReferenceDto;

  @ApiProperty({ type: PublicRsvpPageResponseDto, isArray: true })
  pages!: PublicRsvpPageResponseDto[];

  @ApiProperty({ type: PublicRsvpHotspotResponseDto, isArray: true })
  hotspots!: PublicRsvpHotspotResponseDto[];
}

export class PublicInvitationViewResponseDto {
  @ApiProperty({ enum: ['AVAILABLE', 'CANCELLED', 'CLOSED'] })
  status!: 'AVAILABLE' | 'CANCELLED' | 'CLOSED';

  @ApiPropertyOptional({ type: String })
  message?: string;

  @ApiPropertyOptional({ type: PublicRsvpEventResponseDto })
  event?: PublicRsvpEventResponseDto;

  @ApiPropertyOptional({ type: PublicRsvpInvitationResponseDto })
  invitation?: PublicRsvpInvitationResponseDto;

  @ApiPropertyOptional({ type: PublicRsvpAssistantResponseDto, isArray: true })
  assistants?: PublicRsvpAssistantResponseDto[];

  @ApiPropertyOptional({ type: PublicRsvpConfirmationResponseDto })
  confirmation?: PublicRsvpConfirmationResponseDto;

  @ApiPropertyOptional({ enum: InvitationDesignType })
  designType?: InvitationDesignType;

  @ApiPropertyOptional({ type: PublicRsvpDesignResponseDto })
  design?: PublicRsvpDesignResponseDto;
}

export function parseRsvpAssistants(value: unknown): RsvpAssistantsInput {
  return parse(assistants, value);
}

export function parseRsvpOverride(value: unknown): RsvpOverrideInput {
  return parse(override, value);
}

export function parsePublicUuid(value: unknown): string {
  return parse(uuid, value);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid RSVP request.' });
  }
  return result.data;
}
