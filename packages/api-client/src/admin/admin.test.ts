import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';

const client = {
  id: 'client-1',
  name: 'Casa Norte',
  type: 'ORGANIZATION',
  commercialChannel: null,
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
  assignedPlannerUserId: null,
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
  it('covers catalog routes without invented idempotency headers', async () => {
    const service = {
      id: 'service-1',
      code: 'FLYER',
      isActive: true,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt
    };
    const price = {
      id: 'price-1',
      serviceId: service.id,
      serviceCode: service.code,
      pricingVersion: 2,
      clientType: null,
      commercialChannel: 'STANDARD',
      capacityMin: 1,
      capacityMax: 50,
      venueTier: null,
      credits: 20,
      validFrom: client.createdAt,
      validUntil: null,
      createdAt: client.createdAt
    };
    const promotion = {
      id: 'promo-1',
      name: 'Elegible',
      scope: 'EVENT_ACTIVATION',
      clientId: null,
      clientType: null,
      serviceId: service.id,
      validFrom: client.createdAt,
      validUntil: null,
      isActive: true,
      allowsStacking: false,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt
    };
    const fetchImpl = sequence([
      service,
      service,
      [price],
      price,
      price,
      [promotion],
      promotion,
      promotion,
      promotion,
      promotion
    ]);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    const signal = new AbortController().signal;
    await api.adminCatalog.createService({ code: 'FLYER', isActive: true }, signal);
    await api.adminCatalog.updateService('service/value', { isActive: false }, signal);
    await api.adminCatalog.listPrices(signal);
    await api.adminCatalog.createPrice(
      {
        serviceId: service.id,
        commercialChannel: 'STANDARD',
        capacityMin: 1,
        capacityMax: 50,
        credits: 20,
        validFrom: client.createdAt
      },
      signal
    );
    await api.adminCatalog.closePrice('price/value', { validUntil: client.updatedAt }, signal);
    await api.adminCatalog.listPromotions(signal);
    await api.adminCatalog.createPromotion(
      { name: 'Elegible', scope: 'EVENT_ACTIVATION', validFrom: client.createdAt, allowsStacking: false },
      signal
    );
    await api.adminCatalog.updatePromotion('promo/value', { name: 'Vigente' }, signal);
    await api.adminCatalog.activatePromotion('promo/value', signal);
    await api.adminCatalog.deactivatePromotion('promo/value', signal);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.com/api/v1/admin/services',
      'https://api.example.com/api/v1/admin/services/service%2Fvalue',
      'https://api.example.com/api/v1/admin/prices',
      'https://api.example.com/api/v1/admin/prices',
      'https://api.example.com/api/v1/admin/prices/price%2Fvalue',
      'https://api.example.com/api/v1/admin/promotions',
      'https://api.example.com/api/v1/admin/promotions',
      'https://api.example.com/api/v1/admin/promotions/promo%2Fvalue',
      'https://api.example.com/api/v1/admin/promotions/promo%2Fvalue/activate',
      'https://api.example.com/api/v1/admin/promotions/promo%2Fvalue/deactivate'
    ]);
    expect(fetchImpl.mock.calls.every(([, init]) => !new Headers(init?.headers).has('Idempotency-Key'))).toBe(true);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.signal === signal)).toBe(true);
  });

  it('lists report metadata and finance cuts without query parameters', async () => {
    const report = {
      id: 'report-1',
      clientId: client.id,
      eventId: event.id,
      requestedByUserId: user.id,
      type: 'ATTENDANCE',
      status: 'READY',
      privacyMode: 'AGGREGATE',
      templateVersion: 1,
      generatedAtSnapshot: client.createdAt,
      detailedUntil: client.updatedAt,
      retentionUntil: client.updatedAt
    };
    const cut = {
      from: client.createdAt,
      until: client.updatedAt,
      incomeMxnCents: 1000,
      creditsSold: 1,
      creditsGranted: 0,
      creditsConsumed: 0,
      creditsLent: 0,
      debtGeneratedCredits: 0,
      debtGeneratedMxnCents: 0,
      debtPaidCredits: 0,
      debtPaidMxnCents: 0,
      pendingDebtCredits: 0,
      pendingDebtMxnCents: 0,
      pendingPurchasedCredits: 1,
      internalRefundCredits: 0,
      reversalCount: 0
    };
    const fetchImpl = sequence([[report], [report], cut, cut]);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await api.adminReports.list();
    await api.adminReports.listEvent('event/value');
    await api.adminFinance.dailyCut();
    await api.adminFinance.monthlyCut();
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.com/api/v1/admin/reports',
      'https://api.example.com/api/v1/admin/reports/events/event%2Fvalue',
      'https://api.example.com/api/v1/admin/finance/cuts/daily',
      'https://api.example.com/api/v1/admin/finance/cuts/monthly'
    ]);
  });

  it('rejects malformed Service, Price, Promotion, cut and report successes', async () => {
    const fetchImpl = sequence([
      { id: 'service-1', code: 'FLYER', isActive: true, createdAt: client.createdAt },
      {
        id: 'price-1',
        serviceId: 'service-1',
        serviceCode: 'FLYER',
        commercialChannel: 'STANDARD',
        capacityMin: 1,
        capacityMax: 50,
        credits: 1.5,
        validFrom: client.createdAt,
        validUntil: null,
        createdAt: client.createdAt
      },
      {
        id: 'promo-1',
        name: 'Elegible',
        scope: 'EVENT_ACTIVATION',
        clientId: null,
        clientType: null,
        serviceId: null,
        validFrom: client.createdAt,
        validUntil: null,
        isActive: true,
        allowsStacking: false,
        createdAt: client.createdAt
      },
      { from: client.createdAt, until: client.updatedAt, incomeMxnCents: Number.POSITIVE_INFINITY },
      [
        {
          id: 'report-1',
          clientId: client.id,
          eventId: event.id,
          requestedByUserId: user.id,
          type: 'ATTENDANCE',
          status: 'READY',
          privacyMode: 'AGGREGATE',
          templateVersion: 1.5,
          generatedAtSnapshot: client.createdAt,
          detailedUntil: client.updatedAt,
          retentionUntil: client.updatedAt
        }
      ]
    ]);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await expect(api.adminCatalog.createService({ code: 'FLYER', isActive: true })).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
    await expect(
      api.adminCatalog.createPrice({
        serviceId: 'service-1',
        commercialChannel: 'STANDARD',
        capacityMin: 1,
        capacityMax: 50,
        credits: 1,
        validFrom: client.createdAt
      })
    ).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
    await expect(
      api.adminCatalog.createPromotion({
        name: 'Elegible',
        scope: 'EVENT_ACTIVATION',
        validFrom: client.createdAt,
        allowsStacking: false
      })
    ).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
    await expect(api.adminFinance.dailyCut()).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
    await expect(api.adminReports.list()).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it('applies the central 401 callback to new wrappers and preserves it on 403', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ code: 'UNAUTHORIZED', message: 'Expirada' }, 401))
      .mockResolvedValueOnce(json({ code: 'FORBIDDEN', message: 'Sin permiso' }, 403));
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl, onUnauthorized });
    await expect(api.adminCatalog.listPrices()).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(api.adminReports.list()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

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

  it('quotes intake, creates for an encoded Client, and updates assignment through Admin routes', async () => {
    const quote = {
      clientId: client.id,
      clientName: client.name,
      commercialChannel: 'STANDARD',
      serviceId: 'service-1',
      serviceCode: 'FLYER',
      capacity: 100,
      servicePriceId: 'price-1',
      capacityMin: 51,
      capacityMax: 100,
      venueTier: null,
      baseCostCredits: 300,
      promotionDiscountCredits: 0,
      finalCostCredits: 300,
      amountMxnCents: 600000,
      coverage: { purchasedCredits: 300, creditLineAvailableCredits: 0, totalAvailableCredits: 300, sufficient: true }
    } as const;
    const fetchImpl = sequence([quote, event, { ...event, assignedPlannerUserId: 'planner-1' }]);
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await api.adminEvents.quoteIntake('client/value', { serviceCode: 'FLYER', capacity: 100 });
    await api.adminEvents.createForClient('client/value', {
      name: 'Evento',
      serviceCode: 'FLYER',
      capacity: 100,
      acceptedServicePriceId: 'price-1',
      assignedPlannerUserId: null,
      acceptanceConfirmed: true
    });
    await api.adminEvents.updateAssignment('client/value', 'event/value', {
      assignedPlannerUserId: 'planner-1'
    });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.com/api/v1/admin/clients/client%2Fvalue/events/intake-quote?serviceCode=FLYER&capacity=100',
      'https://api.example.com/api/v1/admin/clients/client%2Fvalue/events',
      'https://api.example.com/api/v1/admin/clients/client%2Fvalue/events/event%2Fvalue/assignment'
    ]);
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'POST', 'PATCH']);
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
