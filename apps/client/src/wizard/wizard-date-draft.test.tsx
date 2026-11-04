import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Event as ApiEvent } from '@invitaciones/api-client';
import { configuredEvent, mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const route = `/eventos/${configuredEvent.id}/configuracion/datos`;
const pendingMessage = 'Completa la fecha y la hora, o quítalas para continuar.';

async function selectDay() {
  await userEvent.click(await screen.findByRole('button', { name: 'Elegir fecha del evento' }));
  await userEvent.click(screen.getByRole('button', { name: /, 15 de / }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

function setup(eventDateTime: string | null = null, initialEntry = route, timeZone = 'America/Mexico_City') {
  const api = mockApiClient();
  const event = { ...configuredEvent, serviceId: 'service-flyer', eventDateTime, timeZone };
  vi.mocked(api.events.get).mockResolvedValue(event);
  vi.mocked(api.events.update).mockImplementation(async (_, input) => ({ ...event, ...input }) as ApiEvent);
  return { api, ...renderApp(api, initialEntry) };
}

describe('partial event date navigation', () => {
  it.each(['Continuar', 'Salir'])(
    'retains a day without a time when attempting %s, then saves the complete pair',
    async (action) => {
      const { api, router } = setup();
      await selectDay();
      const selectedDay = screen.getByRole('button', { name: /^15 de / }).textContent;
      expect(screen.getByText('Cambios pendientes')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: action }));
      expect(router.state.location.pathname).toBe(route);
      expect(screen.getAllByText(pendingMessage).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: selectedDay! })).toBeInTheDocument();
      expect(screen.getByLabelText('Hora de inicio')).toHaveValue('');
      expect(api.events.update).not.toHaveBeenCalled();
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);

      fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '18:30' } });
      await userEvent.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(router.state.location.pathname).not.toBe(route));
      expect(api.events.update).toHaveBeenCalledWith(
        configuredEvent.id,
        expect.objectContaining({ eventDateTime: expect.stringMatching(/T00:30:00.000Z$/) })
      );
    }
  );

  it('blocks shell and browser Back navigation until the partial date is explicitly cleared', async () => {
    const { api, router } = setup(null, '/eventos');
    await act(() => router.navigate(route));
    await selectDay();
    await act(() => router.navigate('/finanzas'));
    expect(router.state.location.pathname).toBe(route);
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe(route);
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar fecha y hora' }));
    // Clearing is still a pending autosave until the explicit exit flushes it.
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/eventos'));
    expect(api.events.update).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ eventDateTime: null })
    );
  });

  it('does not create a new event or lose a time-only draft when navigation is blocked', async () => {
    const { api, router } = setup(null, '/eventos/nuevo');
    fireEvent.change(await screen.findByLabelText('Hora de inicio'), { target: { value: '18:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(router.state.location.pathname).toBe('/eventos/nuevo');
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('18:30');
    expect(api.events.create).not.toHaveBeenCalled();
  });

  it('keeps the last saved instant when only its time is erased, including other field autosaves', async () => {
    const instant = '2027-01-15T23:00:00.000Z';
    const { api, router } = setup(instant);
    fireEvent.change(await screen.findByLabelText('Hora de inicio'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Nombre del evento'), { target: { value: 'Nombre actualizado' } });
    await waitFor(() => expect(api.events.update).toHaveBeenCalledTimes(1));
    expect(api.events.update).toHaveBeenLastCalledWith(
      configuredEvent.id,
      expect.objectContaining({ eventDateTime: instant })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(router.state.location.pathname).toBe(route);
    expect(screen.getByRole('button', { name: '15 de enero de 2027' })).toBeInTheDocument();
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('');
    expect(screen.getByRole('region', { name: 'Fecha y hora del evento' })).not.toHaveAttribute(
      'data-validation',
      'confirmed'
    );
  });

  it('blocks departure for a nonexistent DST hour without changing the saved instant', async () => {
    const { api, router } = setup('2026-03-08T09:00:00.000Z', route, 'America/Tijuana');
    fireEvent.change(await screen.findByLabelText('Hora de inicio'), { target: { value: '02:30' } });
    expect(screen.getByText(/La hora no existe/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(router.state.location.pathname).toBe(route);
    expect(screen.getByLabelText('Hora de inicio')).toHaveValue('02:30');
    expect(api.events.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '03:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/eventos'));
    expect(api.events.update).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ eventDateTime: '2026-03-08T10:30:00.000Z' })
    );
  });

  it.each(['2026-03-08T07:30:00.000Z', '2026-11-01T06:30:00.000Z'])(
    'allows exiting after cancelling a rejected zone conversion for %s',
    async (instant) => {
      const { api, router } = setup(instant, route, 'America/Cancun');
      fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Zona horaria' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Tijuana' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cambiar zona' }));
      expect(screen.getByRole('dialog', { name: 'Cambiar zona horaria' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/no existe|ambigua/);
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/eventos'));
      expect(api.events.update).not.toHaveBeenCalled();
    }
  );
});
