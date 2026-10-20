import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  parseIssueNominalAccess,
  parseNominalAccessId,
  parseNominalAccessKey,
  parseRevokeNominalAccess
} from './nominal-access.dto';

describe('Nominal access DTOs', () => {
  it('requires UUIDs and operation keys without accepting caller-supplied token material', () => {
    const id = randomUUID();
    expect(parseNominalAccessId(id.toUpperCase())).toBe(id);
    expect(parseNominalAccessKey(' request-1 ')).toBe('request-1');
    parseIssueNominalAccess({});
    for (const key of [undefined, '', ' ', 'a'.repeat(129)]) expect(() => parseNominalAccessKey(key)).toThrow();
    expect(() => parseNominalAccessId('invalid')).toThrow();
    expect(() => parseIssueNominalAccess({ nonce: 'secret' })).toThrow();
  });
  it('accepts a bounded technical reason code and rejects free-text/PII payload fields', () => {
    expect(parseRevokeNominalAccess({ revocationReasonCode: 'OPERATOR_REQUEST' })).toEqual({
      revocationReasonCode: 'OPERATOR_REQUEST'
    });
    for (const body of [
      {},
      { revocationReasonCode: 'Free text' },
      { revocationReasonCode: 'A'.repeat(65) },
      { revocationReasonCode: 'REPLACED', name: 'PII' }
    ])
      expect(() => parseRevokeNominalAccess(body)).toThrow();
  });
});
