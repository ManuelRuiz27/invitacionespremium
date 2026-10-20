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

  it('leaves optional phone eligibility to the locked Event context', () => {
    expect(parseCreateContactRequest({ name: '  Nombre   repetido ' })).toEqual({ name: 'Nombre repetido' });
    expect(parseCreateContactRequest({ name: 'Nombre', whatsappPhone: null }).whatsappPhone).toBeNull();
    expect(parseUpdateContactRequest({ whatsappPhone: null })).toEqual({ whatsappPhone: null });
    for (const name of ['', '  ', '\n\t']) {
      expect(() => parseCreateContactRequest({ name })).toThrow();
      expect(() => parseUpdateContactRequest({ name })).toThrow();
    }
    expect(() => parseCreateContactRequest({ name: 'Nombre', whatsappPhone: '' })).toThrow();
    expect(() => parseUpdateContactRequest({ whatsappPhone: 123 })).toThrow();
  });

  it('rejects empty updates and unknown fields', () => {
    expect(() => parseUpdateContactRequest({})).toThrow();
    expect(() =>
      parseCreateContactRequest({ name: 'A', whatsappPhone: '+525511111111', rawPhone: 'secret' })
    ).toThrow();
  });
});
