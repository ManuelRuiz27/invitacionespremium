import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import type { ManagedPlanContract, Prisma } from '../generated/prisma/client';
import { ManagedPlanMutationsService, requireManagedPlanProvider } from './managed-plan-mutations.service';
import { managedContractConsumption } from './managed-contracts.service';
import { contractDate, contractLocalDate } from './managed-contract-dates';
import { parseManagedContractTerms } from './managed-contracts.dto';
import { collectionObligationId, projectManagedCollections } from './managed-collection-projection';
import type {
  ManagedCollectionHistoryEntryDto,
  ManagedCollectionPaymentInput,
  ManagedCollectionReversalInput,
  ManagedCollectionsResponseDto,
  ManagedExtraordinaryChargeInput
} from './managed-collections.dto';

@Injectable()
export class ManagedCollectionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ManagedPlanMutationsService) private readonly mutations: ManagedPlanMutationsService
  ) {}

  list(clientId: string, contractId: string, principal: AuthPrincipal): Promise<ManagedCollectionsResponseDto> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await requireManagedPlanProvider(tx, principal);
        return collectionsState(tx, await requireContract(tx, clientId, contractId));
      },
      { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10_000 }
    );
  }

  pay(
    clientId: string,
    contractId: string,
    key: string,
    input: ManagedCollectionPaymentInput,
    principal: AuthPrincipal,
    operationId?: string
  ) {
    return this.mutations.run(
      'COLLECTION_PAYMENT',
      key,
      principal,
      { clientId, contractId, input },
      async (tx) => {
        const contract = await requireContract(tx, clientId, contractId, true);
        const state = await collectionsState(tx, contract);
        if (input.effectiveOn > state.today)
          throw conflict('MANAGED_PAYMENT_FUTURE_DATE', 'The effective payment date cannot be in the future.');
        const obligation = state.obligations.find((row) => row.id === collectionObligationId(input));
        if (!obligation)
          throw conflict('MANAGED_PAYMENT_CONCEPT_NOT_FOUND', 'The obligation does not belong to this contract.');
        if (input.amountMxnCents > obligation.balanceMxnCents)
          throw conflict('MANAGED_PAYMENT_EXCEEDS_BALANCE', 'The payment exceeds the outstanding balance.');
        const payment = await tx.managedCollectionPayment.create({
          data: {
            ...input,
            contractId,
            clientId,
            effectiveOn: new Date(`${input.effectiveOn}T00:00:00Z`),
            registeredByUserId: principal.userId
          }
        });
        return {
          result: await collectionsState(tx, contract),
          audit: {
            clientId,
            resourceType: 'MANAGED_COLLECTION_PAYMENT',
            resourceId: payment.id,
            action: 'MANAGED_COLLECTION_PAYMENT_REGISTER',
            afterData: { ...input, contractId, paymentId: payment.id, registeredAt: payment.registeredAt.toISOString() }
          }
        };
      },
      operationId
    );
  }

  reverse(
    clientId: string,
    contractId: string,
    paymentId: string,
    key: string,
    input: ManagedCollectionReversalInput,
    principal: AuthPrincipal,
    operationId?: string
  ) {
    return this.mutations.run(
      'COLLECTION_REVERSE',
      key,
      principal,
      { clientId, contractId, paymentId, input },
      async (tx) => {
        const contract = await requireContract(tx, clientId, contractId, true);
        const payment = await tx.managedCollectionPayment.findFirst({ where: { id: paymentId, contractId, clientId } });
        if (!payment)
          throw new DomainError('MANAGED_PAYMENT_NOT_FOUND', 'Managed payment not found.', HttpStatus.NOT_FOUND);
        if (payment.reversedAt)
          throw conflict('MANAGED_PAYMENT_ALREADY_REVERSED', 'This payment has already been reversed.');
        const now = await transactionNow(tx);
        await tx.managedCollectionPayment.update({
          where: { id: payment.id },
          data: {
            reversedAt: now,
            reversedByUserId: principal.userId,
            reversalReason: input.reason
          }
        });
        return {
          result: await collectionsState(tx, contract),
          audit: {
            clientId,
            resourceType: 'MANAGED_COLLECTION_PAYMENT',
            resourceId: payment.id,
            action: 'MANAGED_COLLECTION_PAYMENT_REVERSE',
            beforeData: { contractId, paymentId, amountMxnCents: payment.amountMxnCents, reversedAt: null },
            afterData: {
              contractId,
              paymentId,
              amountMxnCents: payment.amountMxnCents,
              reversedAt: now.toISOString(),
              reason: input.reason
            }
          }
        };
      },
      operationId
    );
  }

  confirmExtra(
    clientId: string,
    contractId: string,
    key: string,
    input: ManagedExtraordinaryChargeInput,
    principal: AuthPrincipal,
    operationId?: string
  ) {
    return this.mutations.run(
      'COLLECTION_EXTRA_CONFIRM',
      key,
      principal,
      { clientId, contractId, input },
      async (tx) => {
        const contract = await requireContract(tx, clientId, contractId, true);
        const consumption = await managedContractConsumption(tx, contract);
        const candidate = consumption.events.find((event) => event.eventId === input.eventId && event.extraordinary);
        if (!candidate)
          throw conflict(
            'MANAGED_EXTRA_NOT_ELIGIBLE',
            'The event is not an extraordinary activation of this contract.'
          );
        if (
          await tx.managedExtraordinaryCharge.findUnique({
            where: { contractId_eventId: { contractId, eventId: input.eventId } }
          })
        ) {
          throw conflict('MANAGED_EXTRA_ALREADY_CONFIRMED', 'The extraordinary charge has already been confirmed.');
        }
        const today = contractLocalDate(await transactionNow(tx));
        const amountMxnCents = parseManagedContractTerms(contract.terms).extraEventAmountMxnCents;
        const charge = await tx.managedExtraordinaryCharge.create({
          data: {
            contractId,
            clientId,
            eventId: input.eventId,
            amountMxnCents,
            dueOn: new Date(`${today}T00:00:00Z`),
            confirmedByUserId: principal.userId
          }
        });
        return {
          result: await collectionsState(tx, contract),
          audit: {
            clientId,
            eventId: input.eventId,
            resourceType: 'MANAGED_EXTRAORDINARY_CHARGE',
            resourceId: charge.id,
            action: 'MANAGED_EXTRAORDINARY_CHARGE_CONFIRM',
            afterData: {
              contractId,
              eventId: input.eventId,
              amountMxnCents,
              dueOn: today,
              cancelled: candidate.cancelled,
              confirmedAt: charge.confirmedAt.toISOString()
            }
          }
        };
      },
      operationId
    );
  }
}

async function requireContract(tx: Prisma.TransactionClient, clientId: string, contractId: string, lock = false) {
  if (lock)
    await tx.$queryRaw`SELECT id FROM managed_plan_contract WHERE id=${contractId}::uuid AND client_id=${clientId}::uuid FOR UPDATE`;
  const contract = await tx.managedPlanContract.findFirst({
    where: { id: contractId, clientId, client: { deletedAt: null } }
  });
  if (!contract)
    throw new DomainError('MANAGED_CONTRACT_NOT_FOUND', 'Managed contract not found.', HttpStatus.NOT_FOUND);
  return contract;
}
async function transactionNow(tx: Prisma.TransactionClient) {
  return (await tx.$queryRaw<{ now: Date }[]>`SELECT transaction_timestamp() AS now`)[0]!.now;
}
function conflict(code: string, message: string) {
  return new DomainError(code, message, HttpStatus.CONFLICT);
}

async function collectionsState(
  tx: Prisma.TransactionClient,
  contract: ManagedPlanContract
): Promise<ManagedCollectionsResponseDto> {
  const today = contractLocalDate(await transactionNow(tx));
  const charges = await tx.managedExtraordinaryCharge.findMany({
    where: { contractId: contract.id },
    orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }]
  });
  const payments = await tx.managedCollectionPayment.findMany({
    where: { contractId: contract.id },
    orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }]
  });
  const successor = await tx.managedPlanContract.findFirst({
    where: { clientId: contract.clientId, startsOn: { gte: contract.endsOn } },
    select: { id: true }
  });
  const consumption = await managedContractConsumption(tx, contract);
  const eventIds = [
    ...new Set([
      ...consumption.events.filter((row) => row.extraordinary).map((row) => row.eventId),
      ...charges.map((row) => row.eventId)
    ])
  ];
  const events = await tx.event.findMany({
    where: { id: { in: eventIds }, clientId: contract.clientId },
    select: { id: true, name: true, eventDateTime: true }
  });
  const eventMap = new Map(events.map((row) => [row.id, row]));
  const actorIds = [
    ...new Set([
      ...payments.flatMap((row) => [row.registeredByUserId, ...(row.reversedByUserId ? [row.reversedByUserId] : [])]),
      ...charges.map((row) => row.confirmedByUserId)
    ])
  ];
  const actors = await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
  const actorLabel = (id: string) => actors.find((row) => row.id === id)?.email ?? 'Administrador registrado';
  const history: ManagedCollectionHistoryEntryDto[] = [];
  for (const payment of payments) {
    const base = {
      paymentId: payment.id,
      extraordinaryChargeId: payment.extraordinaryChargeId,
      obligationId: collectionObligationId(payment),
      amountMxnCents: payment.amountMxnCents,
      effectiveOn: contractDate(payment.effectiveOn),
      method: payment.method as ManagedCollectionPaymentInput['method'],
      reference: payment.reference,
      notes: payment.notes,
      reversalReason: null,
      reversed: payment.reversedAt !== null
    };
    history.push({
      ...base,
      id: `${payment.id}:payment`,
      kind: 'PAYMENT',
      occurredAt: payment.registeredAt.toISOString(),
      actorUserId: payment.registeredByUserId,
      actorLabel: actorLabel(payment.registeredByUserId)
    });
    if (payment.reversedAt && payment.reversedByUserId)
      history.push({
        ...base,
        id: `${payment.id}:reversal`,
        kind: 'REVERSAL',
        occurredAt: payment.reversedAt.toISOString(),
        actorUserId: payment.reversedByUserId,
        actorLabel: actorLabel(payment.reversedByUserId),
        reversalReason: payment.reversalReason
      });
  }
  for (const charge of charges)
    history.push({
      id: `${charge.id}:confirmation`,
      kind: 'EXTRA_CONFIRM',
      paymentId: null,
      extraordinaryChargeId: charge.id,
      obligationId: `EXTRAORDINARY:${charge.id}`,
      amountMxnCents: charge.amountMxnCents,
      effectiveOn: contractDate(charge.dueOn),
      occurredAt: charge.confirmedAt.toISOString(),
      actorUserId: charge.confirmedByUserId,
      actorLabel: actorLabel(charge.confirmedByUserId),
      method: null,
      reference: null,
      notes: null,
      reversalReason: null,
      reversed: false
    });
  history.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const projected = projectManagedCollections(contract, charges, payments, today, successor !== null);
  for (const obligation of projected.obligations)
    if (obligation.eventId) obligation.label = `Extraordinario: ${eventMap.get(obligation.eventId)?.name ?? 'Evento'}`;
  return {
    clientId: contract.clientId,
    contractId: contract.id,
    today,
    currency: 'MXN',
    beforeTax: true,
    ...projected,
    extraordinaryCandidates: consumption.events
      .filter((row) => row.extraordinary)
      .map((row) => ({
        eventId: row.eventId,
        name: row.name,
        eventDateTime: eventMap.get(row.eventId)?.eventDateTime?.toISOString() ?? null,
        activatedAt: row.activatedAt,
        cancelled: row.cancelled,
        amountMxnCents: parseManagedContractTerms(contract.terms).extraEventAmountMxnCents,
        confirmedChargeId: charges.find((charge) => charge.eventId === row.eventId)?.id ?? null
      })),
    history
  };
}
