import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseCreateStaffToken } from './staff-access.dto';
import { STAFF_TOKEN_PATTERN, StaffTokenTechnicalService } from './staff-token-technical.service';

describe('StaffTokenTechnicalService', () => {
  const service = new StaffTokenTechnicalService();

  it('generates a versioned token with exactly 32 random bytes', () => {
    const generated = service.generate();
    expect(generated.rawToken).toMatch(STAFF_TOKEN_PATTERN);
    expect(Buffer.from(generated.rawToken.slice(4), 'base64url')).toHaveLength(32);
    expect(generated.version).toBe(1);
  });

  it('persists a deterministic lowercase SHA-256 digest instead of the secret', () => {
    const generated = service.generate();
    expect(generated.digestSha256).toBe(createHash('sha256').update(generated.rawToken, 'utf8').digest('hex'));
    expect(generated.digestSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(generated.digestSha256).not.toContain(generated.rawToken);
  });

  it.each([
    'st1.short',
    `st2.${'A'.repeat(43)}`,
    `st1.${'A'.repeat(42)}`,
    `st1.${'A'.repeat(44)}`,
    `st1.${'!'.repeat(43)}`
  ])('rejects malformed syntax: %s', (token) => {
    expect(service.isValidSyntax(token)).toBe(false);
  });

  it('normalizes a bounded operational alias', () => {
    expect(parseCreateStaffToken({ alias: '  Acceso   principal  ' })).toEqual({
      alias: 'Acceso principal'
    });
  });
});
