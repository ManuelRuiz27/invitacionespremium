import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';

const at = '2026-10-27T12:00:00.000Z';
const version = {
  id: 'version-a',
  planId: 'plan-a',
  commercialName: 'Esencial',
  monthlyAmountMxnCents: 790000,
  initialFeeMxnCents: 490000,
  extraEventAmountMxnCents: 125000,
  contractMonths: 12,
  includedEventsPerMonth: 4,
  monthlyEventLimit: 4,
  includedEventsPerYear: null,
  eventCapacity: 150,
  validFrom: at,
  validUntil: null,
  createdByUserId: null,
  createdAt: at,
  status: 'CURRENT'
} as const;
const plan = {
  id: 'plan-a',
  modality: 'STANDARD',
  tier: 'ESSENTIAL',
  isAvailable: true,
  currentVersionId: version.id,
  versions: [version],
  createdAt: at,
  updatedAt: at
} as const;
const { id: _versionId, createdAt: _createdAt, createdByUserId: _createdBy, status: _status, ...terms } = version;
const contract = {
  id: 'contract-a',
  clientId: 'client-a',
  planVersionId: version.id,
  startsOn: '2026-10-27',
  endsOn: '2027-10-27',
  acceptedAt: at,
  createdAt: at,
  createdByUserId: 'provider-a',
  status: 'CURRENT',
  terms: {
    ...terms,
    planVersionId: version.id,
    modality: 'STANDARD',
    tier: 'ESSENTIAL',
    currency: 'MXN',
    beforeTax: true
  }
};
const consumption = {
  contractId: contract.id,
  clientId: contract.clientId,
  asOf: at,
  currentPeriodIndex: 1,
  usedEvents: 1,
  includedUsedEvents: 1,
  extraordinaryEvents: 0,
  cancelledEvents: 1,
  availableEvents: 3,
  annualAvailableEvents: null,
  periods: [
    {
      index: 1,
      startsOn: '2026-10-27',
      endsOn: '2026-11-27',
      usedEvents: 1,
      includedUsedEvents: 1,
      extraordinaryEvents: 0,
      cancelledEvents: 1,
      availableEvents: 3
    }
  ],
  events: [
    {
      eventId: 'event-a',
      name: 'Evento cancelado',
      activatedAt: at,
      status: 'CANCELLED',
      periodIndex: 1,
      extraordinary: false,
      cancelled: true
    }
  ]
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

describe('Admin managed commercial plans client', () => {
  it('uses administrative routes, exact mutation bodies and idempotency keys with cookie and AbortSignal', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    for (const value of [[plan], version, plan, [contract], contract, consumption])
      fetchImpl.mockResolvedValueOnce(json(value));
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    const signal = new AbortController().signal;
    const input = {
      commercialName: version.commercialName,
      monthlyAmountMxnCents: version.monthlyAmountMxnCents,
      initialFeeMxnCents: version.initialFeeMxnCents,
      extraEventAmountMxnCents: version.extraEventAmountMxnCents,
      contractMonths: version.contractMonths,
      includedEventsPerMonth: version.includedEventsPerMonth,
      monthlyEventLimit: version.monthlyEventLimit,
      includedEventsPerYear: version.includedEventsPerYear,
      eventCapacity: version.eventCapacity
    };
    await api.adminManagedPlans.list(signal);
    await api.adminManagedPlans.createVersion('plan/a', input, 'version-key', signal);
    await api.adminManagedPlans.setAvailability('plan/a', { isAvailable: false }, 'availability-key', signal);
    await api.adminManagedPlans.listContracts('client/a', signal);
    await api.adminManagedPlans.assignContract(
      'client/a',
      { planVersionId: version.id, startsOn: '2026-10-27' },
      'contract-key',
      signal
    );
    await api.adminManagedPlans.getConsumption('client/a', 'contract/a', signal);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.com/api/v1/admin/managed-plans',
      'https://api.example.com/api/v1/admin/managed-plans/plan%2Fa/versions',
      'https://api.example.com/api/v1/admin/managed-plans/plan%2Fa/availability',
      'https://api.example.com/api/v1/admin/clients/client%2Fa/managed-contracts',
      'https://api.example.com/api/v1/admin/clients/client%2Fa/managed-contracts',
      'https://api.example.com/api/v1/admin/clients/client%2Fa/managed-contracts/contract%2Fa/consumption'
    ]);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.signal === signal && init.credentials === 'include')).toBe(
      true
    );
    expect(fetchImpl.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual([
      null,
      'version-key',
      'availability-key',
      null,
      'contract-key',
      null
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body))).toEqual(input);
  });

  it.each([
    [plan, { ...plan, modality: 'SELF_SERVICE' }],
    [plan, { ...plan, versions: [{ ...version, monthlyAmountMxnCents: 7.9 }] }],
    [plan, { ...plan, currentVersionId: 'missing' }],
    [plan, { ...plan, versions: [version, version] }]
  ])('rejects malformed catalog responses without fabricating a plan', async (_valid, invalid) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json([invalid]));
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await expect(api.adminManagedPlans.list()).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it('rejects a contract whose immutable terms identify another price version', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json([{ ...contract, planVersionId: 'another' }]));
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await expect(api.adminManagedPlans.listContracts('client-a')).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });

  it.each([
    { ...consumption, events: [...consumption.events, ...consumption.events], usedEvents: 2 },
    { ...consumption, usedEvents: 2 },
    { ...consumption, includedUsedEvents: 0 },
    { ...consumption, cancelledEvents: 0 },
    { ...consumption, currentPeriodIndex: null },
    { ...consumption, periods: [{ ...consumption.periods[0], usedEvents: -1 }] }
  ])('rejects inconsistent or duplicated consumption counts', async (invalid) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(invalid));
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await expect(api.adminManagedPlans.getConsumption('client-a', 'contract-a')).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });

  it('propagates a network failure without retrying a commercial mutation', async () => {
    const failure = new TypeError('Network unavailable');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await expect(
      api.adminManagedPlans.assignContract(
        'client-a',
        { planVersionId: version.id, startsOn: '2026-10-27' },
        'stable-key'
      )
    ).rejects.toBe(failure);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
