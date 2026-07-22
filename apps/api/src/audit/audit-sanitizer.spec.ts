import { describe, expect, it } from 'vitest';
import { sanitizeAuditObject } from './audit-sanitizer';

describe('sanitizeAuditObject', () => {
  it('redacts secrets and personal contact fields recursively', () => {
    const sanitized = sanitizeAuditObject({
      status: 'active',
      password: 'never-store-this',
      nested: {
        invitationToken: 'raw-token',
        whatsapp: '+5214440000000',
        safeValue: 42
      },
      entries: [
        {
          authorization: 'Bearer secret',
          name: 'Allowed for this test'
        }
      ]
    });

    expect(sanitized).toEqual({
      status: 'active',
      password: '[REDACTED]',
      nested: {
        invitationToken: '[REDACTED]',
        whatsapp: '[REDACTED]',
        safeValue: 42
      },
      entries: [
        {
          authorization: '[REDACTED]',
          name: 'Allowed for this test'
        }
      ]
    });
  });

  it('normalizes dates and bigint values to JSON-safe strings', () => {
    expect(
      sanitizeAuditObject({
        occurredAt: new Date('2026-07-22T18:00:00.000Z'),
        sequence: 10n
      })
    ).toEqual({
      occurredAt: '2026-07-22T18:00:00.000Z',
      sequence: '10'
    });
  });
});
