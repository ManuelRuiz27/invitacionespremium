import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';
import { isCountdown, type SaveCountdownInput } from './countdown';

const input: SaveCountdownInput = {
  visualOwnerType: 'FLYER',
  flipbookPageId: null,
  x: 0.1,
  y: 0.2,
  width: 0.8,
  height: 0.2,
  numberFont: 'montserrat',
  labelFont: 'playfair',
  numberWeight: 600,
  labelWeight: 400,
  layout: 'row',
  numberColor: '#171717',
  labelColor: '#57594F',
  backgroundColor: '#FFFFFF',
  borderColor: '#B8A58A',
  shadowColor: '#171717',
  backgroundOpacity: 0.85,
  frame: 'thin',
  shadow: 'soft',
  revision: 0
};
const countdown = { ...input, id: 'countdown-id', revision: 1 };
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('Countdown SDK', () => {
  it('uses scoped routes, complete generated input and revision-aware deletion', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : json(countdown)
    );
    const client = createApiClient({ baseUrl: 'https://api.example/api/v1', fetchImpl });
    await expect(client.design.saveCountdown('event/value', input)).resolves.toEqual(countdown);
    await client.design.removeCountdown('event/value', 1);
    await expect(client.adminEventPreparation.saveCountdown('client/value', 'event/value', input)).resolves.toEqual(
      countdown
    );
    await client.adminEventPreparation.removeCountdown('client/value', 'event/value', 1);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example/api/v1/events/event%2Fvalue/design/countdown',
      'https://api.example/api/v1/events/event%2Fvalue/design/countdown?revision=1',
      'https://api.example/api/v1/admin/clients/client%2Fvalue/events/event%2Fvalue/design/countdown',
      'https://api.example/api/v1/admin/clients/client%2Fvalue/events/event%2Fvalue/design/countdown?revision=1'
    ]);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify(input) });
  });

  it.each([
    { width: 2 },
    { numberColor: 'red' },
    { backgroundOpacity: 1.1 },
    { numberWeight: '600' },
    { revision: 0 },
    { labelFont: 'custom' },
    { visualOwnerType: 'FLIPBOOK_PAGE', flipbookPageId: null }
  ])('rejects malformed success responses %j', async (patch) => {
    expect(isCountdown({ ...countdown, ...patch })).toBe(false);
    const client = createApiClient({
      baseUrl: 'https://api.example/api/v1',
      fetchImpl: async () => json({ ...countdown, ...patch })
    });
    await expect(client.design.saveCountdown('event', input)).rejects.toMatchObject({
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });

  it('validates Countdown and stable page membership in the public projection', async () => {
    const view = {
      status: 'AVAILABLE',
      serverNow: '2030-01-01T00:00:00Z',
      event: { name: 'Evento', eventDateTime: '2030-01-02T00:00:00Z', timeZone: 'America/Mexico_City' },
      invitation: {
        id: 'invitation',
        mode: 'INDIVIDUAL',
        responseStatus: 'PENDING',
        additionalAssistantLimit: 0,
        cancelled: false
      },
      confirmation: { open: true },
      assistants: [],
      designType: 'FLIPBOOK',
      qr: { available: false },
      design: {
        type: 'FLIPBOOK',
        pages: [{ id: 'page', position: 1, asset: { id: 'asset', contentPath: '/private-asset' } }],
        hotspots: [],
        countdown: { ...countdown, visualOwnerType: 'FLIPBOOK_PAGE', flipbookPageId: 'page' }
      }
    };
    const client = createApiClient({ baseUrl: 'https://api.example/api/v1', fetchImpl: async () => json(view) });
    await expect(client.publicInvitation.resolve('token')).resolves.toEqual(view);
    view.design.countdown.flipbookPageId = 'another-page';
    await expect(client.publicInvitation.resolve('token')).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });
});
