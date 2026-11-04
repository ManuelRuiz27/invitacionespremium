import type { Event, UpdateEventInput } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { configuredEvent } from '../../test/fixtures';
import { chooseEventTime } from '../../test/event-data-controls';
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
  timeZone: 'America/Cancun',
  locationUrl: 'https://maps.google.com/?q=Salon'
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

  it('keeps external map links without loading an iframe and rejects unsafe destinations', () => {
    render(<Harness />);
    expect(screen.queryByTitle('Mapa de la ubicación del evento')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir ubicación' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=Salon'
    );
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'https://maps.app.goo.gl/ejemplo' } });
    expect(screen.getByRole('link', { name: 'Abrir ubicación' })).toHaveAttribute(
      'href',
      'https://maps.app.goo.gl/ejemplo'
    );
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'https://user:pass@example.com' } });
    expect(screen.getByLabelText('Ubicación')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('link', { name: 'Abrir ubicación' })).not.toBeInTheDocument();
  });

  it('extracts a safe external link from copied Maps HTML without rendering markup', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.paste(screen.getByLabelText('Ubicación'), {
      clipboardData: {
        getData: () => '<iframe src="https://www.google.com/maps/embed?pb=!1m18!2sVenue" onload="alert(1)"></iframe>'
      }
    });
    expect(onChange).toHaveBeenCalledWith({ locationUrl: 'https://www.google.com/maps/embed?pb=%211m18%212sVenue' });
    expect(screen.getByRole('link', { name: 'Abrir ubicación' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/embed?pb=%211m18%212sVenue'
    );
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('shows a functional location link without Maps configuration', () => {
    render(<Harness value={{ ...initial, locationUrl: 'https://maps.google.com/?q=Salon' }} />);
    expect(screen.getByRole('link', { name: 'Abrir ubicación' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver mapa interactivo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Agrega el mapa de tu celebración')).not.toBeInTheDocument();
  });

  it('keeps untouched confirmed and empty blocks unchanged while another block is saving', () => {
    const server = { ...configuredEvent, ...initial } as Event;
    render(<Harness event={server} saveState="saving" />);
    fireEvent.change(screen.getByLabelText('Nombre del evento'), { target: { value: 'Nombre pendiente' } });
    expect(screen.getByRole('region', { name: 'Tu celebración' })).toHaveAttribute('data-validation', 'editing');
    expect(screen.getByRole('region', { name: 'Cuándo y dónde' })).toHaveAttribute('data-validation', 'confirmed');
    expect(screen.getByRole('region', { name: 'Mesa de regalos' })).toHaveAttribute('data-validation', 'empty');
  });

  it('confirms saved date and time even when the optional location is empty', () => {
    const value = { ...initial, locationUrl: null };
    render(<Harness value={value} event={{ ...configuredEvent, ...value } as Event} />);
    expect(screen.getByRole('region', { name: 'Cuándo y dónde' })).toHaveAttribute('data-validation', 'confirmed');
    expect(screen.getByLabelText('Ubicación')).toHaveValue('');
  });

  it('keeps a DST error visible when the location link is also invalid', async () => {
    render(<Harness value={{ ...initial, timeZone: 'America/Tijuana', eventDateTime: '2026-03-08T09:00:00.000Z' }} />);
    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'enlace inválido' } });
    await chooseEventTime('02:30');
    expect(screen.getByRole('alert')).toHaveTextContent('La hora no existe');
    expect(screen.getByLabelText('Ubicación')).toHaveAttribute('aria-invalid', 'true');
  });

  it('requires a server snapshot for completion, keeps optional empty blocks unconfirmed, and exposes failed autosave', () => {
    const server = { ...configuredEvent, ...initial } as Event;
    const { rerender } = render(<Harness event={server} />);
    expect(screen.getByRole('region', { name: 'Tu celebración' })).toHaveAttribute('data-validation', 'confirmed');
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
    await chooseEventTime('18:30');
    expect(onChange).toHaveBeenCalledWith({ eventDateTime: expect.stringMatching(/T23:30:00.000Z$/) });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar fecha y hora' }));
    expect(onChange).toHaveBeenLastCalledWith({ eventDateTime: null });
  });

  it('keeps technical fields read-only when editing is disabled', () => {
    const onChange = vi.fn();
    render(<Harness disabled onChange={onChange} />);
    for (const input of ['Nombre del evento', 'Cantidad de invitados', 'Ubicación'])
      expect(screen.getByLabelText(input)).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Hora de inicio:/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Boda' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Agregar mesa de regalos' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
