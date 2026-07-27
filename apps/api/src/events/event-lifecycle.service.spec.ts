import { describe, expect, it } from 'vitest';
import { isSameLocalDate, localDateKey } from './event-lifecycle.service';

describe('Event lifecycle local dates', () => {
  const timeZone = 'America/Mexico_City';

  it('compares dates in the Event IANA time zone', () => {
    expect(localDateKey(new Date('2026-07-28T05:59:00.000Z'), timeZone)).toBe('2026-07-27');
    expect(localDateKey(new Date('2026-07-28T06:01:00.000Z'), timeZone)).toBe('2026-07-28');
  });

  it('changes equality when local midnight is crossed', () => {
    const eventDate = new Date('2026-07-28T02:00:00.000Z');
    expect(isSameLocalDate(new Date('2026-07-28T05:59:00.000Z'), eventDate, timeZone)).toBe(true);
    expect(isSameLocalDate(new Date('2026-07-28T06:01:00.000Z'), eventDate, timeZone)).toBe(false);
  });
});
