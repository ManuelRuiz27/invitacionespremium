import { ApiError, type Event } from '@invitaciones/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  activeEvent,
  configuredEvent,
  financeBalance,
  independentUser,
  mockApiClient,
  organizationAdmin,
  organizationPlanner
} from '../test/fixtures';
import { renderApp } from '../test/render-app';

describe('Client dashboard and financial visibility', () => {
  it.each([
    ['Planner independiente', independentUser],
    ['Admin de Organización', organizationAdmin]
  ])('%s sees Finance navigation and financial data', async (_label, authUser) => {
    const api = mockApiClient(authUser);
    renderApp(api, '/finanzas');

    expect(await screen.findByRole('heading', { name: 'Finanzas', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText('Finanzas').length).toBeGreaterThan(0);
    expect(await screen.findByText('18')).toBeInTheDocument();
    expect(screen.getByText('$60.00')).toBeInTheDocument();
    expect(api.finance.balance).toHaveBeenCalledTimes(1);
    expect(api.finance.movements).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(api.finance.receipts).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('Planner de Organización never sees or requests Finance', async () => {
    const api = mockApiClient(organizationPlanner);
    renderApp(api, '/eventos');

    expect(await screen.findByRole('heading', { name: 'Eventos', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Finanzas' })).not.toBeInTheDocument();
    expect(api.finance.balance).not.toHaveBeenCalled();
    expect(api.finance.movements).not.toHaveBeenCalled();
    expect(api.finance.receipts).not.toHaveBeenCalled();
  });

  it('blocks direct Finance navigation for Planner de Organización without requests', async () => {
    const api = mockApiClient(organizationPlanner);
    renderApp(api, '/finanzas');
    expect(await screen.findByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument();
    expect(api.finance.balance).not.toHaveBeenCalled();
  });

  it('shows dashboard loading and empty states', async () => {
    const pendingApi = mockApiClient();
    vi.mocked(pendingApi.events.list).mockReturnValue(new Promise(() => undefined));
    const pendingView = renderApp(pendingApi, '/eventos');
    expect(await screen.findByText('Cargando Eventos…')).toBeInTheDocument();
    pendingView.unmount();

    const emptyApi = mockApiClient();
    vi.mocked(emptyApi.events.list).mockResolvedValue([]);
    renderApp(emptyApi, '/eventos');
    expect(await screen.findByText('Aún no tienes eventos para mostrar.')).toBeInTheDocument();
  });

  it('shows a legible error and retries the events request', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.list)
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce([configuredEvent]);
    const user = userEvent.setup();
    renderApp(api, '/eventos');

    expect(
      await screen.findByText('No pudimos conectarnos. Revisa tu conexión e inténtalo nuevamente.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findAllByText('Boda de Ana y Luis')).not.toHaveLength(0);
    expect(api.events.list).toHaveBeenCalledTimes(2);
  });

  it('filters and searches locally without exposing technical status values', async () => {
    const api = mockApiClient();
    const user = userEvent.setup();
    renderApp(api, '/eventos');

    expect((await screen.findAllByText('En preparación')).length).toBeGreaterThan(0);
    expect(screen.queryByText('CONFIGURED')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Activos' }));
    expect(screen.queryByText('Boda de Ana y Luis')).not.toBeInTheDocument();
    expect(screen.getAllByText('Cumpleaños de Sofía').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await user.type(screen.getByLabelText('Buscar por nombre'), 'Ana');
    expect(screen.getAllByText('Boda de Ana y Luis').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cumpleaños de Sofía')).not.toBeInTheDocument();
  });

  it('formats dates in the Event time zone and renders table plus mobile cards', async () => {
    const api = mockApiClient();
    renderApp(api, '/eventos');

    const table = await screen.findByRole('table', { name: 'Eventos' });
    expect(within(table).getAllByText(/31 dic 2025/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Eventos en tarjetas')).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
  });

  it('calculates summary groups from authorized events and excludes cancelled from finished', async () => {
    const api = mockApiClient();
    const cancelled = {
      ...configuredEvent,
      id: 'b2997e29-82c4-42be-83b5-cee13a11471c',
      status: 'CANCELLED'
    } satisfies Event;
    vi.mocked(api.events.list).mockResolvedValue([configuredEvent, activeEvent, cancelled]);
    renderApp(api, '/eventos');

    const summary = await screen.findByLabelText('Resumen de Eventos');
    expect(within(summary).getByText('3')).toBeInTheDocument();
    expect(within(summary).getByText('Finalizados').nextElementSibling).toHaveTextContent('0');
  });

  it('expires a session during a query and preserves a safe return route', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.list).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    const { router } = renderApp(api, '/eventos');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.search).toContain('returnTo=%2Feventos');
  });

  it('keeps the Dashboard session mounted when a query returns 500', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.list).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Server error'));
    const { router } = renderApp(api, '/eventos');

    expect(await screen.findByText('El servicio no está disponible por el momento.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/eventos');
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('renders finance alerts only from backend facts', async () => {
    const api = mockApiClient();
    vi.mocked(api.finance.balance).mockResolvedValue({
      ...financeBalance,
      purchasedCredits: 0,
      creditLine: { ...financeBalance.creditLine, status: 'SUSPENDED' }
    });
    renderApp(api, '/finanzas');

    expect(await screen.findByText(/Tienes una deuda pendiente de 3 créditos/)).toBeInTheDocument();
    expect(screen.getByText('Tu línea de crédito está suspendida.')).toBeInTheDocument();
    expect(screen.getByText('Tu saldo comprado está en cero.')).toBeInTheDocument();
    expect(screen.queryByText(/saldo bajo/i)).not.toBeInTheDocument();
  });
});
