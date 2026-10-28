import type {
  ManagedCollectionPayment,
  ManagedExtraordinaryCharge,
  ManagedPlanContract
} from '../generated/prisma/client';
import { addContractMonths, contractDate } from './managed-contract-dates';
import { parseManagedContractTerms } from './managed-contracts.dto';
import type {
  ManagedCollectionAlertsDto,
  ManagedCollectionObligationDto,
  ManagedCollectionSummaryDto
} from './managed-collections.dto';

export function collectionObligationId(
  value: Pick<ManagedCollectionPayment, 'concept' | 'installmentNumber' | 'extraordinaryChargeId'>
): string {
  return value.concept === 'MONTHLY'
    ? `MONTHLY:${value.installmentNumber}`
    : value.concept === 'EXTRAORDINARY'
      ? `EXTRAORDINARY:${value.extraordinaryChargeId}`
      : 'IMPLEMENTATION';
}

export function projectManagedCollections(
  contract: Pick<ManagedPlanContract, 'startsOn' | 'endsOn' | 'terms'>,
  charges: ManagedExtraordinaryCharge[],
  payments: ManagedCollectionPayment[],
  today: string,
  hasSuccessor: boolean
): {
  obligations: ManagedCollectionObligationDto[];
  summary: ManagedCollectionSummaryDto;
  alerts: ManagedCollectionAlertsDto;
} {
  const terms = parseManagedContractTerms(contract.terms);
  const startsOn = contractDate(contract.startsOn);
  const totals = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.reversedAt) {
      const id = collectionObligationId(payment);
      totals.set(id, (totals.get(id) ?? 0) + payment.amountMxnCents);
    }
  }
  type Base = Pick<
    ManagedCollectionObligationDto,
    'concept' | 'installmentNumber' | 'extraordinaryChargeId' | 'eventId' | 'label' | 'dueOn' | 'amountMxnCents'
  >;
  const bases: Base[] = [
    {
      concept: 'IMPLEMENTATION',
      installmentNumber: null,
      extraordinaryChargeId: null,
      eventId: null,
      label: 'Implementación',
      dueOn: startsOn,
      amountMxnCents: terms.initialFeeMxnCents
    }
  ];
  for (let index = 0; index < 12; index++)
    bases.push({
      concept: 'MONTHLY',
      installmentNumber: index + 1,
      extraordinaryChargeId: null,
      eventId: null,
      label: `Mensualidad ${index + 1}`,
      dueOn: addContractMonths(startsOn, index),
      amountMxnCents: terms.monthlyAmountMxnCents
    });
  for (const charge of charges)
    bases.push({
      concept: 'EXTRAORDINARY',
      installmentNumber: null,
      extraordinaryChargeId: charge.id,
      eventId: charge.eventId,
      label: 'Evento extraordinario',
      dueOn: contractDate(charge.dueOn),
      amountMxnCents: charge.amountMxnCents
    });
  const obligations = bases.map((base): ManagedCollectionObligationDto => {
    const id = collectionObligationId(base),
      paidMxnCents = totals.get(id) ?? 0;
    const balanceMxnCents = base.amountMxnCents - paidMxnCents;
    if (balanceMxnCents < 0) throw new Error('Managed collection balance is inconsistent.');
    const overdue = balanceMxnCents > 0 && base.dueOn < today;
    return {
      ...base,
      id,
      paidMxnCents,
      balanceMxnCents,
      overdue,
      status: balanceMxnCents === 0 ? 'PAID' : paidMxnCents > 0 ? 'PARTIAL' : overdue ? 'OVERDUE' : 'PENDING'
    };
  });
  const summary = obligations.reduce<ManagedCollectionSummaryDto>(
    (sum, row) => ({
      totalMxnCents: sum.totalMxnCents + row.amountMxnCents,
      paidMxnCents: sum.paidMxnCents + row.paidMxnCents,
      balanceMxnCents: sum.balanceMxnCents + row.balanceMxnCents,
      overdueMxnCents: sum.overdueMxnCents + (row.overdue ? row.balanceMxnCents : 0),
      dueMxnCents: sum.dueMxnCents + (row.dueOn <= today ? row.balanceMxnCents : 0),
      futureMxnCents: sum.futureMxnCents + (row.dueOn > today ? row.balanceMxnCents : 0)
    }),
    { totalMxnCents: 0, paidMxnCents: 0, balanceMxnCents: 0, overdueMxnCents: 0, dueMxnCents: 0, futureMxnCents: 0 }
  );
  const daysRemaining = (contract.endsOn.valueOf() - new Date(`${today}T00:00:00Z`).valueOf()) / 86400000;
  return {
    obligations,
    summary,
    alerts: {
      overdueInstallments: obligations.filter((row) => row.concept === 'MONTHLY' && row.overdue).length,
      endingWithin30Days: daysRemaining > 0 && daysRemaining <= 30,
      expiredWithoutSuccessor: daysRemaining <= 0 && !hasSuccessor
    }
  };
}
