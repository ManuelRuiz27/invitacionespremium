import { describe, expect, it } from 'vitest';
import type { ManagedCollectionPayment } from '../generated/prisma/client';
import { projectManagedCollections } from './managed-collection-projection';
import { addContractMonths, contractLocalDate } from './managed-contract-dates';
import { parseManagedCollectionPayment } from './managed-collections.dto';

const terms = {
  planId: '00000000-0000-4000-8000-000000000001',
  planVersionId: '00000000-0000-4000-8000-000000000002',
  modality: 'STANDARD',
  tier: 'ESSENTIAL',
  commercialName: 'Histórico',
  currency: 'MXN',
  beforeTax: true,
  monthlyAmountMxnCents: 790000,
  initialFeeMxnCents: 490000,
  extraEventAmountMxnCents: 125000,
  contractMonths: 12,
  includedEventsPerMonth: 4,
  monthlyEventLimit: 4,
  includedEventsPerYear: null,
  eventCapacity: 150,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null
};
const contract = (start: string) => ({
  startsOn: new Date(`${start}T00:00:00Z`),
  endsOn: new Date(`${addContractMonths(start, 12)}T00:00:00Z`),
  terms
});
const payment = (amount: number, reversed = false): ManagedCollectionPayment => ({
  id: 'payment',
  clientId: 'client',
  contractId: 'contract',
  concept: 'MONTHLY',
  installmentNumber: 1,
  extraordinaryChargeId: null,
  amountMxnCents: amount,
  effectiveOn: new Date('2027-01-01Z'),
  method: 'CASH',
  reference: null,
  notes: null,
  registeredAt: new Date('2027-01-01Z'),
  registeredByUserId: 'actor',
  reversedAt: reversed ? new Date('2027-01-02Z') : null,
  reversedByUserId: reversed ? 'actor' : null,
  reversalReason: reversed ? 'Corrección' : null
});

describe('PR03 collection calendar and balances', () => {
  it.each(['28', '29', '30', '31'])('anchors all twelve installments on January %s without February drift', (day) => {
    const state = projectManagedCollections(contract(`2027-01-${day}`), [], [], '2027-01-01', false);
    expect(state.obligations).toHaveLength(13);
    expect(state.obligations.slice(0, 4).map((row) => row.dueOn)).toEqual([
      `2027-01-${day}`,
      `2027-01-${day}`,
      '2027-02-28',
      `2027-03-${day}`
    ]);
    expect(state.obligations.at(-1)?.dueOn).toBe(`2027-12-${day}`);
    expect(state.summary).toEqual({
      totalMxnCents: 9970000,
      paidMxnCents: 0,
      balanceMxnCents: 9970000,
      overdueMxnCents: 0,
      dueMxnCents: 0,
      futureMxnCents: 9970000
    });
  });
  it('handles leap February and retains the original anchor', () => {
    const state = projectManagedCollections(contract('2028-01-31'), [], [], '2028-02-01', false);
    expect(state.obligations[2]?.dueOn).toBe('2028-02-29');
    expect(state.obligations[3]?.dueOn).toBe('2028-03-31');
    expect(
      projectManagedCollections(contract('2028-02-29'), [], [], '2028-02-29', false).obligations.at(-1)?.dueOn
    ).toBe('2029-01-29');
  });
  it('keeps partial overdue payments visible, excludes reversals and leaves future installments in the future', () => {
    const state = projectManagedCollections(
      contract('2027-01-31'),
      [],
      [payment(100000), payment(50000, true)],
      '2027-02-01',
      false
    );
    expect(state.obligations[1]).toMatchObject({
      status: 'PARTIAL',
      overdue: true,
      paidMxnCents: 100000,
      balanceMxnCents: 690000
    });
    expect(state.obligations[2]).toMatchObject({ status: 'PENDING', overdue: false, paidMxnCents: 0 });
    expect(state.summary).toMatchObject({ paidMxnCents: 100000, overdueMxnCents: 1180000, futureMxnCents: 8690000 });
    expect(state.alerts.overdueInstallments).toBe(1);
    expect(
      projectManagedCollections(contract('2027-01-31'), [], [payment(790000)], '2027-02-01', false).obligations[1]
    ).toMatchObject({ status: 'PAID', overdue: false, balanceMxnCents: 0 });
  });
  it('does not mark the due day overdue and accepts a zero implementation fee', () => {
    const state = projectManagedCollections(
      { ...contract('2027-01-31'), terms: { ...terms, initialFeeMxnCents: 0 } },
      [],
      [],
      '2027-01-31',
      false
    );
    expect(state.obligations[0]).toMatchObject({ status: 'PAID', amountMxnCents: 0 });
    expect(state.obligations[1]).toMatchObject({ status: 'PENDING', overdue: false });
    expect(state.summary.dueMxnCents).toBe(790000);
  });
  it('derives renewal alerts using calendar days without renewing or repricing', () => {
    const c = contract('2027-01-31');
    expect(projectManagedCollections(c, [], [], '2028-01-01', false).alerts.endingWithin30Days).toBe(true);
    expect(projectManagedCollections(c, [], [], '2027-12-31', false).alerts.endingWithin30Days).toBe(false);
    expect(projectManagedCollections(c, [], [], '2028-01-31', false).alerts).toMatchObject({
      endingWithin30Days: false,
      expiredWithoutSuccessor: true
    });
    expect(projectManagedCollections(c, [], [], '2028-01-31', true).alerts.expiredWithoutSuccessor).toBe(false);
    expect(contractLocalDate(new Date('2027-02-01T05:59:59Z'))).toBe('2027-01-31');
  });
  it('rejects contradictory concepts, non-integer money, invalid dates and unsolicited business fields', () => {
    const valid = {
      concept: 'MONTHLY',
      installmentNumber: 1,
      extraordinaryChargeId: null,
      amountMxnCents: 1,
      effectiveOn: '2028-02-29',
      method: 'TRANSFER',
      reference: null,
      notes: null
    };
    expect(parseManagedCollectionPayment(valid)).toEqual(valid);
    for (const patch of [
      { amountMxnCents: 0 },
      { amountMxnCents: 1.5 },
      { amountMxnCents: 2147483648 },
      { installmentNumber: 13 },
      { installmentNumber: null },
      { concept: 'IMPLEMENTATION' },
      { effectiveOn: '2027-02-29' },
      { discount: 10 },
      { currency: 'USD' }
    ])
      expect(() => parseManagedCollectionPayment({ ...valid, ...patch })).toThrow();
  });
});
