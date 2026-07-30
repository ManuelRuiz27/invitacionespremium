import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stableStringify } from './reports.service';

describe('report canonical datasets', () => {
  it('produces the same canonical hash independently of object insertion order', () => {
    const left = { summary: { used: 1, total: 2 }, rows: [{ status: 'USED', passNumber: 1 }] };
    const right = { rows: [{ passNumber: 1, status: 'USED' }], summary: { total: 2, used: 1 } };
    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(createHash('sha256').update(stableStringify(left)).digest('hex')).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('keeps array order authoritative', () => {
    expect(stableStringify({ rows: [1, 2] })).not.toBe(stableStringify({ rows: [2, 1] }));
  });
});
