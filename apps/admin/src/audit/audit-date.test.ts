import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDateTimeToInstant } from './audit-date';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('localDateTimeToInstant', () => {
  it('preserves the instant represented in America/Mexico_City without slicing strings', () => {
    vi.stubEnv('TZ', 'America/Mexico_City');
    expect(localDateTimeToInstant('2026-08-04T12:30')).toBe('2026-08-04T18:30:00.000Z');
  });

  it('supports empty values and rejects invalid local dates', () => {
    expect(localDateTimeToInstant('')).toBeUndefined();
    expect(() => localDateTimeToInstant('invalid')).toThrow(TypeError);
  });
});
