import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const active = {
  id: '11111111-1111-4111-8111-111111111111',
  eventId: '22222222-2222-4222-8222-222222222222',
  alias: 'Acceso principal',
  state: 'ACTIVE' as const,
  createdAt: '2026-08-24T18:00:00.000Z',
  expiredAt: null
};

const token = `st1.${'A'.repeat(43)}`;

describe('StaffTokensClient', () => {
  it('lista accesos sin reconstruir secretos', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json([active]));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.staffTokens.list('event/with slash')).resolves.toEqual([active]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/events/event%2Fwith%20slash/staff-tokens',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('crea un acceso y conserva el secreto sólo en la respuesta de creación', async () => {
    const created = { ...active, token, sessionPath: `/api/v1/scanner/${token}/session` };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(created, 201));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.staffTokens.create(active.eventId, { alias: 'Acceso principal' })).resolves.toEqual(created);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example.test/api/v1/events/${active.eventId}/staff-tokens`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ alias: 'Acceso principal' })
      })
    );
  });

  it('rechaza una respuesta de creación que no contenga un StaffToken válido', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ ...active, token: 'invalid', sessionPath: '/api/v1/scanner/invalid/session' }, 201));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.staffTokens.create(active.eventId, { alias: 'Puerta' })).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });

  it('rechaza estados incoherentes entre state y expiredAt', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json([{ ...active, state: 'EXPIRED', expiredAt: null }]));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.staffTokens.list(active.eventId)).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it('rechaza secretos, digest y creador en el listado', async () => {
    const leaked = {
      ...active,
      token,
      sessionPath: `/api/v1/scanner/${token}/session`,
      tokenDigestSha256: 'a'.repeat(64),
      createdByUserId: '33333333-3333-4333-8333-333333333333'
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json([leaked]));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.staffTokens.list(active.eventId)).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it('rechaza campos internos en la respuesta de creación', async () => {
    const created = {
      ...active,
      token,
      sessionPath: `/api/v1/scanner/${token}/session`,
      tokenDigestSha256: 'a'.repeat(64)
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(created, 201));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.staffTokens.create(active.eventId, { alias: 'Puerta' })).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });
});
