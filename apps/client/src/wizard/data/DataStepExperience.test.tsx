import type { Event, UpdateEventInput } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent } from '../../test/fixtures';
import type { SaveState } from '../wizard-model';
import { DataStep } from './DataStep';

const services = [{ id: 'flyer', code: 'FLYER' as const, priceRules: [] }];
const initial: UpdateEventInput = {
  confirmationEnabled: false,
  floorplanEnabled: false,
  name: 'Ana y Luis',
  serviceId: 'flyer',
  socialType: 'WEDDING',
  capacity: 100,
  eventDateTime: '2027-01-15T23:00:00Z',
  timeZone: 'America/Cancun'
};
function Harness({
  event,
  saveState = 'idle',
  disabled = false,
  onChange = vi.fn(),
  value = initial
}: {
  event?: Event;
  saveState?: SaveState;
  disabled?: boolean;
  onChange?: (patch: Partial<UpdateEventInput>) => void;
  value?: UpdateEventInput;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <AppThemeProvider>
      <DataStep
        services={services}
        draft={draft}
        event={event}
        saveState={saveState}
        disabled={disabled}
        onChange={(patch) => {
          onChange(patch);
          setDraft((current) => ({ ...current, ...patch }));
        }}
      />
    </AppThemeProvider>
  );
}
afterEach(() => vi.unstubAllEnvs());

describe('Event data experience', () => {
  it('adds, edits and opens a gift registry with keyboard focus and no manual save', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('textbox', { name: 'Mesa de regalos' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar mesa de regalos' }));
    const input = screen.getByRole('textbox', { name: 'Mesa de regalos' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Ver tarjeta' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'https://mesaderegalos.liverpool.com.mx/evento/123' } });
    await user.click(screen.getByRole('button', { name: 'Ver tarjeta' }));
    expect(screen.getByText('Liverpool')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir mesa de regalos' })).toHaveAttribute('rel', 'noopener noreferrer');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByRole('textbox', { name: 'Mesa de regalos' })).toHaveValue(
      'https://mesaderegalos.liverpool.com.mx/evento/123'
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Mesa de regalos' }), {
      target: { value: 'https://regalos.example/evento' }
    });
    await user.click(screen.getByRole('button', { name: 'Ver tarjeta' }));
    expect(screen.getByRole('link', { name: 'Abrir mesa de regalos' })).toHaveAttribute(
      'href',
      'https://regalos.example/evento'
    );
  });

  it('loads a configured Google map only on request and retains a safe fallback for short links and invalid URLs', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_EMBED_API_KEY', `AIza${'x'.repeat(35)}`);
    render(<Harness value={{ ...initial, locationUrl: 'https://maps.google.com/?q=Salon%20Central' }} />);
    expect(screen.queryByTitle('Mapa de la ubicación del evento')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver mapa interactivo' }));
    expect(screen.getByTitle('Mapa de la ubicación del evento')).toHaveAttribute('loading', 'lazy');
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'https://maps.app.goo.gl/ejemplo' } });
    expect(screen.queryByTitle('Mapa de la ubicación del evento')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir ubicación' })).toHaveAttribute(
      'href',
      'https://maps.app.goo.gl/ejemplo'
    );
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'https://user:pass@example.com' } });
    expect(screen.getByLabelText('Ubicación')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('link', { name: 'Abrir ubicación' })).not.toBeInTheDocument();
  });

  it('shows a functional location link without Maps configuration', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_EMBED_API_KEY', '');
    render(<Harness value={{ ...initial, locationUrl: 'https://maps.google.com/?q=Salon' }} />);
    expect(screen.getByRole('link', { name: 'Abrir ubicación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver mapa interactivo' })).not.toBeInTheDocument();
  });

  it('requires a server snapshot for completion, keeps optional empty blocks unconfirmed, and exposes failed autosave', () => {
    const server = { ...configuredEvent, ...initial } as Event;
    const { rerender } = render(<Harness event={server} />);
    expect(screen.getByRole('region', { name: 'Tu celebración' })).toHaveAttribute('data-validation', 'confirmed');
    expect(screen.getByRole('region', { name: 'Lugar del evento' })).toHaveAttribute('data-validation', 'empty');
    expect(screen.queryByLabelText('Mesa de regalos: confirmado por el servidor')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre del evento'), { target: { value: 'Nombre pendiente' } });
    expect(screen.getByRole('region', { name: 'Tu celebración' })).toHaveAttribute('data-validation', 'editing');
    rerender(<Harness event={server} saveState="error" />);
    expect(screen.getByRole('region', { name: 'Tu celebración' })).toHaveAttribute('data-validation', 'error');
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos guardar este bloque');
    rerender(<Harness event={{ ...server, name: 'Nombre pendiente' }} saveState="saved" />);
    expect(screen.getByRole('img', { name: 'Tu celebración: confirmado por el servidor' })).toBeInTheDocument();
  });

  it('selects date and time without inventing a start time, restores mobile dialog focus, and clears date', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness value={{ ...initial, eventDateTime: null }} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Elegir fecha del evento' });
    await user.click(trigger);
    const day = screen
      .getAllByRole('button')
      .find((button) => /, 15 de /.test(button.getAttribute('aria-label') ?? ''))!;
    await user.click(day);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Elige la hora de inicio para completar la fecha.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '18:30' } });
    expect(onChange).toHaveBeenCalledWith({ eventDateTime: expect.stringMatching(/T23:30:00.000Z$/) });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar fecha y hora' }));
    expect(onChange).toHaveBeenLastCalledWith({ eventDateTime: null });
  });

  it('keeps technical fields read-only when editing is disabled', () => {
    const onChange = vi.fn();
    render(<Harness disabled onChange={onChange} />);
    for (const input of ['Nombre del evento', 'Cantidad de invitados', 'Hora de inicio', 'Ubicación'])
      expect(screen.getByLabelText(input)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Boda' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Agregar mesa de regalos' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
