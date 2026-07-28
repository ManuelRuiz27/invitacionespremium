import { describe, expect, it } from 'vitest';
import { normalizeEventDestinationUrl } from './event-destination-url';

describe('normalizeEventDestinationUrl', () => {
  it.each([
    ['https://maps.google.com/?q=19.4326,-99.1332', 'https://maps.google.com/?q=19.4326,-99.1332'],
    ['https://maps.google.com/maps/place/Salon', 'https://maps.google.com/maps/place/Salon'],
    [' https://example.com/mesa?evento=1 ', 'https://example.com/mesa?evento=1']
  ])('normalizes an approved destination: %s', (input, expected) => {
    expect(normalizeEventDestinationUrl(input)).toBe(expected);
  });

  it.each([
    'http://example.com',
    'https://user:secret@example.com/path',
    'https://example.com/path#fragment',
    'https://example.com/ruta/token/secret',
    'https://example.com/ruta/telefono/555',
    'https://example.com/?%74oken=secret',
    'https://example.com/?Invitation-Token=secret',
    'https://example.com/?invitation_token=secret',
    'https://example.com/?NAME=Ana',
    'https://example.com/?phone-number=555',
    'https://example.com/\\internal',
    'https://example.com/path\nnext'
  ])('rejects a private or unsafe destination: %s', (input) => {
    expect(normalizeEventDestinationUrl(input)).toBeNull();
  });
});
