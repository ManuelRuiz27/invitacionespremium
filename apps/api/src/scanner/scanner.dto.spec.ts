import { describe, expect, it } from 'vitest';
import { parseScannerCheckIn, parseScannerSearch, parseScannerScan } from './scanner.dto';

describe('Scanner DTOs', () => {
  it('accepts only the QR body shared by the nominal scan and validates its boundaries', () => {
    expect(parseScannerScan({ qrToken: '  na1.material.signature  ' })).toEqual({ qrToken: 'na1.material.signature' });
    for (const body of [
      {},
      { qrToken: null },
      { qrToken: '  ' },
      { qrToken: 'x'.repeat(513) },
      { qrToken: 'na1.token', assistantId: 'extra' },
      { qrToken: 1 }
    ]) {
      expect(() => parseScannerScan(body)).toThrow();
    }
  });
  it('normalizes exact-search whitespace without removing accents', () => {
    expect(parseScannerSearch({ query: '  María   López  ' })).toEqual({ query: 'María López' });
  });

  it('rejects partial invalid selections and duplicate Assistant ids', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(() => parseScannerCheckIn({ invitationId: id, assistantIds: [] })).toThrow();
    expect(() => parseScannerCheckIn({ invitationId: id, assistantIds: [id, id] })).toThrow();
  });
});
