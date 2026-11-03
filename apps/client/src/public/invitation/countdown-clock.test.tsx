import { act, render, renderHook, screen } from '@testing-library/react';
import { defaultCountdownStyle, useCountdownSeconds } from '@invitaciones/ui';
import type { Countdown, PublicInvitationView } from '@invitaciones/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountdownLayer, InvitationCountdownClock } from './CountdownLayer';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('countdown time on the device', () => {
  it('uses the server instant even with a wrong device clock, then advances without per-tick requests', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'performance'] });
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const { result, rerender } = renderHook(({ target }) => useCountdownSeconds(target, '2030-12-17T23:59:55Z'), {
      initialProps: { target: '2030-12-18T00:00:00Z' }
    });
    expect(result.current).toBe(5);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(3);
    vi.setSystemTime(new Date('2050-01-01T00:00:00Z'));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
    rerender({ target: '2030-12-18T00:01:00Z' });
    expect(result.current).toBe(55);
  });

  it('recalculates after a hidden interval and handles missing dates without a fabricated countdown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-12-17T23:59:00Z'));
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const { result } = renderHook(() => useCountdownSeconds('2030-12-18T00:00:00Z'));
    expect(result.current).toBe(60);
    act(() => {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    act(() => vi.advanceTimersByTime(45000));
    expect(result.current).toBe(60);
    act(() => {
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(15);
    const invalid = renderHook(() => useCountdownSeconds(null));
    expect(invalid.result.current).toBeNull();
  });

  it('keeps a single clock anchor when a lazy Flipbook countdown leaf is mounted later', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'performance'] });
    vi.setSystemTime(new Date('2030-12-17T23:59:55Z'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const countdown: Countdown = {
      ...defaultCountdownStyle,
      id: 'clock',
      revision: 1,
      visualOwnerType: 'FLIPBOOK_PAGE',
      flipbookPageId: 'page-2',
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.2
    };
    const view: PublicInvitationView = {
      status: 'AVAILABLE',
      event: {
        name: 'Evento',
        eventDateTime: '2030-12-18T00:00:00Z',
        eventEndDateTime: null,
        timeZone: 'America/Mexico_City',
        locationUrl: null
      },
      serverNow: '2030-12-17T23:59:55Z'
    };
    const { rerender } = render(
      <InvitationCountdownClock view={view}>
        <span>Cover</span>
      </InvitationCountdownClock>
    );
    act(() => vi.advanceTimersByTime(4000));
    rerender(
      <InvitationCountdownClock view={view}>
        <CountdownLayer countdown={countdown} />
      </InvitationCountdownClock>
    );
    expect(screen.getByRole('timer')).toHaveAccessibleName(/1 segundos/);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
    expect(screen.getByTestId('invitation-countdown')).toHaveStyle({
      pointerEvents: 'none',
      left: '10%',
      width: '80%'
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('timer')).toHaveAccessibleName('El evento ha comenzado');
  });
});
