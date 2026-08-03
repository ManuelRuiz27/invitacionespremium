import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';

const client = {
  id: 'client-1',
  name: 'Casa Norte',
  type: 'ORGANIZATION',
  status: 'ACTIVE',
  suspendedAt: null,
  suspensionReason: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
} as const;
const user = {
  id: 'user-1',
  clientId: client.id,
  email: 'admin@casa.mx',
  role: 'ORGANIZATION_ADMIN',
  createdAt: client.createdAt,
  updatedAt: client.updatedAt
} as const;
const event = {
  id: 'event-1',
  clientId: client.id,
  status: 'DRAFT',
  name: 'Evento',
  createdAt: client.createdAt
};
const balance = {
  clientId: client.id,
  purchasedCredits: 12,
  debtCredits: 2,
  debtMxnCents: 4000,
  creditLine: {},
  reconciliation: {},
  lastLedgerSequence: '1',
  updatedAt: client.updatedAt
};
const mutation = { balance, receipt: { id: 'receipt-1' }, movement: null, payment: null };

afterEach(() => vi.restoreAllMocks());

describe('administrative API client', () => {
  it('covers every Client and Client user administrative operation', async () => {
    const fetchImpl = sequence([[client], client, { client, user }, client, client, client, [user], user, user]);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

    await api.adminClients.list();
    await api.adminClients.get('client-1');
    await api.adminClients.createOrganization({
      name: 'Casa Norte',
      adminEmail: user.email,
      adminPassword: 'secret123'
    });
    await api.adminClients.update('client-1', { name: 'Casa Norte renovada' });
    await api.adminClients.suspend('client-1', { reason: 'Revision contractual' });
    await api.adminClients.restore('client-1');
    await api.adminClients.listUsers('client-1');
    await api.adminClients.createPlanner('client-1', { email: 'planner@casa.mx', password: 'secret123' });
    await api.adminClients.updateUser('client-1', 'user-1', { email: 'nuevo@casa.mx' });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/admin/clients',
      'https://api.example.com/api/v1/admin/clients/client-1',
      'https://api.example.com/api/v1/admin/clients/organizations',
      'https://api.example.com/api/v1/admin/clients/client-1',
      'https://api.example.com/api/v1/admin/clients/client-1/suspend',
      'https://api.example.com/api/v1/admin/clients/client-1/restore',
      'https://api.example.com/api/v1/admin/clients/client-1/users',
      'https://api.example.com/api/v1/admin/clients/client-1/users/planner',
      'https://api.example.com/api/v1/admin/clients/client-1/users/user-1'
    ]);
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'GET',
      'GET',
      'POST',
      'PATCH',
      'POST',
      'POST',
      'GET',
      'POST',
      'PATCH'
    ]);
  });

  it('lists, reads and restores Events only through encoded administrative routes', async () => {
    const fetchImpl = sequence([[event], event, event]);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await api.adminEvents.list();
    await api.adminEvents.get('event/value');
    await api.adminEvents.restore('event/value');
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/admin/events',
      'https://api.example.com/api/v1/admin/events/event%2Fvalue',
      'https://api.example.com/api/v1/admin/events/event%2Fvalue/restore'
    ]);
    expect(fetchImpl.mock.calls.some(([url]) => new URL(String(url)).pathname.startsWith('/api/v1/events'))).toBe(
      false
    );
  });

  it('covers balance and all implemented financial mutations with stable idempotency headers', async () => {
    const fetchImpl = sequence([balance, mutation, mutation, mutation, mutation]);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    const signal = new AbortController().signal;
    await api.adminFinance.balance('client/value', signal);
    await api.adminFinance.assignCredits('client/value', { credits: 5, reason: 'Cortesia' }, 'grant-key', signal);
    await api.adminFinance.configureCreditLine(
      'client/value',
      { limitCredits: 20, status: 'ACTIVE' },
      'line-key',
      signal
    );
    await api.adminFinance.manualPayment(
      'client/value',
      {
        amountMxnCents: 10000,
        credits: 5,
        creditUnitValueMxnCents: 2000,
        externalReference: 'EXT-1',
        kind: 'CREDIT_PURCHASE'
      },
      'payment-key',
      signal
    );
    await api.adminFinance.rebuildBalance('client/value', 'rebuild-key', signal);

    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.com/api/v1/admin/finance/clients/client%2Fvalue/balance',
      'https://api.example.com/api/v1/admin/finance/clients/client%2Fvalue/assign-credits',
      'https://api.example.com/api/v1/admin/finance/clients/client%2Fvalue/credit-line',
      'https://api.example.com/api/v1/admin/finance/clients/client%2Fvalue/manual-payment',
      'https://api.example.com/api/v1/admin/finance/clients/client%2Fvalue/rebuild-balance'
    ]);
    expect(fetchImpl.mock.calls.slice(1).map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual([
      'grant-key',
      'line-key',
      'payment-key',
      'rebuild-key'
    ]);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.signal === signal)).toBe(true);
  });

  it('propagates AbortSignal, authenticates with cookies and does not invent unsupported list query parameters', async () => {
    const fetchImpl = sequence([[client], event]);
    const signal = new AbortController().signal;
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await api.adminClients.list(signal);
    await api.adminEvents.get('event?filter=all', signal);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.com/api/v1/admin/clients');
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://api.example.com/api/v1/admin/events/event%3Ffilter%3Dall');
    expect(fetchImpl.mock.calls.every(([, init]) => init?.credentials === 'include' && init.signal === signal)).toBe(
      true
    );
  });

  it('rejects malformed successes and propagates JSON and non-JSON errors', async () => {
    const malformed = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json({ id: 'incomplete' }))
    }).adminClients.get('client');
    await expect(malformed).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });

    const jsonError = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ code: 'CLIENT_NOT_FOUND', message: 'No disponible' }, 404))
    }).adminClients.get('client');
    await expect(jsonError).rejects.toMatchObject({ status: 404, code: 'CLIENT_NOT_FOUND' });

    const nonJson = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('gateway', { status: 502 }))
    }).adminFinance.balance('client');
    await expect(nonJson).rejects.toMatchObject({ status: 502, code: 'HTTP_502' });
  });
});

function sequence(payloads: unknown[]) {
  const fetchImpl = vi.fn<typeof fetch>();
  for (const payload of payloads) fetchImpl.mockResolvedValueOnce(json(payload));
  return fetchImpl;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}
