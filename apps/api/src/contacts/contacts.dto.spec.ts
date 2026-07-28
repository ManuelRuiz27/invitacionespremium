import { describe, expect, it } from 'vitest';
import { normalizeGroupName, parseCreateContactRequest, parseUpdateContactRequest } from './contacts.dto';

describe('Contacts DTOs', () => {
  it('normalizes display and matching whitespace', () => {
    expect(parseCreateContactRequest({ name: '  María   Ejemplo ', whatsappPhone: ' 55 1234 5678 ' })).toEqual({
      name: 'María Ejemplo',
      whatsappPhone: '55 1234 5678'
    });
    expect(normalizeGroupName('  Familia   CERCANA ')).toBe('familia cercana');
  });

  it('rejects empty updates and unknown fields', () => {
    expect(() => parseUpdateContactRequest({})).toThrow();
    expect(() =>
      parseCreateContactRequest({ name: 'A', whatsappPhone: '+525511111111', rawPhone: 'secret' })
    ).toThrow();
  });
});
