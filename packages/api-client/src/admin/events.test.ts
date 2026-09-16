import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';

describe('AdminEventsClient managed intake', () => {
  it('creates through the dedicated authenticated route with the exact body', async () => {
    const event = {
      id: 'event-1',
      clientId: 'client/with space',
      assignedPlannerUserId: '11111111-1111-4111-8111-111111111111',
      status: 'DRAFT',
      name: 'Boda de Elena & Mateo',
      createdAt: '2026-09-15T00:00:00.000Z'
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(event), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const signal = new AbortController().signal;
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
    const input = {
      name: 'Boda de Elena & Mateo',
      serviceCode: 'FLYER' as const,
      capacity: 120,
      assignedPlannerUserId: '11111111-1111-4111-8111-111111111111'
    };

    await expect(client.adminEvents.createManagedForClient('client/with space', input, signal)).resolves.toEqual(event);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/admin/clients/client%2Fwith%20space/events/managed',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(input),
        signal
      })
    );
  });

  it('activates Managed Events with the exact scoped route and idempotency header', async () => {
    const event = {
      id: 'event/with space',
      clientId: 'client/with space',
      assignedPlannerUserId: '11111111-1111-4111-8111-111111111111',
      status: 'ACTIVE',
      name: 'Boda de Elena & Mateo',
      createdAt: '2026-09-15T00:00:00.000Z'
    };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(event), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    const signal = new AbortController().signal;
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });

    await expect(
      client.adminEvents.activateManagedForClient(
        'client/with space',
        'event/with space',
        'managed-activation-key',
        signal
      )
    ).resolves.toEqual(event);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/admin/clients/client%2Fwith%20space/events/event%2Fwith%20space/activate',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Idempotency-Key': 'managed-activation-key' }),
        signal
      })
    );
  });
});
