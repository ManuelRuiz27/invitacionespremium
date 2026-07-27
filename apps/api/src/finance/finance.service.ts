import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditedMutationService, auditedResult } from '../audit/audited-mutation.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { DomainError } from '../common/errors/domain-error';
import {
  AuditActorType,
  ClientStatus,
  CreditLineStatus,
  LedgerMovementType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  type CreditLine,
  type FinanceBalance,
  type LedgerEntry,
  type Payment,
  type Receipt
} from '../generated/prisma/client';
import type {
  AssignCreditsInput,
  ConfigureCreditLineInput,
  DailyCutQuery,
  FinanceBalanceResponseDto,
  FinanceCutResponseDto,
  FinanceMutationResponseDto,
  LedgerMovementResponseDto,
  ListMovementsQuery,
  ListReceiptsQuery,
  ManualPaymentInput,
  MonthlyCutQuery,
  PaymentResponseDto,
  ReceiptResponseDto
} from './finance.dto';

type FinanceDatabase = PrismaService | Prisma.TransactionClient;
type MutationParts = {
  receipt: Receipt;
  movement: LedgerEntry | null;
  payment: Payment | null;
};
type ReconstructionRow = {
  purchased_credits: number;
  credit_line_used: number;
  debt_credits: number;
  debt_mxn_cents: bigint;
  last_ledger_sequence: bigint | null;
};

export interface ConsumeEventActivationInput {
  clientId: string;
  eventId: string;
  actorUserId: string;
  serviceId: string;
  servicePriceId: string;
  baseCostCredits: number;
  promotionDiscountCredits: 0;
  finalCostCredits: number;
  idempotencyKey: string;
  at: Date;
}

export interface EventActivationFinanceResult {
  receipt: ReceiptResponseDto;
  movements: LedgerMovementResponseDto[];
  balance: FinanceBalanceResponseDto;
  purchasedCreditsUsed: number;
  creditLineCreditsUsed: number;
  creditUnitValueMxnCentsSnapshot: number | null;
}

@Injectable()
export class FinanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService,
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  async getOwnBalance(principal: AuthPrincipal): Promise<FinanceBalanceResponseDto> {
    return this.getBalance(this.requirePrincipalClientId(principal));
  }

  async getBalance(clientId: string): Promise<FinanceBalanceResponseDto> {
    await this.requireClient(this.prisma, clientId, false);
    return this.buildBalanceResponse(this.prisma, clientId);
  }

  async listOwnMovements(principal: AuthPrincipal, query: ListMovementsQuery): Promise<LedgerMovementResponseDto[]> {
    const clientId = this.requirePrincipalClientId(principal);
    const movements = await this.prisma.ledgerEntry.findMany({
      where: {
        clientId,
        ...(query.beforeSequence === undefined ? {} : { sequence: { lt: BigInt(query.beforeSequence) } })
      },
      orderBy: { sequence: 'desc' },
      take: query.limit
    });

    return movements.map(toLedgerMovementResponse);
  }

  async listOwnReceipts(principal: AuthPrincipal, query: ListReceiptsQuery): Promise<ReceiptResponseDto[]> {
    const clientId = this.requirePrincipalClientId(principal);
    const receipts = await this.prisma.receipt.findMany({
      where: {
        clientId,
        ...(query.beforeFolio === undefined ? {} : { folio: { lt: BigInt(query.beforeFolio) } })
      },
      orderBy: { folio: 'desc' },
      take: query.limit
    });

    return receipts.map(toReceiptResponse);
  }

  async assignCredits(
    clientId: string,
    input: AssignCreditsInput,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FinanceMutationResponseDto> {
    return this.executeIdempotent(
      clientId,
      LedgerMovementType.MANUAL_CREDIT_GRANT,
      input.operationReference ?? idempotencyKey,
      idempotencyKey,
      principal,
      operationId,
      async (transaction, receipt) => {
        const movement = await transaction.ledgerEntry.create({
          data: {
            clientId,
            actorUserId: principal.userId,
            movementType: LedgerMovementType.MANUAL_CREDIT_GRANT,
            purchasedCreditDelta: input.credits,
            creditLineUsedDelta: 0,
            debtDelta: 0,
            cashMxnDelta: 0,
            operationReference: input.operationReference ?? idempotencyKey,
            idempotencyKey,
            receiptId: receipt.id,
            metadata: toJson({
              reason: input.reason,
              ...(input.notes == null ? {} : { notes: input.notes })
            })
          }
        });

        return { receipt, movement, payment: null };
      }
    );
  }

  async configureCreditLine(
    clientId: string,
    input: ConfigureCreditLineInput,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FinanceMutationResponseDto> {
    return this.executeIdempotent(
      clientId,
      'CREDIT_LINE_CONFIGURATION',
      input.operationReference ?? idempotencyKey,
      idempotencyKey,
      principal,
      operationId,
      async (transaction, receipt) => {
        const balance = await transaction.financeBalance.findUnique({
          where: { clientId },
          select: { creditLineUsed: true }
        });
        const usedCredits = balance?.creditLineUsed ?? 0;

        if (input.limitCredits < usedCredits) {
          throw new DomainError(
            'FINANCE_CREDIT_LINE_EXCEEDED',
            'Credit line limit cannot be lower than the amount already used.',
            HttpStatus.CONFLICT,
            { usedCredits, requestedLimitCredits: input.limitCredits }
          );
        }

        const expiresAt = input.expiresAt === undefined ? undefined : input.expiresAt;
        await transaction.creditLine.upsert({
          where: { clientId },
          create: {
            clientId,
            limitCredits: input.limitCredits,
            status: input.status,
            ...(expiresAt === undefined ? {} : { expiresAt: expiresAt === null ? null : new Date(expiresAt) }),
            ...(input.notes === undefined ? {} : { notes: input.notes })
          },
          update: {
            limitCredits: input.limitCredits,
            status: input.status,
            ...(expiresAt === undefined ? {} : { expiresAt: expiresAt === null ? null : new Date(expiresAt) }),
            ...(input.notes === undefined ? {} : { notes: input.notes })
          }
        });
        await transaction.financeBalance.upsert({
          where: { clientId },
          create: { clientId, creditLineLimit: input.limitCredits },
          update: { creditLineLimit: input.limitCredits }
        });

        return { receipt, movement: null, payment: null };
      }
    );
  }

  async registerManualPayment(
    clientId: string,
    input: ManualPaymentInput,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FinanceMutationResponseDto> {
    const operationType = input.kind;

    try {
      return await this.executeIdempotent(
        clientId,
        operationType,
        input.operationReference ?? idempotencyKey,
        idempotencyKey,
        principal,
        operationId,
        async (transaction, receipt) => {
          const metadata = paymentMetadata(input.metadata, input.notes);
          const payment = await transaction.payment.create({
            data: {
              clientId,
              receiptId: receipt.id,
              actorUserId: principal.userId,
              provider: PaymentProvider.MANUAL,
              status: PaymentStatus.APPROVED,
              amountMxnCents: BigInt(input.amountMxnCents),
              externalReference: input.externalReference,
              idempotencyKey,
              ...(metadata === undefined ? {} : { metadata }),
              approvedAt: new Date()
            }
          });

          if (input.kind === LedgerMovementType.CREDIT_PURCHASE) {
            const movement = await transaction.ledgerEntry.create({
              data: {
                clientId,
                actorUserId: principal.userId,
                movementType: LedgerMovementType.CREDIT_PURCHASE,
                purchasedCreditDelta: input.credits,
                creditLineUsedDelta: 0,
                debtDelta: 0,
                cashMxnDelta: BigInt(input.amountMxnCents),
                creditUnitValueMxnCentsSnapshot: input.creditUnitValueMxnCents,
                operationReference: input.operationReference ?? idempotencyKey,
                idempotencyKey,
                paymentId: payment.id,
                receiptId: receipt.id,
                ...(input.notes == null ? {} : { metadata: toJson({ notes: input.notes }) })
              }
            });

            return { receipt, movement, payment };
          }

          return this.createDebtPayment(
            transaction,
            clientId,
            input,
            idempotencyKey,
            principal.userId,
            receipt,
            payment
          );
        }
      );
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        const duplicate = await this.prisma.payment.findUnique({
          where: {
            provider_externalReference: {
              provider: PaymentProvider.MANUAL,
              externalReference: input.externalReference
            }
          },
          select: { id: true }
        });
        if (duplicate) {
          throw new DomainError(
            'FINANCE_DUPLICATE_PAYMENT_REFERENCE',
            'External payment reference is already registered for this provider.',
            HttpStatus.CONFLICT
          );
        }
      }
      throw error;
    }
  }

  async consumeEventActivation(
    transaction: Prisma.TransactionClient,
    input: ConsumeEventActivationInput
  ): Promise<EventActivationFinanceResult> {
    await transaction.$queryRaw`
      SELECT "client_id"
      FROM "finance_balance"
      WHERE "client_id" = ${input.clientId}::uuid
      FOR UPDATE
    `;
    await transaction.$queryRaw`
      SELECT "client_id"
      FROM "credit_line"
      WHERE "client_id" = ${input.clientId}::uuid
      FOR UPDATE
    `;

    const [balance, creditLine] = await Promise.all([
      transaction.financeBalance.findUnique({ where: { clientId: input.clientId } }),
      transaction.creditLine.findUnique({ where: { clientId: input.clientId } })
    ]);
    const purchasedCreditsUsed = Math.min(balance?.purchasedCredits ?? 0, input.finalCostCredits);
    const creditLineCreditsUsed = input.finalCostCredits - purchasedCreditsUsed;
    const lineAvailable =
      creditLine?.status === CreditLineStatus.ACTIVE &&
      (creditLine.expiresAt === null || creditLine.expiresAt > input.at)
        ? creditLine.limitCredits - (balance?.creditLineUsed ?? 0)
        : 0;

    if (creditLineCreditsUsed > lineAvailable) {
      throw new DomainError(
        'FINANCE_INSUFFICIENT_CREDITS',
        'Purchased balance and available credit line are insufficient for Event activation.',
        HttpStatus.CONFLICT,
        {
          finalCostCredits: input.finalCostCredits,
          purchasedCreditsAvailable: balance?.purchasedCredits ?? 0,
          creditLineAvailable: Math.max(0, lineAvailable)
        }
      );
    }

    const receipt = await transaction.receipt.create({
      data: {
        clientId: input.clientId,
        operationType: 'EVENT_ACTIVATION',
        operationReference: input.eventId,
        idempotencyKey: input.idempotencyKey
      }
    });
    const metadata = toJson({
      eventId: input.eventId,
      serviceId: input.serviceId,
      servicePriceId: input.servicePriceId,
      baseCostCredits: input.baseCostCredits,
      promotionDiscountCredits: input.promotionDiscountCredits,
      finalCostCredits: input.finalCostCredits
    });
    const movements: LedgerEntry[] = [];

    if (purchasedCreditsUsed > 0) {
      movements.push(
        await transaction.ledgerEntry.create({
          data: {
            clientId: input.clientId,
            eventId: input.eventId,
            actorUserId: input.actorUserId,
            movementType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
            purchasedCreditDelta: -purchasedCreditsUsed,
            creditLineUsedDelta: 0,
            debtDelta: 0,
            cashMxnDelta: 0,
            operationReference: input.eventId,
            idempotencyKey: input.idempotencyKey,
            receiptId: receipt.id,
            metadata
          }
        })
      );
    }

    const creditUnitValueMxnCentsSnapshot = creditLineCreditsUsed === 0 ? null : this.config.creditUnitValueMxnCents;
    if (creditLineCreditsUsed > 0) {
      movements.push(
        await transaction.ledgerEntry.create({
          data: {
            clientId: input.clientId,
            eventId: input.eventId,
            actorUserId: input.actorUserId,
            movementType: LedgerMovementType.CREDIT_LINE_USAGE,
            purchasedCreditDelta: 0,
            creditLineUsedDelta: creditLineCreditsUsed,
            debtDelta: creditLineCreditsUsed,
            cashMxnDelta: 0,
            creditUnitValueMxnCentsSnapshot,
            operationReference: input.eventId,
            idempotencyKey: input.idempotencyKey,
            receiptId: receipt.id,
            dueAt: creditLine?.expiresAt ?? null,
            metadata
          }
        })
      );
    }

    return {
      receipt: toReceiptResponse(receipt),
      movements: movements.map(toLedgerMovementResponse),
      balance: await this.buildBalanceResponse(transaction, input.clientId),
      purchasedCreditsUsed,
      creditLineCreditsUsed,
      creditUnitValueMxnCentsSnapshot
    };
  }

  async getDailyCut(query: DailyCutQuery): Promise<FinanceCutResponseDto> {
    const from = query.date === undefined ? startOfCurrentUtcDay() : parseUtcDay(query.date);
    return this.buildCut(from, addUtcDays(from, 1));
  }

  async getMonthlyCut(query: MonthlyCutQuery): Promise<FinanceCutResponseDto> {
    const from = query.month === undefined ? startOfCurrentUtcMonth() : parseUtcMonth(query.month);
    return this.buildCut(from, new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)));
  }

  async rebuildBalanceFromLedger(
    clientId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FinanceMutationResponseDto> {
    return this.executeIdempotent(
      clientId,
      'BALANCE_REBUILD',
      idempotencyKey,
      idempotencyKey,
      principal,
      operationId,
      async (transaction, receipt) => {
        await transaction.$queryRaw`
          SELECT * FROM rebuild_finance_balance(${clientId}::uuid)
        `;
        return { receipt, movement: null, payment: null };
      }
    );
  }

  private async createDebtPayment(
    transaction: Prisma.TransactionClient,
    clientId: string,
    input: Extract<ManualPaymentInput, { kind: 'DEBT_PAYMENT' }>,
    idempotencyKey: string,
    actorUserId: string,
    receipt: Receipt,
    payment: Payment
  ): Promise<MutationParts> {
    const lotIds = input.allocations.map((allocation) => allocation.debtLotLedgerEntryId);

    await transaction.$queryRaw`
      SELECT "id"
      FROM "ledger_entry"
      WHERE "id" = ANY(ARRAY[${Prisma.join(lotIds)}]::uuid[])
      ORDER BY "id"
      FOR UPDATE
    `;

    const lots = await transaction.ledgerEntry.findMany({
      where: { id: { in: lotIds } },
      include: { debtLotAllocations: { select: { credits: true } } }
    });
    const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
    let totalCredits = 0;
    let calculatedAmount = 0n;
    const resolvedAllocations: Array<{
      debtLotLedgerEntryId: string;
      credits: number;
      amountMxnCents: bigint;
      creditUnitValueMxnCentsSnapshot: number;
    }> = [];

    for (const allocation of input.allocations) {
      const lot = lotsById.get(allocation.debtLotLedgerEntryId);
      if (
        !lot ||
        lot.clientId !== clientId ||
        lot.movementType !== LedgerMovementType.CREDIT_LINE_USAGE ||
        lot.creditUnitValueMxnCentsSnapshot === null
      ) {
        throw financeAllocationError('Debt allocation references an invalid Client debt lot.');
      }

      const paidCredits = lot.debtLotAllocations.reduce((sum, item) => sum + item.credits, 0);
      const pendingCredits = lot.debtDelta - paidCredits;
      if (allocation.credits > pendingCredits) {
        throw financeAllocationError('Debt allocation exceeds the pending credits for a lot.');
      }

      const amountMxnCents = BigInt(allocation.credits) * BigInt(lot.creditUnitValueMxnCentsSnapshot);
      totalCredits += allocation.credits;
      calculatedAmount += amountMxnCents;
      resolvedAllocations.push({
        debtLotLedgerEntryId: lot.id,
        credits: allocation.credits,
        amountMxnCents,
        creditUnitValueMxnCentsSnapshot: lot.creditUnitValueMxnCentsSnapshot
      });
    }

    if (calculatedAmount !== BigInt(input.amountMxnCents)) {
      throw financeAllocationError('Payment amount must equal the allocated credits at each lot historical value.');
    }

    const movement = await transaction.ledgerEntry.create({
      data: {
        clientId,
        actorUserId,
        movementType: LedgerMovementType.DEBT_PAYMENT,
        purchasedCreditDelta: 0,
        creditLineUsedDelta: -totalCredits,
        debtDelta: -totalCredits,
        cashMxnDelta: calculatedAmount,
        operationReference: input.operationReference ?? idempotencyKey,
        idempotencyKey,
        paymentId: payment.id,
        receiptId: receipt.id,
        allocationMetadata: toJson({
          allocations: resolvedAllocations.map((allocation) => ({
            debtLotLedgerEntryId: allocation.debtLotLedgerEntryId,
            credits: allocation.credits,
            amountMxnCents: allocation.amountMxnCents.toString(),
            creditUnitValueMxnCentsSnapshot: allocation.creditUnitValueMxnCentsSnapshot
          }))
        }),
        ...(input.notes == null ? {} : { metadata: toJson({ notes: input.notes }) })
      }
    });

    await transaction.debtPaymentAllocation.createMany({
      data: resolvedAllocations.map((allocation) => ({
        debtLotLedgerEntryId: allocation.debtLotLedgerEntryId,
        paymentLedgerEntryId: movement.id,
        credits: allocation.credits,
        amountMxnCents: allocation.amountMxnCents
      }))
    });

    return { receipt, movement, payment };
  }

  private async executeIdempotent(
    clientId: string,
    operationType: string,
    operationReference: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId: string | undefined,
    mutate: (transaction: Prisma.TransactionClient, receipt: Receipt) => Promise<MutationParts>
  ): Promise<FinanceMutationResponseDto> {
    const existing = await this.findIdempotentResult(clientId, operationType, idempotencyKey);
    if (existing) {
      return existing;
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.auditedMutation.execute({
          actor: { type: AuditActorType.USER, id: principal.userId },
          clientId,
          resourceType: 'FinanceOperation',
          action: `FINANCE_${operationType}`,
          ...(operationId === undefined ? {} : { operationId }),
          mutate: async (transaction) => {
            await this.requireClient(transaction, clientId, true);
            const receipt = await transaction.receipt.create({
              data: {
                clientId,
                operationType,
                operationReference,
                idempotencyKey
              }
            });
            const parts = await mutate(transaction, receipt);
            const balance = await this.buildBalanceResponse(transaction, clientId);
            const result: FinanceMutationResponseDto = {
              receipt: toReceiptResponse(parts.receipt),
              movement: parts.movement ? toLedgerMovementResponse(parts.movement) : null,
              payment: parts.payment ? toPaymentResponse(parts.payment) : null,
              balance
            };
            await transaction.receipt.update({
              where: { id: receipt.id },
              data: { resultSnapshot: toJson(result) }
            });

            return auditedResult(result, {
              receiptId: receipt.id,
              folio: receipt.folio.toString(),
              operationType,
              movementId: parts.movement?.id ?? null,
              paymentId: parts.payment?.id ?? null
            });
          }
        });
      } catch (error) {
        if (hasPrismaCode(error, 'P2002')) {
          const raced = await this.findIdempotentResult(clientId, operationType, idempotencyKey);
          if (raced) {
            return raced;
          }
        }
        if (hasPrismaCode(error, 'P2034') && attempt < 19) {
          await waitForRetry(attempt);
          continue;
        }
        throw error;
      }
    }

    throw new DomainError(
      'FINANCE_LEDGER_INVARIANT_VIOLATION',
      'Finance operation could not be serialized.',
      HttpStatus.CONFLICT
    );
  }

  private async findIdempotentResult(
    clientId: string,
    operationType: string,
    idempotencyKey: string
  ): Promise<FinanceMutationResponseDto | null> {
    const receipt = await this.prisma.receipt.findUnique({
      where: { idempotencyKey },
      select: {
        clientId: true,
        operationType: true,
        resultSnapshot: true
      }
    });
    if (!receipt) {
      return null;
    }
    if (receipt.clientId !== clientId || receipt.operationType !== operationType) {
      throw new DomainError(
        'FINANCE_DUPLICATE_OPERATION',
        'Idempotency key is already assigned to another finance operation.',
        HttpStatus.CONFLICT
      );
    }

    return receipt.resultSnapshot as unknown as FinanceMutationResponseDto;
  }

  private async buildBalanceResponse(database: FinanceDatabase, clientId: string): Promise<FinanceBalanceResponseDto> {
    const [balance, creditLine, reconstruction] = await Promise.all([
      database.financeBalance.findUnique({ where: { clientId } }),
      database.creditLine.findUnique({ where: { clientId } }),
      this.reconstructBalance(database, clientId)
    ]);
    const cached = balance ?? zeroBalance(clientId);
    const creditLineLimit = creditLine?.limitCredits ?? cached.creditLineLimit;
    const lineAvailable = isCreditLineAvailable(creditLine) ? Math.max(0, creditLineLimit - cached.creditLineUsed) : 0;
    const matchesLedger =
      cached.purchasedCredits === reconstruction.purchased_credits &&
      cached.creditLineUsed === reconstruction.credit_line_used &&
      cached.debtCredits === reconstruction.debt_credits &&
      cached.debtMxnCents === reconstruction.debt_mxn_cents &&
      cached.lastLedgerSequence === reconstruction.last_ledger_sequence;

    return {
      clientId,
      purchasedCredits: cached.purchasedCredits,
      debtCredits: cached.debtCredits,
      debtMxnCents: safeBigIntNumber(cached.debtMxnCents, 'debtMxnCents'),
      creditLine: {
        limitCredits: creditLineLimit,
        usedCredits: cached.creditLineUsed,
        availableCredits: lineAvailable,
        status: creditLine?.status ?? null,
        assignedAt: creditLine?.assignedAt.toISOString() ?? null,
        expiresAt: creditLine?.expiresAt?.toISOString() ?? null,
        notes: creditLine?.notes ?? null
      },
      lastLedgerSequence: cached.lastLedgerSequence?.toString() ?? null,
      updatedAt: cached.updatedAt.toISOString(),
      reconciliation: {
        matchesLedger,
        purchasedCredits: reconstruction.purchased_credits,
        creditLineUsed: reconstruction.credit_line_used,
        debtCredits: reconstruction.debt_credits,
        debtMxnCents: safeBigIntNumber(reconstruction.debt_mxn_cents, 'reconstructedDebtMxnCents'),
        lastLedgerSequence: reconstruction.last_ledger_sequence?.toString() ?? null
      }
    };
  }

  private async reconstructBalance(database: FinanceDatabase, clientId: string): Promise<ReconstructionRow> {
    const rows = await database.$queryRaw<ReconstructionRow[]>`
      SELECT
        COALESCE(SUM("purchased_credit_delta"), 0)::INTEGER AS "purchased_credits",
        COALESCE(SUM("credit_line_used_delta"), 0)::INTEGER AS "credit_line_used",
        COALESCE(SUM("debt_delta"), 0)::INTEGER AS "debt_credits",
        COALESCE(SUM(
          CASE
            WHEN "movement_type" = 'CREDIT_LINE_USAGE'
              THEN "debt_delta"::BIGINT * "credit_unit_value_mxn_cents_snapshot"::BIGINT
            WHEN "movement_type" = 'DEBT_PAYMENT'
              THEN -"cash_mxn_delta"
            WHEN "debt_delta" <> 0
                 AND "credit_unit_value_mxn_cents_snapshot" IS NOT NULL
              THEN "debt_delta"::BIGINT * "credit_unit_value_mxn_cents_snapshot"::BIGINT
            ELSE 0
          END
        ), 0)::BIGINT AS "debt_mxn_cents",
        MAX("sequence")::BIGINT AS "last_ledger_sequence"
      FROM "ledger_entry"
      WHERE "client_id" = ${clientId}::uuid
    `;

    return (
      rows[0] ?? {
        purchased_credits: 0,
        credit_line_used: 0,
        debt_credits: 0,
        debt_mxn_cents: 0n,
        last_ledger_sequence: null
      }
    );
  }

  private async buildCut(from: Date, until: Date): Promise<FinanceCutResponseDto> {
    const [entries, pending] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { createdAt: { gte: from, lt: until } },
        orderBy: { sequence: 'asc' }
      }),
      this.prisma.financeBalance.aggregate({
        _sum: {
          purchasedCredits: true,
          debtCredits: true,
          debtMxnCents: true
        }
      })
    ]);
    let incomeMxnCents = 0n;
    let creditsSold = 0;
    let creditsGranted = 0;
    let creditsConsumed = 0;
    let creditsLent = 0;
    let debtGeneratedCredits = 0;
    let debtGeneratedMxnCents = 0n;
    let debtPaidCredits = 0;
    let debtPaidMxnCents = 0n;
    let internalRefundCredits = 0;
    let reversalCount = 0;

    for (const entry of entries) {
      if (entry.cashMxnDelta > 0) {
        incomeMxnCents += entry.cashMxnDelta;
      }
      switch (entry.movementType) {
        case LedgerMovementType.CREDIT_PURCHASE:
          creditsSold += entry.purchasedCreditDelta;
          break;
        case LedgerMovementType.MANUAL_CREDIT_GRANT:
          creditsGranted += entry.purchasedCreditDelta;
          break;
        case LedgerMovementType.EVENT_ACTIVATION_CHARGE:
          creditsConsumed += -entry.purchasedCreditDelta;
          break;
        case LedgerMovementType.CREDIT_LINE_USAGE:
          creditsLent += entry.creditLineUsedDelta;
          debtGeneratedCredits += entry.debtDelta;
          debtGeneratedMxnCents += BigInt(entry.debtDelta) * BigInt(entry.creditUnitValueMxnCentsSnapshot ?? 0);
          break;
        case LedgerMovementType.DEBT_PAYMENT:
          debtPaidCredits += -entry.debtDelta;
          debtPaidMxnCents += entry.cashMxnDelta;
          break;
        case LedgerMovementType.EVENT_CREDIT_REFUND:
          internalRefundCredits += Math.max(0, entry.purchasedCreditDelta) + Math.max(0, -entry.debtDelta);
          break;
        case LedgerMovementType.LEDGER_REVERSAL:
          reversalCount += 1;
          break;
        case LedgerMovementType.PROMOTION_DISCOUNT:
          break;
      }
    }

    return {
      from: from.toISOString(),
      until: until.toISOString(),
      incomeMxnCents: safeBigIntNumber(incomeMxnCents, 'incomeMxnCents'),
      creditsSold,
      creditsGranted,
      creditsConsumed,
      creditsLent,
      debtGeneratedCredits,
      debtGeneratedMxnCents: safeBigIntNumber(debtGeneratedMxnCents, 'debtGeneratedMxnCents'),
      debtPaidCredits,
      debtPaidMxnCents: safeBigIntNumber(debtPaidMxnCents, 'debtPaidMxnCents'),
      pendingDebtCredits: pending._sum.debtCredits ?? 0,
      pendingDebtMxnCents: safeBigIntNumber(pending._sum.debtMxnCents ?? 0n, 'pendingDebtMxnCents'),
      pendingPurchasedCredits: pending._sum.purchasedCredits ?? 0,
      internalRefundCredits,
      reversalCount
    };
  }

  private requirePrincipalClientId(principal: AuthPrincipal): string {
    if (!principal.clientId) {
      throw new DomainError(
        'FINANCE_CLIENT_CONTEXT_REQUIRED',
        'Finance access requires a Client context.',
        HttpStatus.FORBIDDEN
      );
    }
    return principal.clientId;
  }

  private async requireClient(database: FinanceDatabase, clientId: string, requireActive: boolean): Promise<void> {
    const client = await database.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { status: true }
    });
    if (!client) {
      throw new DomainError('CLIENT_NOT_FOUND', 'Client not found.', HttpStatus.NOT_FOUND);
    }
    if (requireActive && client.status !== ClientStatus.ACTIVE) {
      throw new DomainError('CLIENT_NOT_ACTIVE', 'Finance mutations require an active Client.', HttpStatus.CONFLICT);
    }
  }
}

function toLedgerMovementResponse(entry: LedgerEntry): LedgerMovementResponseDto {
  return {
    id: entry.id,
    sequence: entry.sequence.toString(),
    clientId: entry.clientId,
    movementType: entry.movementType,
    purchasedCreditDelta: entry.purchasedCreditDelta,
    creditLineUsedDelta: entry.creditLineUsedDelta,
    debtDelta: entry.debtDelta,
    cashMxnDelta: safeBigIntNumber(entry.cashMxnDelta, 'cashMxnDelta'),
    creditUnitValueMxnCentsSnapshot: entry.creditUnitValueMxnCentsSnapshot,
    currency: entry.currency,
    operationReference: entry.operationReference,
    paymentId: entry.paymentId,
    receiptId: entry.receiptId,
    dueAt: entry.dueAt?.toISOString() ?? null,
    allocationMetadata: asRecord(entry.allocationMetadata),
    metadata: asRecord(entry.metadata),
    createdAt: entry.createdAt.toISOString()
  };
}

function toPaymentResponse(payment: Payment): PaymentResponseDto {
  return {
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    amountMxnCents: safeBigIntNumber(payment.amountMxnCents, 'amountMxnCents'),
    currency: payment.currency,
    externalReference: payment.externalReference,
    idempotencyKey: payment.idempotencyKey,
    metadata: asRecord(payment.metadata),
    approvedAt: payment.approvedAt?.toISOString() ?? null
  };
}

function toReceiptResponse(receipt: Receipt): ReceiptResponseDto {
  return {
    id: receipt.id,
    folio: receipt.folio.toString(),
    clientId: receipt.clientId,
    operationType: receipt.operationType,
    operationReference: receipt.operationReference,
    createdAt: receipt.createdAt.toISOString()
  };
}

function zeroBalance(clientId: string): FinanceBalance {
  return {
    clientId,
    purchasedCredits: 0,
    creditLineLimit: 0,
    creditLineUsed: 0,
    debtCredits: 0,
    debtMxnCents: 0n,
    lastLedgerSequence: null,
    updatedAt: new Date(0)
  };
}

function isCreditLineAvailable(creditLine: CreditLine | null): boolean {
  return (
    creditLine?.status === CreditLineStatus.ACTIVE &&
    (creditLine.expiresAt === null || creditLine.expiresAt > new Date())
  );
}

function financeAllocationError(message: string): DomainError {
  return new DomainError('FINANCE_PAYMENT_ALLOCATION_INVALID', message, HttpStatus.CONFLICT);
}

function safeBigIntNumber(value: bigint, fieldName: string): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new DomainError(
      'FINANCE_LEDGER_INVARIANT_VIOLATION',
      `${fieldName} exceeds the supported API integer range.`,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
  return numberValue;
}

function toJson(value: unknown): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function paymentMetadata(
  metadata: Record<string, unknown> | undefined,
  notes: string | null | undefined
): Prisma.InputJsonObject | undefined {
  if (metadata === undefined && notes == null) {
    return undefined;
  }
  return toJson({
    ...(metadata ?? {}),
    ...(notes == null ? {} : { notes })
  });
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function parseUtcDay(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid UTC date.');
  }
  return date;
}

function parseUtcMonth(value: string): Date {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 7) !== value) {
    throw new DomainError('VALIDATION_ERROR', 'Invalid UTC month.');
  }
  return date;
}

function startOfCurrentUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfCurrentUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.min(100, 5 * (attempt + 1)));
  });
}
