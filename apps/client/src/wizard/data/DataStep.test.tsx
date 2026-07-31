import type { UpdateEventInput } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStep } from './DataStep';

const services = [
  { id: 'service-flyer', code: 'FLYER' as const, credits: 5, validFrom: '2026-01-01T00:00:00Z', validUntil: null }
];
const draft = (eventDateTime: string, timeZone = 'America/Cancun'): UpdateEventInput => ({
  confirmationEnabled: false,
  floorplanEnabled: false,
  eventDateTime,
  timeZone
});
const view = (value: UpdateEventInput, onChange = vi.fn()) =>
  render(
    <AppThemeProvider>
      <DataStep services={services} draft={value} disabled={false} onChange={onChange} />
    </AppThemeProvider>
  );
const chooseZone = async (zone: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Zona horaria IANA' }));
  fireEvent.click(await screen.findByRole('option', { name: zone }));
};

describe('DataStep time zones', () => {
  beforeEach(() =>
    vi
      .spyOn(Intl, 'supportedValuesOf')
      .mockReturnValue(['America/Mexico_City', 'America/Cancun', 'America/Tijuana', 'UTC'])
  );
  afterEach(() => vi.restoreAllMocks());

  it('submits zone and instant atomically and preserves the wall clock after an authoritative reload', async () => {
    const onChange = vi.fn();
    const rendered = view(draft('2026-01-15T23:30:00.000Z'), onChange);
    expect(screen.getByLabelText('Fecha y hora del Evento')).toHaveValue('2026-01-15T18:30');
    await chooseZone('America/Tijuana');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar zona' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      timeZone: 'America/Tijuana',
      eventDateTime: '2026-01-16T02:30:00.000Z'
    });

    rendered.rerender(
      <AppThemeProvider>
        <DataStep
          services={services}
          draft={draft('2026-01-16T02:30:00.000Z', 'America/Tijuana')}
          disabled={false}
          onChange={onChange}
        />
      </AppThemeProvider>
    );
    expect(screen.getByLabelText('Fecha y hora del Evento')).toHaveValue('2026-01-15T18:30');
  });

  it.each([
    ['2026-03-08T02:30', 'no existe'],
    ['2026-11-01T01:30', 'ambigua']
  ])('keeps the dialog open and the draft unchanged for %s', async (wallClock, message) => {
    const onChange = vi.fn();
    view(draft('2026-01-15T23:30:00.000Z'), onChange);
    fireEvent.change(screen.getByLabelText('Fecha y hora del Evento'), { target: { value: wallClock } });
    onChange.mockClear();
    await chooseZone('America/Tijuana');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar zona' }));
    expect(screen.getByRole('dialog', { name: 'Cambiar zona horaria' })).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(message, 'i')).length).toBeGreaterThan(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels a zone change without changing the draft', async () => {
    const onChange = vi.fn();
    view(draft('2026-01-15T23:30:00.000Z'), onChange);
    await chooseZone('America/Tijuana');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
