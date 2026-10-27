import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ManagedPlanModality, ManagedPlanTier } from '../generated/prisma/client';

const cents = z.number().int().min(0).max(2_147_483_647);
const count = z.number().int().positive().max(2_147_483_647);
const createVersionSchema = z
  .object({
    commercialName: z.string().trim().min(1).max(160),
    monthlyAmountMxnCents: cents.positive(),
    initialFeeMxnCents: cents,
    extraEventAmountMxnCents: cents.positive(),
    contractMonths: z.literal(12),
    includedEventsPerMonth: count,
    monthlyEventLimit: count,
    includedEventsPerYear: count.nullable(),
    eventCapacity: z.number().int().min(1).max(150),
    validFrom: z.iso.datetime({ offset: true }).optional(),
    validUntil: z.iso.datetime({ offset: true }).nullable().optional()
  })
  .strict()
  .refine((value) => value.includedEventsPerMonth <= value.monthlyEventLimit, {
    message: 'Included monthly events cannot exceed the monthly limit.'
  })
  .refine(
    (value) =>
      value.includedEventsPerYear === null ||
      (value.includedEventsPerYear >= value.includedEventsPerMonth &&
        value.includedEventsPerYear <= value.monthlyEventLimit * value.contractMonths),
    { message: 'Annual event allowance is incompatible with monthly limits.' }
  );
const availabilitySchema = z.object({ isAvailable: z.boolean() }).strict();

export type CreateManagedPlanVersionInput = z.infer<typeof createVersionSchema>;
export type SetManagedPlanAvailabilityInput = z.infer<typeof availabilitySchema>;
export type ManagedPlanVersionStatus = 'CURRENT' | 'FUTURE' | 'EXPIRED';

export class CreateManagedPlanVersionRequestDto {
  @ApiProperty({ type: String, maxLength: 160 })
  commercialName!: string;
  @ApiProperty({ type: Number, minimum: 1, maximum: 2_147_483_647 })
  monthlyAmountMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 2_147_483_647 })
  initialFeeMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 1, maximum: 2_147_483_647 })
  extraEventAmountMxnCents!: number;
  @ApiProperty({ type: Number, enum: [12] })
  contractMonths!: number;
  @ApiProperty({ type: Number, minimum: 1 })
  includedEventsPerMonth!: number;
  @ApiProperty({ type: Number, minimum: 1 })
  monthlyEventLimit!: number;
  @ApiProperty({ type: Number, minimum: 1, nullable: true })
  includedEventsPerYear!: number | null;
  @ApiProperty({ type: Number, minimum: 1, maximum: 150 })
  eventCapacity!: number;
  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    description: 'Omit to apply immediately at server transaction time; explicit instants must not be in the past.'
  })
  validFrom?: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, required: false })
  validUntil?: string | null;
}

export class SetManagedPlanAvailabilityRequestDto {
  @ApiProperty({ type: Boolean })
  isAvailable!: boolean;
}

export class ManagedPlanVersionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, format: 'uuid' })
  planId!: string;
  @ApiProperty({ type: String })
  commercialName!: string;
  @ApiProperty({ type: Number })
  monthlyAmountMxnCents!: number;
  @ApiProperty({ type: Number })
  initialFeeMxnCents!: number;
  @ApiProperty({ type: Number })
  extraEventAmountMxnCents!: number;
  @ApiProperty({ type: Number })
  contractMonths!: number;
  @ApiProperty({ type: Number })
  includedEventsPerMonth!: number;
  @ApiProperty({ type: Number })
  monthlyEventLimit!: number;
  @ApiProperty({ type: Number, nullable: true })
  includedEventsPerYear!: number | null;
  @ApiProperty({ type: Number })
  eventCapacity!: number;
  @ApiProperty({ type: String, format: 'date-time' })
  validFrom!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validUntil!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  createdByUserId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ enum: ['CURRENT', 'FUTURE', 'EXPIRED'] })
  status!: ManagedPlanVersionStatus;
}

export class ManagedPlanResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ManagedPlanModality, enumName: 'ManagedPlanModality' })
  modality!: ManagedPlanModality;
  @ApiProperty({ enum: ManagedPlanTier, enumName: 'ManagedPlanTier' })
  tier!: ManagedPlanTier;
  @ApiProperty({ type: Boolean })
  isAvailable!: boolean;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  currentVersionId!: string | null;
  @ApiProperty({ type: [ManagedPlanVersionResponseDto] })
  versions!: ManagedPlanVersionResponseDto[];
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export function parseCreateManagedPlanVersion(input: unknown): CreateManagedPlanVersionInput {
  return parse(createVersionSchema, input);
}
export function parseSetManagedPlanAvailability(input: unknown): SetManagedPlanAvailabilityInput {
  return parse(availabilitySchema, input);
}
export function parseManagedPlanIdempotencyKey(input: unknown): string {
  return parse(
    z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9._:-]+$/u),
    input
  );
}
export function parseManagedPlanUuid(input: unknown): string {
  return parse(z.uuid(), input).toLowerCase();
}
function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid managed plan request.' });
  return parsed.data;
}
