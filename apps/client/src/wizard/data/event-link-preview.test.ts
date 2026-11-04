import { describe, expect, it } from 'vitest';
import { giftProvider, mapEmbedHref, pastedMapHref, previewHref } from './event-link-preview';

describe('Event link previews', () => {
  it('supports the public Google Maps embed URL and extracts only its URL from copied HTML', () => {
    const href = 'https://www.google.com/maps/embed?pb=!1m18!2sVenue';
    expect(new URL(mapEmbedHref(href, undefined)!).searchParams.get('pb')).toBe('!1m18!2sVenue');
    expect(
      pastedMapHref(`<iframe src="${href}" width="600" onload="alert(1)" style="border:0" allowfullscreen=""></iframe>`)
    ).toBe('https://www.google.com/maps/embed?pb=%211m18%212sVenue');
    expect(pastedMapHref('<iframe src="https://evil.test/maps/embed?pb=123"></iframe>')).toBeNull();
    expect(pastedMapHref('<iframe src="javascript:alert(1)"></iframe>')).toBeNull();
    expect(pastedMapHref(`<script>alert(1)</script><iframe src="${href}"></iframe>`)).toBeNull();
    expect(mapEmbedHref('https://www.google.com/maps/embed?pb=', undefined)).toBeNull();
    expect(mapEmbedHref('https://www.google.com:444/maps/embed?pb=x', undefined)).toBeNull();
    expect(mapEmbedHref('https://www.google.com/maps/embed/v1/place?key=anything&q=Venue', undefined)).toBeNull();
  });
  it.each([
    'javascript:alert(1)',
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com/#fragment',
    'https://example.com/\\evil',
    'https://example.com/%250a',
    'https://example.com/%FF',
    'https://example.com/with space'
  ])('never renders an unsafe destination: %s', (href) => expect(previewHref(href)).toBeNull());
  it('preserves legitimate query strings and identifies providers only by exact domain boundaries', () => {
    expect(previewHref('https://maps.google.com/?q=Salon%20Central')).toBe(
      'https://maps.google.com/?q=Salon%20Central'
    );
    expect(giftProvider('https://mesaderegalos.liverpool.com.mx/evento/123')).toBe('Liverpool');
    expect(giftProvider('https://amazon.com.mx.evil.test/evento')).toBe('Mesa de regalos');
    expect(giftProvider('https://unknown.test')).toBe('Mesa de regalos');
  });
  it('requires explicit Maps configuration and a destination present in a recognized Maps URL', () => {
    const href = 'https://www.google.com/maps/search/?api=1&query=Salon%20Central';
    // A synthetic browser key used only to exercise URL composition; never sent to Google.
    const key = `AIza${'x'.repeat(35)}`;
    expect(mapEmbedHref(href, '')).toBeNull();
    expect(mapEmbedHref(href, 'invalid')).toBeNull();
    expect(mapEmbedHref('https://maps.app.goo.gl/unknown', key)).toBeNull();
    expect(mapEmbedHref('https://www.google.com.evil.test/maps?q=wrong', key)).toBeNull();
    const embed = new URL(mapEmbedHref(href, key)!);
    expect(embed.origin + embed.pathname).toBe('https://www.google.com/maps/embed/v1/place');
    expect(embed.searchParams.get('q')).toBe('Salon Central');
    expect(mapEmbedHref('https://maps.google.com/?query_place_id=ChIJ-test', key)).toContain('q=place_id%3AChIJ-test');
  });
});
