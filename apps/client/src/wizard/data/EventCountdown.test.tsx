import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventCountdown } from './EventCountdown';

afterEach(() => vi.useRealTimers());
describe('Event countdown with the device clock', () => {
  it('updates each second and changes its message at local midnight without a reload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-16T04:59:58Z'));
    render(<EventCountdown target="2027-01-16T04:59:59Z" zone="America/Cancun" />);
    expect(screen.getByRole('timer')).toHaveAccessibleName(/1 segundos/);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Hoy es el evento')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('La fecha del evento ya pasó')).toBeInTheDocument();
  });

  it('uses event-local dates, handles missing dates, and tears down timers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-16T03:00:00Z'));
    const { rerender, unmount } = render(<EventCountdown target="2027-01-16T02:00:00Z" zone="America/Cancun" />);
    expect(screen.getByText('Hoy es el evento')).toBeInTheDocument();
    rerender(<EventCountdown target={null} zone="America/Cancun" />);
    expect(screen.getByText(/Elige una fecha/)).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
