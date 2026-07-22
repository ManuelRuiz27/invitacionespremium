import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AuditActorType } from '../generated/prisma/client';
import { AuditActorFactory } from './audit-actor.factory';

describe('AuditActorFactory', () => {
  it('stores a public token only as a SHA-256 fingerprint', () => {
    const rawToken = 'public-token-that-must-not-be-persisted';
    const actor = AuditActorFactory.publicToken(rawToken);

    expect(actor).toEqual({
      type: AuditActorType.PUBLIC_TOKEN,
      fingerprint: createHash('sha256').update(rawToken).digest('hex')
    });
    expect(actor.fingerprint).not.toContain(rawToken);
    expect(actor.fingerprint).toHaveLength(64);
  });

  it('requires identifiers for user and StaffToken actors', () => {
    expect(() => AuditActorFactory.user('')).toThrow(TypeError);
    expect(() => AuditActorFactory.staffToken('   ')).toThrow(TypeError);
  });

  it('creates a system actor without an identifier', () => {
    expect(AuditActorFactory.system()).toEqual({
      type: AuditActorType.SYSTEM
    });
  });
});
