import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';
import type { AdminManagedCollections, RegisterManagedPaymentInput } from './managed-collections';

const state: AdminManagedCollections = {
  clientId: 'client',
  contractId: 'contract',
  today: '2026-10-28',
  currency: 'MXN',
  beforeTax: true,
  summary: {
    totalMxnCents: 100,
    paidMxnCents: 0,
    balanceMxnCents: 100,
    overdueMxnCents: 0,
    dueMxnCents: 100,
    futureMxnCents: 0
  },
  alerts: { overdueInstallments: 0, endingWithin30Days: false, expiredWithoutSuccessor: false },
  obligations: [
    {
      id: 'MONTHLY:1',
      concept: 'MONTHLY',
      installmentNumber: 1,
      extraordinaryChargeId: null,
      eventId: null,
      label: 'Mensualidad 1',
      dueOn: '2026-10-28',
      amountMxnCents: 100,
      paidMxnCents: 0,
      balanceMxnCents: 100,
      status: 'PENDING',
      overdue: false
    }
  ],
  extraordinaryCandidates: [],
  history: []
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
describe('PR03 typed commercial collection client', () => {
  it('uses scoped administrative routes, exact payloads and idempotency keys with cookies and cancellation', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    for (const response of [state, [], state, state, state]) fetchImpl.mockResolvedValueOnce(json(response));
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    const signal = new AbortController().signal;
    const body: RegisterManagedPaymentInput = {
      concept: 'MONTHLY',
      installmentNumber: 1,
      extraordinaryChargeId: null,
      amountMxnCents: 100,
      effectiveOn: '2026-10-28',
      method: 'CASH',
      reference: null,
      notes: null
    };
    await api.adminManagedPlans.getCollections('client/a', 'contract/a', signal);
    await api.adminManagedPlans.getCollectionHistory('client/a', 'contract/a', signal);
    await api.adminManagedPlans.registerPayment('client/a', 'contract/a', body, 'payment-key', signal);
    await api.adminManagedPlans.reversePayment(
      'client/a',
      'contract/a',
      'payment/a',
      { reason: 'Correction' },
      'reverse-key',
      signal
    );
    await api.adminManagedPlans.confirmExtraordinary(
      'client/a',
      'contract/a',
      { eventId: 'event-a' },
      'extra-key',
      signal
    );
    const base = 'https://api.example.com/api/v1/admin/clients/client%2Fa/managed-contracts/contract%2Fa/collections';
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      base,
      `${base}/history`,
      `${base}/payments`,
      `${base}/payments/payment%2Fa/reverse`,
      `${base}/extraordinary-charges`
    ]);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.credentials === 'include' && init.signal === signal)).toBe(
      true
    );
    expect(fetchImpl.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual([
      null,
      null,
      'payment-key',
      'reverse-key',
      'extra-key'
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[2]![1]!.body))).toEqual(body);
  });
  it.each([
    { ...state, currency: 'USD' },
    { ...state, beforeTax: false },
    { ...state, summary: { ...state.summary, balanceMxnCents: -1 } },
    { ...state, obligations: [{ ...state.obligations[0], status: 'WRITTEN_OFF' }] },
    { ...state, history: [{ kind: 'PAYMENT', amountMxnCents: 1 }] }
  ])('rejects malformed financial responses', async (response) => {
    const api = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(response))
    });
    await expect(api.adminManagedPlans.getCollections('client', 'contract')).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });
});
