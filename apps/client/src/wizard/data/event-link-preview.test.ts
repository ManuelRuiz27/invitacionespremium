import { describe, expect, it } from 'vitest';
import { giftProvider, mapEmbedHref, previewHref } from './event-link-preview';

describe('Event link previews', () => {
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
