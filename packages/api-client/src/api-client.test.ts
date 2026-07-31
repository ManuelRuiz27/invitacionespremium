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
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(event));
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

  it('supports POST and PATCH JSON for Event creation and autosave', async () => {
    const event = { id: 'event-1', status: 'DRAFT', name: 'Boda', timeZone: 'UTC', updatedAt: 'now' };
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse(event));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await client.events.create({
      name: 'Boda',
      confirmationEnabled: false,
      floorplanEnabled: false
    });
    await client.events.update('event-1', {
      name: 'Boda',
      confirmationEnabled: true,
      floorplanEnabled: false
    });
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'PATCH']);
    expect(fetchImpl.mock.calls[1]?.[1]?.body).toContain('"confirmationEnabled":true');
  });

  it('supports DELETE and 204 responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).contacts.remove('event', 'contact');
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('sends multipart bodies without setting Content-Type manually', async () => {
    const asset = { id: 'asset-1' };
    const fetchImpl = mockJson(asset);
    await createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).fileAssets.upload(
      'event',
      new Blob(['image']),
      'FLYER_INITIAL_IMAGE',
      'FLYER'
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });

  it('reads Blob, text and ArrayBuffer-compatible binary responses', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('csv'))
      .mockResolvedValueOnce(new Response('<svg/>'))
      .mockResolvedValueOnce(new Response('bytes'));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    expect(await (await client.contacts.template('event')).text()).toBe('csv');
    expect(await client.physicalPasses.svg('event', 'pass')).toBe('<svg/>');
    expect(await (await client.fileAssets.content('event', 'asset')).arrayBuffer()).toBeInstanceOf(ArrayBuffer);
  });

  it('sends stable idempotency headers for activation, CSV commit and pass generation', async () => {
    const activation = { event: { id: 'event', status: 'ACTIVE', name: null, timeZone: null, updatedAt: 'now' } };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(activation))
      .mockResolvedValueOnce(jsonResponse({ contacts: [], createdContacts: 0, createdGroups: 0 }))
      .mockResolvedValueOnce(jsonResponse({ eventId: 'event', passes: [], quantity: 1 }));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    await client.events.activate('event', 'activation-key');
    await client.contacts.commit('event', 'preview', 'csv-key');
    await client.physicalPasses.generate('event', { quantity: 1 }, 'passes-key');
    expect(fetchImpl.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual([
      'activation-key',
      'csv-key',
      'passes-key'
    ]);
  });

  it('encodes resource identifiers and query values in wizard endpoints', async () => {
    const fetchImpl = mockJson([]);
    await createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl }).contacts.list(
      'event/id',
      'Ana & Luis'
    );
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.example.com/api/v1/events/event%2Fid/contacts?search=Ana%20%26%20Luis'
    );
  });
});

describe('public API client', () => {
  it('resolves invitations and sends public RSVP mutations without cookies', async () => {
    const invitation = { status: 'AVAILABLE' };
    const mutation = { invitationId: 'invitation', responseStatus: 'CONFIRMED', assistants: [] };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(invitation))
      .mockResolvedValueOnce(jsonResponse(mutation))
      .mockResolvedValueOnce(jsonResponse(mutation))
      .mockResolvedValueOnce(jsonResponse(mutation));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    const signal = new AbortController().signal;

    await client.publicInvitation.resolve('token/value', signal);
    await client.publicInvitation.confirm('token/value', [{ name: 'Ana' }]);
    await client.publicInvitation.updateAssistants('token/value', [{ id: 'assistant', name: 'Ana María' }]);
    await client.publicInvitation.reject('token/value');

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/public/invitations/token%2Fvalue',
      'https://api.example.com/api/v1/public/invitations/token%2Fvalue/confirm',
      'https://api.example.com/api/v1/public/invitations/token%2Fvalue/assistants',
      'https://api.example.com/api/v1/public/invitations/token%2Fvalue/reject'
    ]);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.credentials === 'omit')).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(signal);
    expect(fetchImpl.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ additionalAssistants: [{ name: 'Ana' }] }));
  });

  it('downloads invitation assets and QR bytes as Blob only when requested', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('image'))
      .mockResolvedValueOnce(new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

    expect(await client.publicInvitation.asset('token', 'asset/id')).toBeInstanceOf(Blob);
    expect(await client.publicInvitation.qr('token')).toBeInstanceOf(Blob);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/public/invitations/token/assets/asset%2Fid/content',
      'https://api.example.com/api/v1/public/invitations/token/qr.svg'
    ]);
  });

  it('resolves albums and downloads an encoded photo without credentials', async () => {
    const album = {
      status: 'AVAILABLE',
      event: { name: 'Evento' },
      album: { title: 'Álbum', expiresAt: 'now', publishedAt: 'now', photos: [], theme: {} }
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(album))
      .mockResolvedValueOnce(new Response('photo'));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

    await client.publicAlbum.resolve('album/token');
    expect(await client.publicAlbum.photo('album/token', 'photo/id')).toBeInstanceOf(Blob);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/public/albums/album%2Ftoken',
      'https://api.example.com/api/v1/public/albums/album%2Ftoken/photos/photo%2Fid/content'
    ]);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.credentials === 'omit')).toBe(true);
  });

  it('keeps public tokens out of storage and propagates JSON and non-JSON errors', async () => {
    const storageSpy = vi.fn(() => {
      throw new Error('storage must not be used');
    });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: storageSpy });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: storageSpy });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: 'INVITATION_NOT_FOUND', message: 'hidden token' }, 404))
      .mockResolvedValueOnce(new Response('gateway detail', { status: 502 }));
    const client = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });

    await expect(client.publicInvitation.resolve('secret-token')).rejects.toMatchObject({
      code: 'INVITATION_NOT_FOUND'
    });
    await expect(client.publicAlbum.resolve('secret-album')).rejects.toMatchObject({ code: 'HTTP_502' });
    expect(storageSpy).not.toHaveBeenCalled();
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
