import { createApiClient, type PublicInvitationView } from '@invitaciones/api-client';
import { invitationAssetIdFromPath } from '../public/routing/public-content-path';

interface PreviewContext {
  next(): Promise<Response>;
}

const description = 'Abre tu invitación para consultar los detalles del evento.';

/** Adds crawler-readable metadata while preserving the original SPA and API authorization. */
export function createInvitationPreview(apiBaseUrl: string | undefined, fetchImpl: typeof fetch = fetch) {
  return async (request: Request, context: PreviewContext): Promise<Response> => {
    const url = new URL(request.url);
    const match = /^\/invitacion\/([A-Za-z0-9_.-]{1,512})\/?$/u.exec(url.pathname);
    const response = await context.next();
    if (!match || request.method !== 'GET' || !response.headers.get('content-type')?.includes('text/html')) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('CDN-Cache-Control', 'no-store');
    headers.set('Netlify-CDN-Cache-Control', 'no-store');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    let metadata = '';
    try {
      if (apiBaseUrl && response.ok) {
        const api = createApiClient({
          baseUrl: apiBaseUrl,
          fetchImpl: (input, init) => fetchImpl(input, { ...init, cache: 'no-store', redirect: 'error' })
        });
        const token = match[1]!;
        const view = await api.publicInvitation.resolve(token, AbortSignal.timeout(3000));
        metadata = previewMetadata(view, token, apiBaseUrl, `${url.origin}${url.pathname}`);
      }
    } catch {
      // An unavailable preview must not prevent the guest from opening the application.
      // Errors can contain the bearer token: never log them or serialize the response.
    }

    const html = await response.text();
    const body = metadata
      ? html.replace(/<title>[^<]*<\/title>/iu, '').replace('</head>', `${metadata}\n</head>`)
      : html;
    // These describe the original static body, which may have changed.
    for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(name);
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  };
}

function previewMetadata(view: PublicInvitationView, token: string, apiBaseUrl: string, pageUrl: string): string {
  if (view.status !== 'AVAILABLE' || !view.event || !view.design) return '';
  const asset =
    view.design.type === 'FLYER'
      ? view.design.flyerInitialAsset
      : view.design.pages.toSorted((left, right) => left.position - right.position)[0]?.asset;
  if (!asset || invitationAssetIdFromPath(asset.contentPath, token) !== asset.id) return '';

  const imageUrl = new URL(asset.contentPath, apiBaseUrl).href;
  const title = view.event.name;
  const meta = (name: string, value: string) => `<meta property="${name}" content="${escapeHtml(value)}" />`;
  return [
    `<title>${escapeHtml(title)} | InvitacionesPremium</title>`,
    meta('og:type', 'website'),
    meta('og:site_name', 'InvitacionesPremium'),
    meta('og:locale', 'es_MX'),
    meta('og:title', title),
    meta('og:description', description),
    meta('og:url', pageUrl),
    meta('og:image', imageUrl),
    meta('og:image:alt', 'Portada de la invitación'),
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export default createInvitationPreview(import.meta.env.VITE_API_BASE_URL);

export const config = { path: '/invitacion/*' };
