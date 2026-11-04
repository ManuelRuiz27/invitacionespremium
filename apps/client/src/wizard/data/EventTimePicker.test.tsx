import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { chooseEventTime } from '../../test/event-data-controls';
import { EventTimePicker } from './EventTimePicker';

function Harness({ initial = '', onChange = vi.fn() }: { initial?: string; onChange?: (time: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <AppThemeProvider>
      <EventTimePicker
        value={value}
        zoneLabel="Ciudad de México"
        disabled={false}
        onEditZone={vi.fn()}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    </AppThemeProvider>
  );
}

describe('friendly event time selection', () => {
  it.each([
    ['00:00', '12:00 a. m.'],
    ['12:00', '12:00 p. m.'],
    ['21:47', '9:47 p. m.'],
    ['01:17', '1:17 a. m.']
  ])('preserves the exact time %s through a 12-hour selection', async (value, label) => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await chooseEventTime(value);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(value);
    expect(screen.getByRole('button', { name: /^Hora de inicio:/ })).toHaveTextContent(label);
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it('does not invent an hour and cancels without changing the saved value', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /^Hora de inicio:/ }));
    expect(screen.getByRole('button', { name: 'Usar hora' })).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Hora' }));
    fireEvent.click(await screen.findByRole('option', { name: '9' }));
    expect(screen.getByRole('button', { name: 'Usar hora' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Hora de inicio:/ })).toHaveTextContent('Elegir hora de inicio');
  });

  it('hydrates the existing minutes and period and restores focus after dismissing', async () => {
    render(<Harness initial="21:47" />);
    const trigger = screen.getByRole('button', { name: /^Hora de inicio:/ });
    await userEvent.click(trigger);
    expect(screen.getByRole('combobox', { name: 'Hora' })).toHaveTextContent('9');
    expect(screen.getByRole('combobox', { name: 'Minutos' })).toHaveTextContent('47');
    expect(screen.getByRole('button', { name: 'p. m.' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
