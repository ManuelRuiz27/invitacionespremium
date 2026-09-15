import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

describe('EventsClient close', () => {
  it('closes through the authenticated lifecycle route with one idempotency key', async () => {
    const closedEvent = {
      id: 'event/with space',
      assignedPlannerUserId: '11111111-1111-4111-8111-111111111111',
      status: 'CLOSED',
      serviceCode: 'FLYER',
      name: 'Boda de Elena & Mateo',
      timeZone: 'America/Mexico_City',
      updatedAt: '2026-09-15T00:00:00.000Z'
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(closedEvent), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const signal = new AbortController().signal;
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(client.events.close('event/with space', 'close-attempt-1', signal)).resolves.toEqual(closedEvent);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/events/event%2Fwith%20space/close',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Idempotency-Key': 'close-attempt-1' }),
        signal
      })
    );
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });
});
