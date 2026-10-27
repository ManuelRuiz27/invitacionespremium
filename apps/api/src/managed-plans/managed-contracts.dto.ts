import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { EventStatus, ManagedPlanModality, ManagedPlanTier } from '../generated/prisma/client';
import { DomainError } from '../common/errors/domain-error';

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number(value.slice(0, 4)) >= 1 && Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, 'Use a real calendar date.');
const assignSchema = z
  .object({ planVersionId: z.uuid().transform((value) => value.toLowerCase()), startsOn: dateOnly })
  .strict();
const termsSchema = z
  .object({
    planId: z.uuid(),
    planVersionId: z.uuid(),
    modality: z.enum(ManagedPlanModality),
    tier: z.enum(ManagedPlanTier),
    commercialName: z.string().min(1),
    currency: z.literal('MXN'),
    beforeTax: z.literal(true),
    monthlyAmountMxnCents: z.number().int().positive(),
    initialFeeMxnCents: z.number().int().nonnegative(),
    extraEventAmountMxnCents: z.number().int().positive(),
    contractMonths: z.literal(12),
    includedEventsPerMonth: z.number().int().positive(),
    monthlyEventLimit: z.number().int().positive(),
    includedEventsPerYear: z.number().int().positive().nullable(),
    eventCapacity: z.number().int().min(1).max(150),
    validFrom: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }).nullable()
  })
  .strict();

export type AssignManagedContractInput = z.infer<typeof assignSchema>;
export const contractStatuses = ['FUTURE', 'CURRENT', 'EXPIRED'] as const;

export class AssignManagedContractRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  planVersionId!: string;

  @ApiProperty({ type: String, format: 'date', description: 'Contract start date in America/Mexico_City.' })
  startsOn!: string;
}

export class ManagedContractTermsDto {
  @ApiProperty({ type: String, format: 'uuid' })
  planId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  planVersionId!: string;

  @ApiProperty({ enum: ManagedPlanModality, enumName: 'ManagedPlanModality' })
  modality!: ManagedPlanModality;

  @ApiProperty({ enum: ManagedPlanTier, enumName: 'ManagedPlanTier' })
  tier!: ManagedPlanTier;

  @ApiProperty({ type: String })
  commercialName!: string;

  @ApiProperty({ enum: ['MXN'] })
  currency!: 'MXN';

  @ApiProperty({ type: Boolean })
  beforeTax!: boolean;

  @ApiProperty({ type: Number, minimum: 0 })
  monthlyAmountMxnCents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  initialFeeMxnCents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  extraEventAmountMxnCents!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  contractMonths!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  includedEventsPerMonth!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  monthlyEventLimit!: number;

  @ApiProperty({ type: Number, nullable: true, minimum: 1 })
  includedEventsPerYear!: number | null;

  @ApiProperty({ type: Number, minimum: 1, maximum: 150 })
  eventCapacity!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  validFrom!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  validUntil!: string | null;
}

export class ManagedContractResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  planVersionId!: string;

  @ApiProperty({ type: String, format: 'date' })
  startsOn!: string;

  @ApiProperty({ type: String, format: 'date', description: 'Exclusive contractual end date.' })
  endsOn!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  acceptedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  createdByUserId!: string;

  @ApiProperty({ enum: contractStatuses })
  status!: (typeof contractStatuses)[number];

  @ApiProperty({ type: ManagedContractTermsDto })
  terms!: ManagedContractTermsDto;
}

export class ManagedConsumptionPeriodDto {
  @ApiProperty({ type: Number, minimum: 1 })
  index!: number;

  @ApiProperty({ type: String, format: 'date' })
  startsOn!: string;

  @ApiProperty({ type: String, format: 'date', description: 'Exclusive period end date.' })
  endsOn!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  usedEvents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  includedUsedEvents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  extraordinaryEvents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  cancelledEvents!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Included quota remaining in this historical period; no rollover.'
  })
  availableEvents!: number;
}

export class ManagedConsumedEventDto {
  @ApiProperty({ type: String, format: 'uuid' })
  eventId!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  activatedAt!: string;

  @ApiProperty({ enum: EventStatus, enumName: 'EventStatus' })
  status!: EventStatus;

  @ApiProperty({ type: Number, minimum: 1 })
  periodIndex!: number;

  @ApiProperty({ type: Boolean })
  extraordinary!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Cancelled activations remain consumed and require manual commercial review.'
  })
  cancelled!: boolean;
}

export class ManagedConsumptionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  contractId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  asOf!: string;

  @ApiProperty({ type: Number, nullable: true, minimum: 1 })
  currentPeriodIndex!: number | null;

  @ApiProperty({ type: Number, minimum: 0 })
  usedEvents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  includedUsedEvents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  extraordinaryEvents!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  cancelledEvents!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description: 'Available included events in the current period; zero outside the contract.'
  })
  availableEvents!: number;

  @ApiProperty({
    type: Number,
    minimum: 0,
    nullable: true,
    description: 'Remaining annual included pool, or null for monthly-only plans.'
  })
  annualAvailableEvents!: number | null;

  @ApiProperty({ type: ManagedConsumptionPeriodDto, isArray: true })
  periods!: ManagedConsumptionPeriodDto[];

  @ApiProperty({ type: ManagedConsumedEventDto, isArray: true })
  events!: ManagedConsumedEventDto[];
}

export function parseAssignManagedContract(value: unknown): AssignManagedContractInput {
  const parsed = assignSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid managed contract request.' });
  }
  return parsed.data;
}

export function parseManagedContractTerms(value: unknown): ManagedContractTermsDto {
  const parsed = termsSchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError(
      'MANAGED_CONTRACT_INCONSISTENT',
      'Managed contract terms are unavailable.',
      HttpStatus.CONFLICT
    );
  }
  return parsed.data;
}
