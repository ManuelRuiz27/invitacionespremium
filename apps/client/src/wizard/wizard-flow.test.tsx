import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

describe('integrated Event wizard flows', () => {
  it('opens a new wizard without creating a draft, then creates exactly once on meaningful navigation', async () => {
    const api = mockApiClient();
    renderApp(api, '/eventos/nuevo');
    expect(await screen.findByRole('heading', { name: 'Nuevo Evento' })).toBeInTheDocument();
    expect(api.events.create).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('combobox', { name: /Servicio/ }));
    await userEvent.click(await screen.findByRole('option', { name: /FLYER/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await waitFor(() => expect(api.events.create).toHaveBeenCalledTimes(1));
  });

  it('reloads an existing Event by URL and renders the requested step', async () => {
    const api = mockApiClient();
    renderApp(api, `/eventos/${configuredEvent.id}/configuracion/contactos`);
    expect(await screen.findByRole('heading', { name: 'Contactos y grupos' })).toBeInTheDocument();
    expect(api.events.get).toHaveBeenCalledWith(configuredEvent.id, expect.any(AbortSignal));
  });

  it('keeps finance hidden from an organization planner during review', async () => {
    const api = mockApiClient({
      ...configuredEvent,
      id: 'user',
      email: 'planner@example.com',
      role: 'ORGANIZATION_PLANNER',
      clientId: configuredEvent.clientId,
      clientType: 'ORGANIZATION',
      clientStatus: 'ACTIVE'
    });
    renderApp(api, `/eventos/${configuredEvent.id}/configuracion/revision`);
    expect(await screen.findByText('Tu rol no tiene acceso al detalle financiero.')).toBeInTheDocument();
    expect(api.finance.balance).not.toHaveBeenCalled();
  });

  it('reconciles an unknown activation outcome by reloading the Event', async () => {
    const api = mockApiClient();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.events.activate).mockRejectedValueOnce(new TypeError('network'));
    vi.mocked(api.events.get)
      .mockResolvedValueOnce(configuredEvent)
      .mockResolvedValueOnce({
        ...configuredEvent,
        status: 'ACTIVE'
      });
    renderApp(api, `/eventos/${configuredEvent.id}/configuracion/revision`);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar Evento' }));
    expect(await screen.findByText('La activación fue confirmada al reconciliar el Evento.')).toBeInTheDocument();
  });
});
