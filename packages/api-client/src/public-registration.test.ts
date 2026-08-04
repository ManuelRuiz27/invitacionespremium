import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicRegistrationClient } from './index';

const input = {
  name: 'Sofía Planners',
  email: 'sofia@example.com',
  password: 'password-1234'
};

afterEach(() => vi.restoreAllMocks());

describe('public Planner registration client', () => {
  it('uses the generated route, POST body, omitted credentials and AbortSignal', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(validResult()));
    const signal = new AbortController().signal;
    await createPublicRegistrationClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).registerPlanner(
      input,
      signal
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/clients/register-planner',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
        credentials: 'omit',
        signal
      })
    );
  });

  it('returns a complete valid response', async () => {
    const expected = validResult();
    const result = await clientWith(jsonResponse(expected)).registerPlanner(input);
    expect(result).toEqual(expected);
  });

  it.each([
    {},
    { client: {}, user: {} },
    { ...validResult(), client: { ...validResult().client, type: 'UNKNOWN' } },
    { ...validResult(), user: { ...validResult().user, role: 'UNKNOWN' } }
  ])('rejects malformed successful payload %#', async (payload) => {
    await expect(clientWith(jsonResponse(payload)).registerPlanner(input)).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });

  it('rejects a successful non-JSON response as unexpected', async () => {
    await expect(clientWith(new Response('not-json', { status: 201 })).registerPlanner(input)).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });

  it('preserves the stable code from a JSON error without exposing its payload', async () => {
    const error = await clientWith(
      jsonResponse({ code: 'CLIENT_EMAIL_ALREADY_EXISTS', message: 'technical', details: { sql: 'hidden' } }, 409)
    )
      .registerPlanner(input)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ status: 409, code: 'CLIENT_EMAIL_ALREADY_EXISTS', message: 'technical' });
    expect(error).not.toHaveProperty('details');
  });

  it('uses a stable fallback for a non-JSON error', async () => {
    await expect(clientWith(new Response('gateway', { status: 502 })).registerPlanner(input)).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_502'
    });
  });

  it.each([400, 409, 429, 500])('propagates HTTP %i as ApiError', async (status) => {
    await expect(clientWith(jsonResponse({}, status)).registerPlanner(input)).rejects.toMatchObject({
      status
    });
  });

  it('propagates network failures without retrying', async () => {
    const failure = new TypeError('network');
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(failure);
    const promise = createPublicRegistrationClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl
    }).registerPlanner(input);
    await expect(promise).rejects.toBe(failure);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not call the authenticated-session callback on public 401', async () => {
    const onUnauthorized = vi.fn();
    const client = createPublicRegistrationClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 401)),
      onUnauthorized
    });
    await expect(client.registerPlanner(input)).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('does not read or write Web Storage', async () => {
    const storageSpy = vi.fn(() => {
      throw new Error('storage must not be used');
    });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: storageSpy });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: storageSpy });
    await clientWith(jsonResponse(validResult())).registerPlanner(input);
    expect(storageSpy).not.toHaveBeenCalled();
    delete (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  it('does not add fields or cookies to the generated DTO request', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(validResult()));
    await createPublicRegistrationClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).registerPlanner(
      input
    );
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual(input);
    expect(request?.credentials).toBe('omit');
    expect(new Headers(request?.headers).has('Cookie')).toBe(false);
  });

  it('does not retry a 500 response automatically', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 500));
    await expect(
      createPublicRegistrationClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).registerPlanner(input)
    ).rejects.toMatchObject({ status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function clientWith(response: Response) {
  return createPublicRegistrationClient({
    baseUrl: 'https://api.example.com/api/v1',
    fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response)
  });
}

function validResult() {
  return {
    client: {
      id: '2dfe5831-c6d6-4f3b-8b09-a6cecc86b55b',
      name: input.name,
      status: 'ACTIVE',
      type: 'PLANNER',
      suspendedAt: null,
      suspensionReason: null,
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z'
    },
    user: {
      id: '66a0bb4d-e408-4928-a955-08c258064928',
      clientId: '2dfe5831-c6d6-4f3b-8b09-a6cecc86b55b',
      email: input.email,
      role: 'INDEPENDENT_PLANNER',
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z'
    }
  } as const;
}

function jsonResponse(payload: unknown, status = 201): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
