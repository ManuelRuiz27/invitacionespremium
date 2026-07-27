import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { CreditLineStatus, LedgerMovementType, PaymentProvider, PaymentStatus } from '../generated/prisma/client';

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const idempotencyKeySchema = z.string().trim().min(8).max(128);
const operationReferenceSchema = z.string().trim().min(1).max(128).optional();
const positiveCreditsSchema = z.number().int().positive().max(1_000_000_000);
const nonnegativeCreditsSchema = z.number().int().nonnegative().max(1_000_000_000);
const positiveMxnCentsSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const optionalNotesSchema = z.string().trim().max(1000).nullable().optional();
const optionalPaymentMetadataSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 10_000, {
    message: 'metadata must not exceed 10000 serialized characters.'
  })
  .optional();

const assignCreditsSchema = z
  .object({
    credits: positiveCreditsSchema,
    reason: z.string().trim().min(3).max(500),
    notes: optionalNotesSchema,
    operationReference: operationReferenceSchema
  })
  .strict();

const configureCreditLineSchema = z
  .object({
    limitCredits: nonnegativeCreditsSchema,
    status: z.enum(CreditLineStatus),
    expiresAt: instantSchema.nullable().optional(),
    notes: optionalNotesSchema,
    operationReference: operationReferenceSchema
  })
  .strict();

const creditPurchaseSchema = z
  .object({
    kind: z.literal(LedgerMovementType.CREDIT_PURCHASE),
    credits: positiveCreditsSchema,
    creditUnitValueMxnCents: positiveMxnCentsSchema.max(2_147_483_647),
    amountMxnCents: positiveMxnCentsSchema,
    externalReference: z.string().trim().min(1).max(160),
    metadata: optionalPaymentMetadataSchema,
    notes: optionalNotesSchema,
    operationReference: operationReferenceSchema
  })
  .strict()
  .refine((value) => value.amountMxnCents === value.credits * value.creditUnitValueMxnCents, {
    message: 'amountMxnCents must equal credits multiplied by creditUnitValueMxnCents.'
  });

const debtPaymentSchema = z
  .object({
    kind: z.literal(LedgerMovementType.DEBT_PAYMENT),
    amountMxnCents: positiveMxnCentsSchema,
    externalReference: z.string().trim().min(1).max(160),
    metadata: optionalPaymentMetadataSchema,
    allocations: z
      .array(
        z
          .object({
            debtLotLedgerEntryId: uuidSchema,
            credits: positiveCreditsSchema
          })
          .strict()
      )
      .min(1)
      .max(100),
    notes: optionalNotesSchema,
    operationReference: operationReferenceSchema
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.allocations.map((allocation) => allocation.debtLotLedgerEntryId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Each debt lot may appear only once per payment.',
        path: ['allocations']
      });
    }
  });

const manualPaymentSchema = z.discriminatedUnion('kind', [creditPurchaseSchema, debtPaymentSchema]);

const listMovementsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    beforeSequence: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional()
  })
  .strict();

const listReceiptsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    beforeFolio: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional()
  })
  .strict();

const dailyCutQuerySchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
  })
  .strict();

const monthlyCutQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
  })
  .strict();

export class AssignCreditsRequestDto {
  @ApiProperty({ type: Number, minimum: 1 })
  credits!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 500 })
  reason!: string;

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  notes?: string | null;

  @ApiProperty({ type: String, maxLength: 128, required: false })
  operationReference?: string;
}

export class ConfigureCreditLineRequestDto {
  @ApiProperty({ type: Number, minimum: 0 })
  limitCredits!: number;

  @ApiProperty({ enum: CreditLineStatus })
  status!: CreditLineStatus;

  @ApiProperty({ type: String, format: 'date-time', required: false, nullable: true })
  expiresAt?: string | null;

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  notes?: string | null;

  @ApiProperty({ type: String, maxLength: 128, required: false })
  operationReference?: string;
}

export class DebtLotAllocationRequestDto {
  @ApiProperty({ type: String, format: 'uuid' })
  debtLotLedgerEntryId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  credits!: number;
}

export class ManualPaymentRequestDto {
  @ApiProperty({ enum: [LedgerMovementType.CREDIT_PURCHASE, LedgerMovementType.DEBT_PAYMENT] })
  kind!: typeof LedgerMovementType.CREDIT_PURCHASE | typeof LedgerMovementType.DEBT_PAYMENT;

  @ApiProperty({ type: Number, minimum: 1, required: false })
  credits?: number;

  @ApiProperty({ type: Number, minimum: 1, required: false })
  creditUnitValueMxnCents?: number;

  @ApiProperty({ type: Number, minimum: 1 })
  amountMxnCents!: number;

  @ApiProperty({ type: String, maxLength: 160 })
  externalReference!: string;

  @ApiProperty({ type: Object, required: false, additionalProperties: true })
  metadata?: Record<string, unknown>;

  @ApiProperty({ type: DebtLotAllocationRequestDto, isArray: true, required: false })
  allocations?: DebtLotAllocationRequestDto[];

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  notes?: string | null;

  @ApiProperty({ type: String, maxLength: 128, required: false })
  operationReference?: string;
}

export class CreditLineResponseDto {
  @ApiProperty({ type: Number, minimum: 0 })
  limitCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  usedCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  availableCredits!: number;

  @ApiProperty({ enum: CreditLineStatus, nullable: true })
  status!: CreditLineStatus | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  assignedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;
}

export class BalanceReconciliationDto {
  @ApiProperty({ type: Boolean })
  matchesLedger!: boolean;

  @ApiProperty({ type: Number, minimum: 0 })
  purchasedCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  creditLineUsed!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  debtCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  debtMxnCents!: number;

  @ApiProperty({ type: String, nullable: true })
  lastLedgerSequence!: string | null;
}

export class FinanceBalanceResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  purchasedCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  debtCredits!: number;

  @ApiProperty({ type: Number, minimum: 0 })
  debtMxnCents!: number;

  @ApiProperty({ type: CreditLineResponseDto })
  creditLine!: CreditLineResponseDto;

  @ApiProperty({ type: String, nullable: true })
  lastLedgerSequence!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: BalanceReconciliationDto })
  reconciliation!: BalanceReconciliationDto;
}

export class LedgerMovementResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  sequence!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ enum: LedgerMovementType })
  movementType!: LedgerMovementType;

  @ApiProperty({ type: Number })
  purchasedCreditDelta!: number;

  @ApiProperty({ type: Number })
  creditLineUsedDelta!: number;

  @ApiProperty({ type: Number })
  debtDelta!: number;

  @ApiProperty({ type: Number })
  cashMxnDelta!: number;

  @ApiProperty({ type: Number, nullable: true })
  creditUnitValueMxnCentsSnapshot!: number | null;

  @ApiProperty({ type: String })
  currency!: string;

  @ApiProperty({ type: String })
  operationReference!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  paymentId!: string | null;

  @ApiProperty({ type: String, format: 'uuid' })
  receiptId!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: string | null;

  @ApiProperty({ type: Object, nullable: true })
  allocationMetadata!: Record<string, unknown> | null;

  @ApiProperty({ type: Object, nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class PaymentResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PaymentProvider })
  provider!: PaymentProvider;

  @ApiProperty({ enum: PaymentStatus })
  status!: PaymentStatus;

  @ApiProperty({ type: Number, minimum: 1 })
  amountMxnCents!: number;

  @ApiProperty({ type: String })
  currency!: string;

  @ApiProperty({ type: String })
  externalReference!: string;

  @ApiProperty({ type: String })
  idempotencyKey!: string;

  @ApiProperty({ type: Object, nullable: true, additionalProperties: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  approvedAt!: string | null;
}

export class ReceiptResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String })
  folio!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  clientId!: string;

  @ApiProperty({ type: String })
  operationType!: string;

  @ApiProperty({ type: String })
  operationReference!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class FinanceMutationResponseDto {
  @ApiProperty({ type: ReceiptResponseDto })
  receipt!: ReceiptResponseDto;

  @ApiProperty({ type: LedgerMovementResponseDto, nullable: true })
  movement!: LedgerMovementResponseDto | null;

  @ApiProperty({ type: PaymentResponseDto, nullable: true })
  payment!: PaymentResponseDto | null;

  @ApiProperty({ type: FinanceBalanceResponseDto })
  balance!: FinanceBalanceResponseDto;
}

export class FinanceCutResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  from!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  until!: string;

  @ApiProperty({ type: Number })
  incomeMxnCents!: number;

  @ApiProperty({ type: Number })
  creditsSold!: number;

  @ApiProperty({ type: Number })
  creditsGranted!: number;

  @ApiProperty({ type: Number })
  creditsConsumed!: number;

  @ApiProperty({ type: Number })
  creditsLent!: number;

  @ApiProperty({ type: Number })
  debtGeneratedCredits!: number;

  @ApiProperty({ type: Number })
  debtGeneratedMxnCents!: number;

  @ApiProperty({ type: Number })
  debtPaidCredits!: number;

  @ApiProperty({ type: Number })
  debtPaidMxnCents!: number;

  @ApiProperty({ type: Number })
  pendingDebtCredits!: number;

  @ApiProperty({ type: Number })
  pendingDebtMxnCents!: number;

  @ApiProperty({ type: Number })
  pendingPurchasedCredits!: number;

  @ApiProperty({ type: Number })
  internalRefundCredits!: number;

  @ApiProperty({ type: Number })
  reversalCount!: number;
}

export type AssignCreditsInput = z.infer<typeof assignCreditsSchema>;
export type ConfigureCreditLineInput = z.infer<typeof configureCreditLineSchema>;
export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;
export type DailyCutQuery = z.infer<typeof dailyCutQuerySchema>;
export type MonthlyCutQuery = z.infer<typeof monthlyCutQuerySchema>;

export function parseAssignCreditsRequest(input: unknown): AssignCreditsInput {
  return parse(assignCreditsSchema, input);
}

export function parseConfigureCreditLineRequest(input: unknown): ConfigureCreditLineInput {
  return parse(configureCreditLineSchema, input);
}

export function parseManualPaymentRequest(input: unknown): ManualPaymentInput {
  return parse(manualPaymentSchema, input);
}

export function parseListMovementsQuery(input: unknown): ListMovementsQuery {
  return parse(listMovementsQuerySchema, input);
}

export function parseListReceiptsQuery(input: unknown): ListReceiptsQuery {
  return parse(listReceiptsQuerySchema, input);
}

export function parseDailyCutQuery(input: unknown): DailyCutQuery {
  return parse(dailyCutQuerySchema, input);
}

export function parseMonthlyCutQuery(input: unknown): MonthlyCutQuery {
  return parse(monthlyCutQuerySchema, input);
}

export function parseIdempotencyKey(input: unknown): string {
  return parse(idempotencyKeySchema, input);
}

export function parseUuidParameter(value: string, fieldName: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw validationError(`Invalid ${fieldName}.`);
  }
  return parsed.data;
}

function parse<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw validationError('Invalid request payload.');
  }
  return parsed.data;
}

function validationError(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message
  });
}
