import { safeHttpsUrl } from '../../public/routing/public-content-path';

// Presentation safety only. The API remains the authority for destination policy.
export function previewHref(value: string | null | undefined): string | null {
  if (!value || /[\s\\#]/u.test(value)) return null;
  try {
    let decoded = value;
    for (let pass = 0; pass < 4 && decoded.includes('%'); pass++) decoded = decodeURIComponent(decoded);
    if ([...decoded].some((c) => (c.codePointAt(0) ?? 0) < 32 || c.codePointAt(0) === 127)) return null;
    return safeHttpsUrl(value);
  } catch {
    return null;
  }
}

export function giftProvider(href: string): string {
  const host = new URL(href).hostname;
  const providers: [string, string][] = [
    ['liverpool.com.mx', 'Liverpool'],
    ['amazon.com.mx', 'Amazon'],
    ['amazon.com', 'Amazon'],
    ['elpalaciodehierro.com', 'El Palacio de Hierro']
  ];
  return providers.find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] ?? 'Mesa de regalos';
}

export function mapEmbedHref(href: string | null, key: string | undefined): string | null {
  if (!href || !previewHref(href)) return null;
  const source = new URL(href);
  // The URL produced by Google Maps → Share → Embed a map needs no browser API key.
  if (
    source.origin === 'https://www.google.com' &&
    source.pathname === '/maps/embed' &&
    source.searchParams.get('pb')?.trim()
  ) {
    const embed = new URL('https://www.google.com/maps/embed');
    embed.searchParams.set('pb', source.searchParams.get('pb')!);
    return embed.href;
  }
  if (!key || !/^AIza[\w-]{35}$/.test(key)) return null;
  if (
    !['www.google.com', 'google.com', 'maps.google.com', 'www.google.com.mx', 'maps.google.com.mx'].includes(
      source.hostname
    )
  )
    return null;
  if (!source.hostname.startsWith('maps.') && source.pathname !== '/maps' && !source.pathname.startsWith('/maps/'))
    return null;
  const place = source.searchParams.get('query_place_id');
  const query = place ? `place_id:${place}` : source.searchParams.get('q') || source.searchParams.get('query');
  if (!query?.trim()) return null;
  const embed = new URL('https://www.google.com/maps/embed/v1/place');
  embed.searchParams.set('key', key);
  embed.searchParams.set('q', query);
  return embed.href;
}

/** Extract only the allowlisted URL; never render pasted HTML or its attributes. */
export function pastedMapHref(value: string): string | null {
  const match = /^\s*<iframe\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>\s*<\/iframe>\s*$/i.exec(value);
  if (!match) return null;
  const href = match[2]!.replaceAll('&amp;', '&');
  return mapEmbedHref(href, undefined);
}
