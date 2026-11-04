import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EventAnalogClock } from './EventAnalogClock';

afterEach(() => vi.useRealTimers());
it('moves the hands using the event timezone and resynchronizes after visibility changes', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2027-01-15T23:30:00Z'));
  const { container, rerender, unmount } = render(<EventAnalogClock zone="America/Cancun" />);
  expect(screen.getByLabelText('Hora actual en America/Cancun')).toHaveTextContent('18:30');
  expect(container.querySelector('[data-hand="hour"]')).toHaveAttribute('transform', 'rotate(195 50 50)');
  act(() => vi.advanceTimersByTime(1000));
  expect(container.querySelector('[data-hand="second"]')).toHaveAttribute('transform', 'rotate(6 50 50)');
  rerender(<EventAnalogClock zone="UTC" />);
  expect(screen.getByLabelText('Hora actual en UTC')).toHaveTextContent('23:30');
  vi.setSystemTime(new Date('2027-01-16T02:00:00Z'));
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(screen.getByLabelText('Hora actual en UTC')).toHaveTextContent('02:00');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
