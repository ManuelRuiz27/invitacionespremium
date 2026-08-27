import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { CommercialChannel, ServiceCode, VenuePriceTier } from '../generated/prisma/client';

const authorizationSchema = z.object({ acceptanceConfirmed: z.literal(true) }).strict();
const requoteSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    capacity: z.number().int().min(1).max(150).optional(),
    acceptanceConfirmed: z.literal(true)
  })
  .strict();
const quoteSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    capacity: z.coerce.number().int().min(1).max(150).optional()
  })
  .strict();

export class CommercialQuoteRequestDto {
  @ApiProperty({ type: String, format: 'uuid', required: false })
  serviceId?: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 150, required: false })
  capacity?: number;
}

export class CommercialAuthorizationRequestDto {
  @ApiProperty({ type: Boolean, enum: [true] })
  acceptanceConfirmed!: true;
}

export class CommercialRequoteRequestDto extends CommercialAuthorizationRequestDto {
  @ApiProperty({ type: String, format: 'uuid', required: false })
  serviceId?: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 150, required: false })
  capacity?: number;
}

export class CommercialCoverageResponseDto {
  @ApiProperty({ type: Number, minimum: 0 })
  purchasedCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  creditLineAvailableCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  totalAvailableCredits!: number;

  @ApiProperty({ type: Boolean })
  sufficient!: boolean;
}

export class EventCommercialResponseDto {
  @ApiProperty({ enum: ['LOCKED', 'CURRENT'] })
  quoteSource!: 'LOCKED' | 'CURRENT';

  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String })
  clientName!: string;

  @ApiProperty({ enum: CommercialChannel })
  commercialChannel!: CommercialChannel;

  @ApiProperty({ type: String, format: 'uuid' })
  serviceId!: string;

  @ApiProperty({ enum: ServiceCode })
  serviceCode!: ServiceCode;

  @ApiProperty({ type: Number, minimum: 1, maximum: 150 })
  capacity!: number;

  @ApiProperty({ type: String, format: 'uuid' })
  servicePriceId!: string;

  @ApiProperty({ type: Number, nullable: true })
  capacityMin!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  capacityMax!: number | null;

  @ApiProperty({ enum: VenuePriceTier, nullable: true })
  venueTier!: VenuePriceTier | null;

  @ApiProperty({ type: Number, minimum: 0 })
  baseCostCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  promotionDiscountCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  finalCostCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  amountMxnCents!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  lockedServicePriceId!: string | null;

  @ApiProperty({ type: Number, minimum: 0, nullable: true })
  lockedBaseCostCredits!: number | null;

  @ApiProperty({ type: Number, minimum: 0, nullable: true })
  lockedPromotionDiscountCredits!: number | null;

  @ApiProperty({ type: Number, minimum: 0, nullable: true })
  lockedFinalCostCredits!: number | null;

  @ApiProperty({ type: Number, minimum: 0, nullable: true })
  lockedAmountMxnCents!: number | null;

  @ApiProperty({ type: CommercialCoverageResponseDto })
  coverage!: CommercialCoverageResponseDto;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  authorizedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  priceLockedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  designKickoffAt!: string | null;

  @ApiProperty({ type: Boolean })
  lockMatchesCurrentContext!: boolean;

  @ApiProperty({ type: Boolean })
  customWorkExists!: boolean;
}

export class EventIntakeQuoteResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String })
  clientName!: string;

  @ApiProperty({ enum: CommercialChannel })
  commercialChannel!: CommercialChannel;

  @ApiProperty({ type: String, format: 'uuid' })
  serviceId!: string;

  @ApiProperty({ enum: [ServiceCode.FLYER, ServiceCode.FLIPBOOK, ServiceCode.PHYSICAL_QR] })
  serviceCode!: ServiceCode;

  @ApiProperty({ type: Number, minimum: 1, maximum: 150 })
  capacity!: number;

  @ApiProperty({ type: String, format: 'uuid' })
  servicePriceId!: string;

  @ApiProperty({ type: Number, nullable: true })
  capacityMin!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  capacityMax!: number | null;

  @ApiProperty({ enum: VenuePriceTier, nullable: true })
  venueTier!: VenuePriceTier | null;

  @ApiProperty({ type: Number, minimum: 0 })
  baseCostCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  promotionDiscountCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  finalCostCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  amountMxnCents!: number;

  @ApiProperty({ type: CommercialCoverageResponseDto })
  coverage!: CommercialCoverageResponseDto;
}

export type CommercialRequoteInput = z.infer<typeof requoteSchema>;
export type CommercialQuoteInput = z.infer<typeof quoteSchema>;

export function parseCommercialAuthorization(input: unknown): { acceptanceConfirmed: true } {
  return parse(authorizationSchema, input);
}

export function parseCommercialRequote(input: unknown): CommercialRequoteInput {
  return parse(requoteSchema, input);
}

export function parseCommercialQuote(input: unknown): CommercialQuoteInput {
  return parse(quoteSchema, input);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Invalid request payload.',
    issues: result.error.issues
  });
}
