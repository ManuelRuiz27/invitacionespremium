import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';

const id = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const cursor = btoa(JSON.stringify({ version: 1, occurredAt: '2026-08-04T18:00:00.000Z', id }))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const item = {
  id,
  createdAt: '2026-08-04T18:00:00.000Z',
  actorType: 'USER',
  actorId,
  actorFingerprint: null,
  resourceType: 'Client',
  resourceId: id,
  clientId: id,
  eventId: null,
  action: 'CLIENT_UPDATED',
  operationId: actorId,
  beforeData: { status: 'ACTIVE', nested: [null, true, 10] },
  afterData: null,
  metadata: { source: 'admin' }
};

describe('AdminAuditClient', () => {
  it('encodes every supported filter, includes credentials and forwards AbortSignal', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ items: [item], nextCursor: cursor }));
    const signal = new AbortController().signal;
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

    await api.adminAudit.listAuditLogs(
      {
        clientId: id,
        eventId: actorId,
        actorType: 'USER',
        actorId,
        resourceType: 'Client & User',
        resourceId: id,
        action: 'CLIENT/UPDATED',
        operationId: actorId,
        createdFrom: '2026-08-04T00:00:00-06:00',
        createdTo: '2026-08-04T23:59:59-06:00',
        cursor,
        limit: 25
      },
      signal
    );

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/api/v1/admin/audit-logs');
    const parameters: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      parameters[key] = value;
    });
    expect(parameters).toEqual({
      clientId: id,
      eventId: actorId,
      actorType: 'USER',
      actorId,
      resourceType: 'Client & User',
      resourceId: id,
      action: 'CLIENT/UPDATED',
      operationId: actorId,
      createdFrom: '2026-08-04T00:00:00-06:00',
      createdTo: '2026-08-04T23:59:59-06:00',
      cursor,
      limit: '25'
    });
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('include');
    expect(init?.signal).toBe(signal);
    expect(new Headers(init?.headers).has('Idempotency-Key')).toBe(false);
  });

  it.each([
    { items: [item], nextCursor: 'not a cursor!' },
    { items: [{ ...item, createdAt: 'not-an-instant' }], nextCursor: null },
    { items: [{ ...item, actorId: null }], nextCursor: null },
    { items: [{ ...item, actorType: 'PUBLIC_TOKEN', actorId: null, actorFingerprint: 'short' }], nextCursor: null },
    { items: [{ ...item, unexpected: true }], nextCursor: null },
    { items: [{ id }], nextCursor: null },
    { items: [item], nextCursor: null, extra: true }
  ])('rejects a malformed successful response', async (payload) => {
    const api = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(payload))
    });

    await expect(api.adminAudit.listAuditLogs()).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it('rejects non-finite JSON numbers', async () => {
    const body = JSON.stringify({ items: [item], nextCursor: null }).replace(
      '"metadata":{"source":"admin"}',
      '"metadata":{"invalid":1e309}'
    );
    const api = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }))
    });

    await expect(api.adminAudit.listAuditLogs()).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it.each([
    { actorType: 'STAFF_TOKEN', actorId, actorFingerprint: null },
    { actorType: 'PUBLIC_TOKEN', actorId: null, actorFingerprint: 'a'.repeat(64) },
    { actorType: 'SYSTEM', actorId: null, actorFingerprint: null }
  ])('accepts a valid $actorType actor representation', async (actor) => {
    const api = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json({ items: [{ ...item, ...actor }], nextCursor: null }))
    });

    await expect(api.adminAudit.listAuditLogs()).resolves.toMatchObject({ items: [{ actorType: actor.actorType }] });
  });

  it.each([401, 403, 429, 500])('propagates HTTP %s without retrying', async (status) => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ code: `HTTP_${status}`, message: 'safe' }, status));
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl, onUnauthorized });

    await expect(api.adminAudit.listAuditLogs()).rejects.toMatchObject({ status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it.each([new TypeError('network unavailable'), new DOMException('cancelled', 'AbortError')])(
    'propagates transport failures without retrying',
    async (error) => {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
      const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

      await expect(api.adminAudit.listAuditLogs()).rejects.toBe(error);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}
