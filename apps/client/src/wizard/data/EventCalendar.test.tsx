import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventCalendar } from './EventCalendar';

describe('Event calendar', () => {
  it('selects real days, marks the selected date, and moves focus across months with the keyboard', () => {
    const onChange = vi.fn();
    render(
      <AppThemeProvider>
        <EventCalendar value="2028-02-29" today="2028-02-10" disabled={false} onChange={onChange} />
      </AppThemeProvider>
    );
    const selected = screen.getByRole('button', { name: 'martes, 29 de febrero de 2028' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(selected, { key: 'ArrowRight' });
    const next = screen.getByRole('button', { name: 'miércoles, 1 de marzo de 2028' });
    expect(next).toHaveFocus();
    fireEvent.click(next);
    expect(onChange).toHaveBeenCalledWith('2028-03-01');
    fireEvent.keyDown(next, { key: 'Home' });
    expect(screen.getByRole('button', { name: 'lunes, 28 de febrero de 2028' })).toHaveFocus();
  });

  it('clamps PageUp to a real day and blocks editing when disabled', () => {
    const { rerender } = render(
      <EventCalendar value="2027-03-31" today="2027-03-01" disabled={false} onChange={vi.fn()} />
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'miércoles, 31 de marzo de 2027' }), { key: 'PageUp' });
    expect(screen.getByRole('button', { name: 'domingo, 28 de febrero de 2027' })).toHaveFocus();
    rerender(<EventCalendar value="2027-03-31" today="2027-03-01" disabled onChange={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
