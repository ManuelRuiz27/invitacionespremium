import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const collectionConcepts = ['IMPLEMENTATION', 'MONTHLY', 'EXTRAORDINARY'] as const;
export const collectionMethods = ['TRANSFER', 'CASH', 'CARD', 'OTHER'] as const;
export const collectionStatuses = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'] as const;
const uuid = z.uuid().transform((value) => value.toLowerCase());
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const instant = new Date(`${value}T00:00:00Z`);
    return (
      Number(value.slice(0, 4)) >= 1 &&
      Number.isFinite(instant.valueOf()) &&
      instant.toISOString().slice(0, 10) === value
    );
  });
const paymentSchema = z
  .object({
    concept: z.enum(collectionConcepts),
    installmentNumber: z.number().int().min(1).max(12).nullable(),
    extraordinaryChargeId: uuid.nullable(),
    amountMxnCents: z.number().int().positive().max(2147483647),
    effectiveOn: date,
    method: z.enum(collectionMethods),
    reference: z.string().trim().max(120).nullable().default(null),
    notes: z.string().trim().max(1000).nullable().default(null)
  })
  .strict()
  .refine((value) =>
    value.concept === 'MONTHLY'
      ? value.installmentNumber !== null && value.extraordinaryChargeId === null
      : value.concept === 'EXTRAORDINARY'
        ? value.installmentNumber === null && value.extraordinaryChargeId !== null
        : value.installmentNumber === null && value.extraordinaryChargeId === null
  );
const reversalSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
const extraSchema = z.object({ eventId: uuid }).strict();

export type ManagedCollectionPaymentInput = z.infer<typeof paymentSchema>;
export type ManagedCollectionReversalInput = z.infer<typeof reversalSchema>;
export type ManagedExtraordinaryChargeInput = z.infer<typeof extraSchema>;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid Managed collection request.' });
  return result.data;
}
export const parseManagedCollectionPayment = (value: unknown) => parse(paymentSchema, value);
export const parseManagedCollectionReversal = (value: unknown) => parse(reversalSchema, value);
export const parseManagedExtraordinaryCharge = (value: unknown) => parse(extraSchema, value);

export class ManagedCollectionPaymentRequestDto {
  @ApiProperty({ enum: collectionConcepts }) concept!: (typeof collectionConcepts)[number];
  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 12 }) installmentNumber!: number | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) extraordinaryChargeId!: string | null;
  @ApiProperty({ type: Number, minimum: 1, maximum: 2147483647, description: 'Net MXN cents before IVA.' })
  amountMxnCents!: number;
  @ApiProperty({
    type: String,
    format: 'date',
    description: 'Effective civil date, not after today in America/Mexico_City.'
  })
  effectiveOn!: string;
  @ApiProperty({ enum: collectionMethods }) method!: (typeof collectionMethods)[number];
  @ApiProperty({ type: String, nullable: true, required: false, maxLength: 120 }) reference?: string | null;
  @ApiProperty({ type: String, nullable: true, required: false, maxLength: 1000 }) notes?: string | null;
}
export class ManagedCollectionReversalRequestDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 }) reason!: string;
}
export class ManagedExtraordinaryChargeRequestDto {
  @ApiProperty({ type: String, format: 'uuid' }) eventId!: string;
}

export class ManagedCollectionObligationDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: collectionConcepts }) concept!: (typeof collectionConcepts)[number];
  @ApiProperty({ type: Number, nullable: true }) installmentNumber!: number | null;
  @ApiProperty({ type: String, nullable: true }) extraordinaryChargeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) eventId!: string | null;
  @ApiProperty({ type: String }) label!: string;
  @ApiProperty({ type: String, format: 'date' }) dueOn!: string;
  @ApiProperty({ type: Number, minimum: 0 }) amountMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) paidMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) balanceMxnCents!: number;
  @ApiProperty({ enum: collectionStatuses }) status!: (typeof collectionStatuses)[number];
  @ApiProperty({ type: Boolean }) overdue!: boolean;
}
export class ManagedCollectionSummaryDto {
  @ApiProperty({ type: Number, minimum: 0 }) totalMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) paidMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) balanceMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) overdueMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) dueMxnCents!: number;
  @ApiProperty({ type: Number, minimum: 0 }) futureMxnCents!: number;
}
export class ManagedCollectionAlertsDto {
  @ApiProperty({ type: Number, minimum: 0 }) overdueInstallments!: number;
  @ApiProperty({ type: Boolean }) endingWithin30Days!: boolean;
  @ApiProperty({ type: Boolean }) expiredWithoutSuccessor!: boolean;
}
export class ManagedExtraordinaryCandidateDto {
  @ApiProperty({ type: String }) eventId!: string;
  @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) eventDateTime!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) activatedAt!: string;
  @ApiProperty({ type: Boolean }) cancelled!: boolean;
  @ApiProperty({ type: Number, minimum: 1 }) amountMxnCents!: number;
  @ApiProperty({ type: String, nullable: true }) confirmedChargeId!: string | null;
}
export class ManagedCollectionHistoryEntryDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ enum: ['PAYMENT', 'REVERSAL', 'EXTRA_CONFIRM'] }) kind!: 'PAYMENT' | 'REVERSAL' | 'EXTRA_CONFIRM';
  @ApiProperty({ type: String, nullable: true }) paymentId!: string | null;
  @ApiProperty({ type: String, nullable: true }) extraordinaryChargeId!: string | null;
  @ApiProperty({ type: String }) obligationId!: string;
  @ApiProperty({ type: Number, minimum: 1 }) amountMxnCents!: number;
  @ApiProperty({ type: String, format: 'date' }) effectiveOn!: string;
  @ApiProperty({ type: String, format: 'date-time' }) occurredAt!: string;
  @ApiProperty({ type: String }) actorUserId!: string;
  @ApiProperty({ type: String }) actorLabel!: string;
  @ApiProperty({ enum: [...collectionMethods, null], nullable: true }) method!:
    (typeof collectionMethods)[number] | null;
  @ApiProperty({ type: String, nullable: true }) reference!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, nullable: true }) reversalReason!: string | null;
  @ApiProperty({ type: Boolean }) reversed!: boolean;
}
export class ManagedCollectionsResponseDto {
  @ApiProperty({ type: String }) clientId!: string;
  @ApiProperty({ type: String }) contractId!: string;
  @ApiProperty({ type: String, format: 'date' }) today!: string;
  @ApiProperty({ enum: ['MXN'] }) currency!: 'MXN';
  @ApiProperty({ type: Boolean }) beforeTax!: boolean;
  @ApiProperty({ type: ManagedCollectionSummaryDto }) summary!: ManagedCollectionSummaryDto;
  @ApiProperty({ type: ManagedCollectionAlertsDto }) alerts!: ManagedCollectionAlertsDto;
  @ApiProperty({ type: ManagedCollectionObligationDto, isArray: true }) obligations!: ManagedCollectionObligationDto[];
  @ApiProperty({ type: ManagedExtraordinaryCandidateDto, isArray: true })
  extraordinaryCandidates!: ManagedExtraordinaryCandidateDto[];
  @ApiProperty({ type: ManagedCollectionHistoryEntryDto, isArray: true }) history!: ManagedCollectionHistoryEntryDto[];
}
