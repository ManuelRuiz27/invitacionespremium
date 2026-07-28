import { describe, expect, it } from 'vitest';
import { parseRsvpAssistants, parseRsvpOverride } from './public-rsvp.dto';

describe('Public RSVP DTOs', () => {
  it('normalizes nominal assistants and accepts duplicate names', () => {
    expect(
      parseRsvpAssistants({
        additionalAssistants: [{ name: '  María   Uno ' }, { name: 'María Uno' }]
      })
    ).toEqual({ additionalAssistants: [{ name: 'María Uno' }, { name: 'María Uno' }] });
  });

  it('rejects duplicate ids, unknown fields and invalid overrides', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(() =>
      parseRsvpAssistants({
        additionalAssistants: [
          { id, name: 'A' },
          { id, name: 'B' }
        ]
      })
    ).toThrow();
    expect(() => parseRsvpAssistants({ additionalAssistants: [], principal: 'forbidden' })).toThrow();
    expect(() => parseRsvpOverride({ responseStatus: 'PENDING', additionalAssistants: [] })).toThrow();
  });
});
