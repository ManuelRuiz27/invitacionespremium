import type { Countdown, PublicInvitationView } from '@invitaciones/api-client';
import { defaultCountdownStyle } from '@invitaciones/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizedCountdown, countdownCacheKey, countdownCacheTtl } from './countdown-cache';

const countdown: Countdown = {
  ...defaultCountdownStyle,
  id: 'countdown-1',
  revision: 1,
  visualOwnerType: 'FLYER',
  flipbookPageId: null,
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.2
};
function view(config = countdown): PublicInvitationView {
  return {
    status: 'AVAILABLE',
    event: {
      name: 'Evento',
      eventDateTime: '2030-12-18T00:00:00.000Z',
      eventEndDateTime: null,
      timeZone: 'America/Mexico_City',
      locationUrl: null
    },
    design: { type: 'FLYER', pages: [], hotspots: [], countdown: config },
    assistants: [{ id: 'principal', name: 'PRIVATE ASSISTANT', isPrimary: true, responseStatus: 'PENDING' }],
    qr: { available: true, contentPath: '/PRIVATE-TOKEN/qr.svg' }
  } as PublicInvitationView;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('authorized device countdown cache', () => {
  it('persists only allowlisted visual metadata with a bounded TTL and never the private projection', () => {
    const decorated = { ...countdown, invitationToken: 'PRIVATE-TOKEN', assistants: ['PRIVATE ASSISTANT'] };
    expect(authorizedCountdown(view(decorated), 1000)).toEqual(countdown);
    const raw = localStorage.getItem(countdownCacheKey)!;
    expect(raw).not.toMatch(/PRIVATE|assistants|qr|contentPath|Token/);
    const cached = JSON.parse(raw);
    expect(cached.cachedAt).toBe(1000);
    expect(cached.expiresAt).toBe(1000 + countdownCacheTtl);
    expect(authorizedCountdown(view(), 2000)).toEqual(countdown);
    expect(JSON.parse(localStorage.getItem(countdownCacheKey)!).cachedAt).toBe(1000);
  });

  it('replaces expired, corrupt and locally altered data using the current authorized projection', () => {
    localStorage.setItem(countdownCacheKey, '{bad json');
    authorizedCountdown(view(), 1000);
    const poisoned = JSON.parse(localStorage.getItem(countdownCacheKey)!);
    poisoned.content.countdown.numberColor = '#FF0000';
    localStorage.setItem(countdownCacheKey, JSON.stringify(poisoned));
    expect(authorizedCountdown(view(), 2000)?.numberColor).toBe(countdown.numberColor);
    authorizedCountdown(view(), countdownCacheTtl + 3000);
    expect(JSON.parse(localStorage.getItem(countdownCacheKey)!).cachedAt).toBe(countdownCacheTtl + 3000);
  });

  it('invalidates on revision, schedule, removal and access cancellation', () => {
    authorizedCountdown(view(), 1000);
    authorizedCountdown(view({ ...countdown, revision: 2, backgroundOpacity: 0.5 }), 2000);
    let cached = JSON.parse(localStorage.getItem(countdownCacheKey)!);
    expect(cached.content.countdown.revision).toBe(2);
    const rescheduled = view();
    rescheduled.event!.eventDateTime = '2031-01-01T00:00:00.000Z';
    authorizedCountdown(rescheduled, 3000);
    cached = JSON.parse(localStorage.getItem(countdownCacheKey)!);
    expect(cached.content.eventDateTime).toBe('2031-01-01T00:00:00.000Z');
    expect(authorizedCountdown({ status: 'CANCELLED', message: 'Cancelada' } as PublicInvitationView)).toBeNull();
    expect(localStorage.getItem(countdownCacheKey)).toBeNull();
    authorizedCountdown(view(), 4000);
    const removed = view();
    delete removed.design;
    expect(authorizedCountdown(removed)).toBeNull();
    expect(localStorage.getItem(countdownCacheKey)).toBeNull();
  });

  it('keeps the current authorized countdown usable when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked');
    });
    expect(authorizedCountdown(view())).toEqual(countdown);
    expect(authorizedCountdown({ status: 'CLOSED' } as PublicInvitationView)).toBeNull();
  });
});
