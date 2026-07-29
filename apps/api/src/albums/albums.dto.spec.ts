import { describe, expect, it } from 'vitest';
import { parseCreateAlbum, parseUpdateAlbum } from './albums.dto';

const valid = {
  title: 'Nuestro gran día',
  thankYouMessage: 'Gracias por acompañarnos',
  theme: {
    backgroundColor: '#FFFFFF',
    textColor: '#111111',
    accentColor: '#C5A46D'
  },
  externalButton: { label: 'Ver video', url: 'https://example.com/video' }
};

describe('Album DTOs', () => {
  it('accepts strict visual configuration and normalizes the HTTPS URL', () => {
    expect(parseCreateAlbum(valid)).toEqual(valid);
    expect(parseUpdateAlbum({ externalButton: null })).toEqual({ externalButton: null });
  });

  it.each([
    { ...valid, extra: true },
    { ...valid, title: '<b>Álbum</b>' },
    { ...valid, theme: { ...valid.theme, accentColor: '#fff' } },
    { ...valid, theme: { ...valid.theme, extra: '#FFFFFF' } },
    { ...valid, externalButton: { label: 'Video', url: 'http://example.com' } },
    { ...valid, externalButton: { label: 'Video' } }
  ])('rejects invalid or non-strict input', (input) => {
    expect(() => parseCreateAlbum(input)).toThrow();
  });
});
