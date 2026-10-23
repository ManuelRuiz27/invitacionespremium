import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

const summary = {
  eventId: 'event',
  accessMode: 'NOMINAL',
  eventStatus: 'ACTIVE',
  capacity: 3,
  issuedHistorical: 3,
  revokedHistorical: 1,
  activeRights: 2,
  entered: 1,
  pending: 1,
  availableCapacity: 1,
  asOf: '2026-10-23T12:00:00.000Z',
  tables: []
};
const nominal = {
  ...summary,
  detailPage: 1,
  detailPageSize: 150,
  detailTotal: 2,
  details: [
    {
      assistantId: 'a',
      name: 'Duplicado',
      group: null,
      table: null,
      seat: null,
      status: 'ENTERED',
      enteredAt: summary.asOf
    },
    { assistantId: 'b', name: 'Duplicado', group: null, table: null, seat: null, status: 'PENDING', enteredAt: null }
  ]
};
const anonymous = {
  ...summary,
  accessMode: 'ANONYMOUS',
  detailPage: 1,
  detailPageSize: 150,
  detailTotal: 3,
  details: [
    { passNumber: 1, table: null, status: 'UNUSED', usedAt: null },
    { passNumber: 2, table: null, status: 'REVOKED', usedAt: null },
    { passNumber: 3, table: null, status: 'USED', usedAt: summary.asOf }
  ]
};
function api(body: unknown) {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
  return { client: createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl }), fetchImpl };
}
describe('access operations transport and strict response validation', () => {
  it.each([nominal, anonymous])(
    'accepts discriminated detail with duplicate names and revoked folios',
    async (body) => {
      const { client, fetchImpl } = api(body),
        signal = new AbortController().signal;
      expect(await client.events.getAccessOperations('event/id', signal)).toEqual(body);
      expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.test/api/v1/events/event%2Fid/access-operations');
      expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', signal });
      expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Idempotency-Key');
    }
  );
  it('uses the exact Provider tenant route and exposes no detail', async () => {
    const { client, fetchImpl } = api(summary),
      signal = new AbortController().signal;
    expect(await client.adminEventPreparation.getAccessOperations('client/id', 'event/id', signal)).toEqual(summary);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/admin/clients/client%2Fid/events/event%2Fid/access-operations'
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', signal });
  });
  it('supports bounded history pages without changing global totals', async () => {
    const body = {
      ...anonymous,
      issuedHistorical: 151,
      revokedHistorical: 149,
      detailPage: 2,
      detailTotal: 151,
      details: [{ passNumber: 151, table: null, status: 'UNUSED', usedAt: null }]
    };
    const { client, fetchImpl } = api(body);
    expect(await client.events.getAccessOperations('event', undefined, 2)).toEqual(body);
    expect(fetchImpl.mock.calls[0]?.[0]).toMatch(/access-operations\?page=2$/u);
  });
  it('keeps missing draft capacity nullable instead of inventing zero', async () => {
    const body = {
      ...nominal,
      eventStatus: 'DRAFT',
      capacity: null,
      availableCapacity: null,
      issuedHistorical: 0,
      revokedHistorical: 0,
      activeRights: 0,
      entered: 0,
      pending: 0,
      detailTotal: 0,
      details: []
    };
    expect(await api(body).client.events.getAccessOperations('event')).toEqual(body);
  });
  it.each([
    { ...nominal, pending: 2 },
    { ...nominal, availableCapacity: 0 },
    { ...nominal, activeRights: 151 },
    { ...nominal, revokedHistorical: 4 },
    { ...nominal, asOf: 'not-date' },
    { ...nominal, eventStatus: 'INVALID' },
    { ...nominal, details: [nominal.details[0], nominal.details[0]] },
    { ...nominal, detailTotal: 1 },
    { ...nominal, details: [{ ...nominal.details[0], phone: '+525500000000' }, nominal.details[1]] },
    { ...anonymous, details: [...anonymous.details].reverse() },
    {
      ...anonymous,
      details: [anonymous.details[0], anonymous.details[1], { ...anonymous.details[2], name: 'Inventado' }]
    },
    {
      ...anonymous,
      details: [{ ...anonymous.details[0], status: 'USED' }, anonymous.details[1], anonymous.details[2]]
    },
    {
      ...nominal,
      tables: [
        { tableId: 't', tableName: 'Mesa', capacity: 2, activeRights: 1, entered: 1, pending: 0, availableCapacity: 1 }
      ]
    },
    { ...nominal, nonce: 'secret' }
  ])('rejects malformed, inconsistent or overexposed client payload %#', async (body) => {
    await expect(api(body).client.events.getAccessOperations('event')).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });
  it('rejects nominal detail added to a Provider response', async () => {
    await expect(
      api(nominal).client.adminEventPreparation.getAccessOperations('client', 'event')
    ).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });
  it('accepts authoritative table reconciliation', async () => {
    const body = {
      ...summary,
      tables: [
        { tableId: 't', tableName: 'Mesa', capacity: 3, activeRights: 2, entered: 1, pending: 1, availableCapacity: 1 }
      ]
    };
    expect(await api(body).client.adminEventPreparation.getAccessOperations('client', 'event')).toEqual(body);
  });
});
