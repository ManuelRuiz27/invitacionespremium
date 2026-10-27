import { describe, expect, it } from 'vitest';
import { EventStatus } from '../generated/prisma/client';
import type { ManagedContractTermsDto } from './managed-contracts.dto';
import { projectManagedConsumption, type ManagedConsumptionEvent } from './managed-contract-consumption';

const terms: ManagedContractTermsDto = {
  planId: 'plan-a',
  planVersionId: 'version-a',
  modality: 'STANDARD',
  tier: 'FREQUENT',
  commercialName: 'Frecuente',
  currency: 'MXN',
  beforeTax: true,
  monthlyAmountMxnCents: 990000,
  initialFeeMxnCents: 490000,
  extraEventAmountMxnCents: 125000,
  contractMonths: 12,
  includedEventsPerMonth: 8,
  monthlyEventLimit: 12,
  includedEventsPerYear: 96,
  eventCapacity: 150,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null
};
const contract = {
  id: 'contract-a',
  clientId: 'client-a',
  startsOn: new Date('2027-01-31T00:00:00.000Z'),
  endsOn: new Date('2028-01-31T00:00:00.000Z')
};
function event(id: string, activatedAt: string, status: EventStatus = EventStatus.ACTIVE): ManagedConsumptionEvent {
  return { id, name: id, activatedAt: new Date(activatedAt), status };
}

describe('Managed contract consumption projection', () => {
  it('uses original monthly anniversaries in Mexico City and half-open boundaries', () => {
    const result = projectManagedConsumption(
      contract,
      terms,
      [
        event('before', '2027-01-31T05:59:59.999Z'),
        event('first', '2027-01-31T06:00:00.000Z'),
        event('last-first-month', '2027-02-28T05:59:59.999Z'),
        event('second', '2027-02-28T06:00:00.000Z'),
        event('third', '2027-03-31T06:00:00.000Z'),
        event('end-exclusive', '2028-01-31T06:00:00.000Z')
      ],
      new Date('2028-01-31T06:00:00.000Z')
    );
    expect(
      result.periods.slice(0, 3).map(({ startsOn, endsOn, usedEvents }) => ({ startsOn, endsOn, usedEvents }))
    ).toEqual([
      { startsOn: '2027-01-31', endsOn: '2027-02-28', usedEvents: 2 },
      { startsOn: '2027-02-28', endsOn: '2027-03-31', usedEvents: 1 },
      { startsOn: '2027-03-31', endsOn: '2027-04-30', usedEvents: 1 }
    ]);
    expect(result.usedEvents).toBe(4);
    expect(result.currentPeriodIndex).toBeNull();
    expect(result.availableEvents).toBe(0);
  });

  it('limits Frequent to twelve included events in a month and keeps extras outside the annual pool', () => {
    const events = Array.from({ length: 13 }, (_, index) =>
      event(`id-${String(index).padStart(2, '0')}`, '2027-02-01T12:00:00.000Z')
    );
    const result = projectManagedConsumption(contract, terms, events.reverse(), new Date('2027-02-10T12:00:00.000Z'));
    expect(result).toMatchObject({
      usedEvents: 13,
      includedUsedEvents: 12,
      extraordinaryEvents: 1,
      availableEvents: 0,
      annualAvailableEvents: 84
    });
    expect(result.events.at(-1)).toMatchObject({ eventId: 'id-12', extraordinary: true });
    expect(result.periods[1]).toMatchObject({ usedEvents: 0, availableEvents: 12 });
  });

  it('caps the whole Frequent annual pool at 96 rather than allocating 12 times 12', () => {
    const events = Array.from({ length: 9 }, (_, month) =>
      Array.from({ length: 12 }, (_, index) =>
        event(`${month}-${index}`, `2027-${String(month + 2).padStart(2, '0')}-10T12:00:00.000Z`)
      )
    ).flat();
    const result = projectManagedConsumption(contract, terms, events, new Date('2027-11-01T12:00:00.000Z'));
    expect(result).toMatchObject({
      usedEvents: 108,
      includedUsedEvents: 96,
      extraordinaryEvents: 12,
      availableEvents: 0,
      annualAvailableEvents: 0
    });
    expect(result.periods[8]).toMatchObject({ includedUsedEvents: 0, extraordinaryEvents: 12 });
  });

  it.each([
    ['ESSENTIAL', 4],
    ['INTENSIVE', 12]
  ] as const)('keeps %s monthly allowance without carrying unused events into later periods', (tier, monthly) => {
    const monthlyTerms: ManagedContractTermsDto = {
      ...terms,
      tier,
      includedEventsPerYear: null,
      includedEventsPerMonth: monthly,
      monthlyEventLimit: monthly
    };
    const rows = [
      event('first-month', '2027-02-01T12:00:00.000Z'),
      ...Array.from({ length: monthly + 1 }, (_, index) => event(`second-month-${index}`, '2027-03-01T12:00:00.000Z'))
    ];
    const result = projectManagedConsumption(contract, monthlyTerms, rows, new Date('2027-03-10T12:00:00.000Z'));
    expect(result.periods[0]).toMatchObject({ includedUsedEvents: 1, availableEvents: monthly - 1 });
    expect(result.periods[1]).toMatchObject({
      includedUsedEvents: monthly,
      extraordinaryEvents: 1,
      availableEvents: 0
    });
    expect(result.annualAvailableEvents).toBeNull();
  });

  it('deduplicates event identity, ignores future activation facts and counts cancellations without refund', () => {
    const actual = event('real', '2027-02-01T12:00:00.000Z', EventStatus.CANCELLED);
    const result = projectManagedConsumption(
      contract,
      terms,
      [actual, actual, event('future', '2027-02-20T12:00:00.000Z')],
      new Date('2027-02-10T12:00:00.000Z')
    );
    expect(result).toMatchObject({
      usedEvents: 1,
      includedUsedEvents: 1,
      cancelledEvents: 1,
      availableEvents: 11,
      annualAvailableEvents: 95
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ eventId: 'real', cancelled: true, extraordinary: false });
  });

  it('preserves a complete year of unused history with no current availability before or after the contract', () => {
    for (const asOf of ['2027-01-01T12:00:00Z', '2028-02-01T12:00:00Z']) {
      expect(projectManagedConsumption(contract, terms, [], new Date(asOf))).toMatchObject({
        usedEvents: 0,
        currentPeriodIndex: null,
        availableEvents: 0,
        annualAvailableEvents: 96
      });
    }
  });

  it('does not mutate its input facts when sorting or computing quotas', () => {
    const rows = [event('z', '2027-02-02T12:00:00.000Z'), event('a', '2027-02-01T12:00:00.000Z')];
    const result = projectManagedConsumption(contract, terms, rows, new Date('2027-02-10T12:00:00.000Z'));
    expect(rows.map(({ id }) => id)).toEqual(['z', 'a']);
    expect(result.events.map(({ eventId }) => eventId)).toEqual(['a', 'z']);
  });
});
