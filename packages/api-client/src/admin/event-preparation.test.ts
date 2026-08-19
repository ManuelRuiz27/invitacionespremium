import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../index';

describe('administrative Event preparation API client', () => {
  it('uses only client-scoped Admin routes and the authoritative multipart fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'DELETE' && !path.includes('/design/flipbook/pages/'))
        return new Response(null, { status: 204 });
      if (path.endsWith('/content')) return new Response(new Blob(['image']), { status: 200 });
      if (path.endsWith('/hotspots') && (!init?.method || init.method === 'GET')) return json([]);
      if (path.endsWith('/invitation-file-assets') && (!init?.method || init.method === 'GET')) return json([]);
      return json({}, init?.method === 'POST' ? 201 : 200);
    });
    const api = createApiClient({ baseUrl: 'https://api.example.com/api/v1', fetchImpl });
    const clientId = 'client/value';
    const eventId = 'event/value';
    const signal = new AbortController().signal;

    await api.adminEventPreparation.updateEvent(
      clientId,
      eventId,
      { confirmationEnabled: false, floorplanEnabled: false },
      signal
    );
    await api.adminEventPreparation.getDesign(clientId, eventId, signal);
    await api.adminEventPreparation.getReadiness(clientId, eventId, signal);
    await api.adminEventPreparation.createFlyer(
      clientId,
      eventId,
      { initialAssetId: 'initial', qrAssetId: 'qr' },
      signal
    );
    await api.adminEventPreparation.replaceFlyerInitial(clientId, eventId, { assetId: 'initial-2' }, signal);
    await api.adminEventPreparation.replaceFlyerQr(clientId, eventId, { assetId: 'qr-2' }, signal);
    await api.adminEventPreparation.createFlipbook(clientId, eventId, signal);
    await api.adminEventPreparation.addPage(clientId, eventId, { fileAssetId: 'page-asset' }, signal);
    await api.adminEventPreparation.reorderPages(clientId, eventId, { pageIds: ['page-2', 'page-1'] }, signal);
    await api.adminEventPreparation.replacePage(clientId, eventId, 'page/value', { assetId: 'replacement' }, signal);
    await api.adminEventPreparation.removePage(clientId, eventId, 'page/value', signal);
    await api.adminEventPreparation.listHotspots(clientId, eventId, signal);
    await api.adminEventPreparation.createHotspot(
      clientId,
      eventId,
      { action: 'RSVP', visualOwnerType: 'FLYER', x: 0, y: 0, width: 1, height: 1, priority: 0 },
      signal
    );
    await api.adminEventPreparation.updateHotspot(clientId, eventId, 'hotspot/value', { priority: 1 }, signal);
    await api.adminEventPreparation.removeHotspot(clientId, eventId, 'hotspot/value', signal);
    await api.adminEventPreparation.listInvitationAssets(clientId, eventId, signal);
    await api.adminEventPreparation.uploadInvitationAsset(
      clientId,
      eventId,
      new Blob(['image']),
      'FLYER_INITIAL_IMAGE',
      signal
    );
    await api.adminEventPreparation.invitationAssetContent(clientId, eventId, 'asset/value', signal);
    await api.adminEventPreparation.removeInvitationAsset(clientId, eventId, 'asset/value', signal);
    await api.adminEventPreparation.getFloorplan(clientId, eventId, signal);

    const calls = fetchImpl.mock.calls;
    const base = 'https://api.example.com/api/v1/admin/clients/client%2Fvalue/events/event%2Fvalue';
    expect(calls.map(([url]) => String(url))).toEqual([
      base,
      `${base}/design`,
      `${base}/design/readiness`,
      `${base}/design/flyer`,
      `${base}/design/flyer/initial-image`,
      `${base}/design/flyer/qr-image`,
      `${base}/design/flipbook`,
      `${base}/design/flipbook/pages`,
      `${base}/design/flipbook/pages/reorder`,
      `${base}/design/flipbook/pages/page%2Fvalue/asset`,
      `${base}/design/flipbook/pages/page%2Fvalue`,
      `${base}/hotspots`,
      `${base}/hotspots`,
      `${base}/hotspots/hotspot%2Fvalue`,
      `${base}/hotspots/hotspot%2Fvalue`,
      `${base}/invitation-file-assets`,
      `${base}/invitation-file-assets`,
      `${base}/invitation-file-assets/asset%2Fvalue/content`,
      `${base}/invitation-file-assets/asset%2Fvalue`,
      `${base}/floorplan`
    ]);
    expect(calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'PATCH',
      'GET',
      'GET',
      'POST',
      'PATCH',
      'PATCH',
      'POST',
      'POST',
      'PATCH',
      'PATCH',
      'DELETE',
      'GET',
      'POST',
      'PATCH',
      'DELETE',
      'GET',
      'POST',
      'GET',
      'DELETE',
      'GET'
    ]);
    expect(calls.every(([url]) => !new URL(String(url)).pathname.startsWith('/api/v1/events/'))).toBe(true);
    expect(calls.every(([, init]) => init?.signal === signal && init.credentials === 'include')).toBe(true);
    const upload = calls.find(
      ([url, init]) => String(url).endsWith('/invitation-file-assets') && init?.method === 'POST'
    );
    expect(upload?.[1]?.body).toBeInstanceOf(FormData);
    const form = upload?.[1]?.body as FormData;
    expect(form.has('file')).toBe(true);
    expect(form.has('fileType')).toBe(true);
    expect(form.has('ownerType')).toBe(false);
    expect(form.get('fileType')).toBe('FLYER_INITIAL_IMAGE');
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}
