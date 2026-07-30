import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, normalizeApiBaseUrl } from './index';

const validUser = {
  id: '66a0bb4d-e408-4928-a955-08c258064928',
  email: 'planner@example.com',
  role: 'INDEPENDENT_PLANNER',
  clientId: '2dfe5831-c6d6-4f3b-8b09-a6cecc86b55b',
  clientType: 'PLANNER',
  clientStatus: 'ACTIVE'
} as const;

afterEach(() => vi.restoreAllMocks());

describe('generated API client runtime', () => {
  it('normalizes base URLs and rejects unsafe URL parts', () => {
    expect(normalizeApiBaseUrl(' https://api.example.com/api/v1/// ')).toBe('https://api.example.com/api/v1');
    expect(() => normalizeApiBaseUrl('https://user@example.com/api')).toThrow(TypeError);
  });

  it('logs in with cookies, JSON and without touching browser storage', async () => {
    const fetchImpl = mockJson({ user: validUser, expiresAt: '2026-07-30T18:00:00.000Z' });
    const storageSpy = vi.fn(() => {
      throw new Error('storage must not be used');
    });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: storageSpy });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: storageSpy });

    const result = await createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).auth.login({
      email: validUser.email,
      password: 'secret'
    });

    expect(result.user).toEqual(validUser);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(storageSpy).not.toHaveBeenCalled();
  });

  it('logs out with credentials included and accepts the empty response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).auth.logout();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('restores /auth/me and propagates AbortSignal', async () => {
    const fetchImpl = mockJson(validUser);
    const signal = new AbortController().signal;
    await createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).auth.me(signal);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/auth/me',
      expect.objectContaining({ signal, credentials: 'include' })
    );
  });

  it('gets events and financial endpoints with the expected limit', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({ clientId: 'c', purchasedCredits: 0, debtCredits: 0, debtMxnCents: 0, creditLine: {} })
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

    await client.events.list();
    await client.finance.balance();
    await client.finance.movements({ limit: 20 });
    await client.finance.receipts({ limit: 20 });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/events',
      'https://api.example.com/api/v1/finance/balance',
      'https://api.example.com/api/v1/finance/movements?limit=20',
      'https://api.example.com/api/v1/finance/receipts?limit=20'
    ]);
  });

  it('gets a single Event using an encoded path segment', async () => {
    const event = {
      id: 'event/id',
      status: 'DRAFT',
      name: null,
      timeZone: null,
      updatedAt: '2026-07-30T18:00:00.000Z'
    };
    const fetchImpl = mockJson(event);
    await createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).events.get('event/id');
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.com/api/v1/events/event%2Fid');
  });

  it('parses the uniform backend error without exposing the full payload', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          statusCode: 401,
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
          operationId: 'operation-1',
          details: { secret: 'hidden' }
        },
        401
      )
    );

    const promise = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).auth.me();
    await expect(promise).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
      operationId: 'operation-1'
    });
    await expect(promise).rejects.not.toHaveProperty('details');
  });

  it('rejects unexpected payloads and successful non-JSON responses', async () => {
    const badPayload = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: mockJson({ wrong: true })
    }).auth.me();
    await expect(badPayload).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });

    const noJson = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('not-json', { status: 200 }))
    }).events.list();
    await expect(noJson).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it('uses a stable fallback for non-JSON errors and propagates network errors', async () => {
    const noJson = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }))
    }).events.list();
    await expect(noJson).rejects.toEqual(expect.objectContaining({ status: 503, code: 'HTTP_503' }));

    const networkError = new TypeError('network unavailable');
    const network = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(networkError)
    }).events.list();
    await expect(network).rejects.toBe(networkError);
  });
});

function mockJson(payload: unknown): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(payload));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
