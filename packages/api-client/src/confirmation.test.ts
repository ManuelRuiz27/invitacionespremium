import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const eventId = 'event/with space';
const invitationId = 'invitation/with space';
const openState = { enabled: true, open: true, closedAt: null, closedByUserId: null };
const closedState = {
  enabled: true,
  open: false,
  closedAt: '2026-09-14T18:00:00.000Z',
  closedByUserId: '11111111-1111-4111-8111-111111111111'
};
const mutation = {
  invitationId,
  responseStatus: 'CONFIRMED',
  assistants: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Ana García',
      isPrimary: true,
      responseStatus: 'CONFIRMED'
    }
  ]
};

describe('EventConfirmationClient', () => {
  it('gets the authenticated confirmation state', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(openState));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.eventConfirmation.get(eventId)).resolves.toEqual(openState);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/events/event%2Fwith%20space/confirmation',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('closes confirmation with an authenticated POST', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(closedState));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.eventConfirmation.close(eventId)).resolves.toEqual(closedState);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/events/event%2Fwith%20space/confirmation/close',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('reopens confirmation with an authenticated POST', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(openState));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.eventConfirmation.reopen(eventId)).resolves.toEqual(openState);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/events/event%2Fwith%20space/confirmation/reopen',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('sends the complete nominal override through authenticated PUT', async () => {
    const input = {
      responseStatus: 'CONFIRMED' as const,
      additionalAssistants: [{ id: '33333333-3333-4333-8333-333333333333', name: 'Luis García' }]
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(mutation));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.eventConfirmation.override(eventId, invitationId, input)).resolves.toEqual(mutation);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/events/event%2Fwith%20space/invitations/invitation%2Fwith%20space/confirmation',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        body: JSON.stringify(input)
      })
    );
  });
});
