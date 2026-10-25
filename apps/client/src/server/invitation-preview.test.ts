import type { PublicInvitationView } from '@invitaciones/api-client';
import { describe, expect, it, vi } from 'vitest';
import { createInvitationPreview } from './invitation-preview';

const token = 'ip1.preview-token';
const assetId = '2e07a475-7865-4782-9916-04dba57fb2ef';
const otherId = 'e380df09-b0d4-43c4-abab-9cac22e41f90';
const apiBase = 'https://api.example/api/v1';
const requestUrl = `https://app.example/invitacion/${token}`;
const imagePath = `/api/v1/public/invitations/${token}/assets/${assetId}/content`;
const originalHtml =
  '<html><head><title>InvitacionesPremium</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';

function available(): PublicInvitationView {
  return {
    status: 'AVAILABLE',
    event: { name: 'Elena & Mateo', eventDateTime: '2030-01-01T20:00:00Z', timeZone: 'America/Mexico_City' },
    invitation: {
      id: 'invitation-id',
      mode: 'INDIVIDUAL',
      responseStatus: 'PENDING',
      additionalAssistantLimit: 0,
      cancelled: false
    },
    assistants: [{ id: 'assistant-id', name: 'Nombre privado', isPrimary: true, responseStatus: 'PENDING' }],
    confirmation: { open: true },
    qr: { available: true, contentPath: '/private-qr.svg' },
    designType: 'FLYER',
    design: {
      type: 'FLYER',
      flyerInitialAsset: { id: assetId, contentPath: imagePath },
      flyerQrAsset: { id: otherId, contentPath: `/api/v1/public/invitations/${token}/assets/${otherId}/content` },
      pages: [],
      hotspots: []
    }
  };
}

async function render(view: unknown = available(), url = requestUrl) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(view));
  const next = vi.fn().mockImplementation(
    async () =>
      new Response(originalHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: 'static', 'Content-Length': '999' }
      })
  );
  const response = await createInvitationPreview(apiBase, fetchImpl)(new Request(url), { next });
  const html = await response.text();
  return { response, html, fetchImpl, next, document: new DOMParser().parseFromString(html, 'text/html') };
}

describe('invitation Open Graph HTML', () => {
  it('renders Flyer metadata without JavaScript and preserves the SPA', async () => {
    const { document, html, response, fetchImpl, next } = await render();
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      `https://api.example${imagePath}`
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Elena & Mateo');
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
    expect(document.querySelectorAll('title')).toHaveLength(1);
    expect(document.querySelector('#root')).not.toBeNull();
    expect(document.querySelector('script')?.getAttribute('src')).toBe('/assets/app.js');
    expect(html).not.toMatch(/Nombre privado|assistant-id|invitation-id|private-qr|e380df09/u);
    expect(next).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      `${apiBase}/public/invitations/${token}`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: expect.any(AbortSignal)
      })
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Netlify-CDN-Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(response.headers.has('etag')).toBe(false);
    expect(response.headers.has('content-length')).toBe(false);
  });

  it('selects the Flipbook cover by position, independently of array ordering', async () => {
    const view = available();
    view.designType = 'FLIPBOOK';
    view.design = {
      type: 'FLIPBOOK',
      hotspots: [],
      pages: [
        { id: 'second', position: 2, asset: { id: otherId, contentPath: imagePath.replace(assetId, otherId) } },
        { id: 'cover', position: 1, asset: { id: assetId, contentPath: imagePath } }
      ]
    };
    const { document } = await render(view);
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      `https://api.example${imagePath}`
    );
  });

  it('escapes event content and omits query parameters from the shared URL', async () => {
    const view = available();
    view.event!.name = '"><script>alert(1)</script> & Fiesta';
    const { document } = await render(view, `${requestUrl}?private=secret`);
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(view.event!.name);
    expect(document.querySelectorAll('script')).toHaveLength(1);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(requestUrl);
  });

  it.each([
    { status: 'CANCELLED', message: 'Invitación cancelada' },
    { status: 'CLOSED' },
    { status: 'CLOSED', album: { state: 'AVAILABLE', contentPath: '/private-album' } },
    { status: 'AVAILABLE' }
  ])('keeps a neutral page for unavailable or malformed projections: %j', async (view) => {
    const { html } = await render(view);
    expect(html).toBe(originalHtml);
  });

  it.each([
    'https://evil.example/image.png',
    imagePath.replace(token, 'other-token'),
    imagePath.replace('/content', '/qr.svg')
  ])('rejects an image outside the current invitation: %s', async (contentPath) => {
    const view = available();
    view.design!.flyerInitialAsset!.contentPath = contentPath;
    expect((await render(view)).html).toBe(originalHtml);
  });

  it.each([404, 429, 500])('preserves the application when the API returns %i', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    const response = await createInvitationPreview(apiBase, fetchImpl)(new Request(requestUrl), {
      next: async () => new Response(originalHtml, { headers: { 'Content-Type': 'text/html' } })
    });
    expect(await response.text()).toBe(originalHtml);
  });

  it('preserves the application on network errors, timeout or missing configuration', async () => {
    for (const base of [apiBase, undefined]) {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
      const response = await createInvitationPreview(base, fetchImpl)(new Request(requestUrl), {
        next: async () => new Response(originalHtml, { headers: { 'Content-Type': 'text/html' } })
      });
      expect(await response.text()).toBe(originalHtml);
      if (!base) expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it.each(['/login', '/album/token', '/invitacion/token/extra'])('does not fetch metadata for %s', async (path) => {
    const { fetchImpl, html } = await render(available(), `https://app.example${path}`);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(html).toBe(originalHtml);
  });
});
