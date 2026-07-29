import { describe, expect, it } from 'vitest';
import { parseScannerCheckIn, parseScannerSearch } from './scanner.dto';

describe('Scanner DTOs', () => {
  it('normalizes exact-search whitespace without removing accents', () => {
    expect(parseScannerSearch({ query: '  María   López  ' })).toEqual({ query: 'María López' });
  });

  it('rejects partial invalid selections and duplicate Assistant ids', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(() => parseScannerCheckIn({ invitationId: id, assistantIds: [] })).toThrow();
    expect(() => parseScannerCheckIn({ invitationId: id, assistantIds: [id, id] })).toThrow();
  });
});
