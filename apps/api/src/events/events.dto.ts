import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { EventSocialType, EventStatus, ServiceCode } from '../generated/prisma/client';
import { FinanceBalanceResponseDto, LedgerMovementResponseDto, ReceiptResponseDto } from '../finance/finance.dto';
import { normalizeEventDestinationUrl } from './event-destination-url';

const nullableName = z.string().trim().min(1).max(160).nullable().optional();
const nullableUuid = z.string().uuid().nullable().optional();
const nullableSocialType = z.enum(EventSocialType).nullable().optional();
const nullableEventDateTime = z.string().datetime({ offset: true }).nullable().optional();
const nullableTimeZone = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(isValidTimeZone, { message: 'timeZone must be a valid IANA identifier.' })
  .nullable()
  .optional();
const nullableCapacity = z.number().int().positive().max(1_000_000_000).nullable().optional();
const nullableDestinationUrl = z
  .string()
  .max(2048)
  .transform((value, context) => {
    const normalized = normalizeEventDestinationUrl(value);
    if (normalized !== null) return normalized;
    context.addIssue({ code: 'custom', message: 'Destination must be a safe absolute HTTPS URL.' });
    return z.NEVER;
  })
  .nullable()
  .optional();

const eventFields = {
  name: nullableName,
  serviceId: nullableUuid,
  socialType: nullableSocialType,
  eventDateTime: nullableEventDateTime,
  timeZone: nullableTimeZone,
  capacity: nullableCapacity,
  confirmationEnabled: z.boolean().optional(),
  locationUrl: nullableDestinationUrl,
  giftRegistryUrl: nullableDestinationUrl,
  floorplanEnabled: z.boolean().optional()
};

const createEventSchema = z.object(eventFields).strict();
const updateEventSchema = z
  .object({
    ...eventFields,
    resetInvitationDesign: z.literal(true).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

export class CreateEventRequestDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 160, required: false, nullable: true })
  name?: string | null;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  serviceId?: string | null;

  @ApiProperty({ enum: EventSocialType, required: false, nullable: true })
  socialType?: EventSocialType | null;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  eventDateTime?: string | null;

  @ApiProperty({ type: String, example: 'America/Mexico_City', required: false, nullable: true })
  timeZone?: string | null;

  @ApiProperty({ type: Number, minimum: 1, required: false, nullable: true })
  capacity?: number | null;

  @ApiProperty({ type: Boolean, required: false, default: false })
  confirmationEnabled?: boolean;

  @ApiProperty({
    type: String,
    format: 'uri',
    required: false,
    nullable: true,
    description:
      'Safe absolute HTTPS destination. Percent escapes must contain valid UTF-8 through at most four decoding rounds; %20 is allowed only in path segments and query values.'
  })
  locationUrl?: string | null;

  @ApiProperty({
    type: String,
    format: 'uri',
    required: false,
    nullable: true,
    description:
      'Safe absolute HTTPS destination. Percent escapes must contain valid UTF-8 through at most four decoding rounds; %20 is allowed only in path segments and query values.'
  })
  giftRegistryUrl?: string | null;

  @ApiProperty({ type: Boolean, required: false, default: false })
  floorplanEnabled?: boolean;
}

export class UpdateEventRequestDto extends CreateEventRequestDto {
  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'Explicit consent to soft-reset an incompatible active invitation design when switching between Flyer and Flipbook before activation.'
  })
  resetInvitationDesign?: true;
}

export class EventResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  createdByUserId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  serviceId!: string | null;

  @ApiProperty({ enum: ServiceCode, nullable: true })
  serviceCode!: ServiceCode | null;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ enum: EventSocialType, nullable: true })
  socialType!: EventSocialType | null;

  @ApiProperty({ enum: EventStatus })
  status!: EventStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  eventDateTime!: string | null;

  @ApiProperty({ type: String, nullable: true })
  timeZone!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  capacity!: number | null;

  @ApiProperty({ type: Boolean })
  confirmationEnabled!: boolean;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  locationUrl!: string | null;

  @ApiProperty({ type: String, format: 'uri', nullable: true })
  giftRegistryUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  confirmationClosedAt!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  confirmationClosedByUserId!: string | null;

  @ApiProperty({ type: Boolean })
  floorplanEnabled!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  activatedAt!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  activatedByUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  activatedServiceId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  activatedServicePriceId!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  baseCostCredits!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  promotionDiscountCredits!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  finalCostCredits!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  purchasedCreditsUsed!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  creditLineCreditsUsed!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  creditUnitValueMxnCentsSnapshot!: number | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  activationReceiptId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  activationIdempotencyKey!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;
}

export class EventActivationResponseDto {
  @ApiProperty({ type: EventResponseDto })
  event!: EventResponseDto;

  @ApiProperty({ type: Number })
  baseCostCredits!: number;

  @ApiProperty({ type: Number })
  promotionDiscountCredits!: number;

  @ApiProperty({ type: Number })
  finalCostCredits!: number;

  @ApiProperty({ type: Number })
  purchasedCreditsUsed!: number;

  @ApiProperty({ type: Number })
  creditLineCreditsUsed!: number;

  @ApiProperty({ type: LedgerMovementResponseDto, isArray: true })
  movements!: LedgerMovementResponseDto[];

  @ApiProperty({ type: ReceiptResponseDto })
  receipt!: ReceiptResponseDto;

  @ApiProperty({ type: FinanceBalanceResponseDto })
  balance!: FinanceBalanceResponseDto;
}

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export function parseCreateEventRequest(input: unknown): CreateEventInput {
  return parse(createEventSchema, input);
}

export function parseUpdateEventRequest(input: unknown): UpdateEventInput {
  return parse(updateEventSchema, input);
}

export function parseEventId(value: string): string {
  return parse(z.string().uuid(), value);
}

function parse<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid Event request.'
    });
  }
  return parsed.data;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
