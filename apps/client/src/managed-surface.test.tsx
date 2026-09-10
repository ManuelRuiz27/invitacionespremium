import type { Event } from '@invitaciones/api-client';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { activeEvent, configuredEvent, independentUser, managedUser, mockApiClient } from './test/fixtures';
import { renderApp } from './test/render-app';

const readyEvent = {
  ...configuredEvent,
  id: '784c24ef-3ca3-48c7-b5c5-b70c5ece3525',
  name: 'Evento listo',
  status: 'READY_TO_ACTIVATE'
} satisfies Event;

describe('Managed Client surface', () => {
  it('shows only normal Event destinations and hides creation, activation, and Finance navigation', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.list).mockResolvedValue([configuredEvent, readyEvent, activeEvent]);
    renderApp(api, '/eventos');

    expect(await screen.findByRole('heading', { name: 'Eventos', level: 1 })).toBeInTheDocument();
    const eventLinks = await screen.findAllByRole('link', { name: 'Ver evento' });
    expect(screen.queryByRole('link', { name: 'Nuevo evento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continuar configuración' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Activar evento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Finanzas' })).not.toBeInTheDocument();
    expect(eventLinks).toHaveLength(3);
    expect(eventLinks[0]).toHaveAttribute('href', `/eventos/${configuredEvent.id}`);
    expect(eventLinks[1]).toHaveAttribute('href', `/eventos/${readyEvent.id}`);
  });

  it.each([
    '/eventos/nuevo',
    `/eventos/${configuredEvent.id}/configuracion/datos`,
    `/eventos/${configuredEvent.id}/configuracion/croquis`,
    '/finanzas'
  ])('redirects a direct Managed request for %s before mounting the protected surface', async (route) => {
    const api = mockApiClient(managedUser);
    const { router } = renderApp(api, route);

    await waitFor(() => expect(router.state.location.pathname).toBe('/eventos'));
    expect(await screen.findByRole('heading', { name: 'Eventos', level: 1 })).toBeInTheDocument();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
    expect(api.events.get).not.toHaveBeenCalled();
    expect(api.finance.balance).not.toHaveBeenCalled();
    expect(api.finance.movements).not.toHaveBeenCalled();
    expect(api.finance.receipts).not.toHaveBeenCalled();
  });

  it('keeps the guard effective across navigation and browser back history', async () => {
    const api = mockApiClient(managedUser);
    vi.mocked(api.events.get).mockResolvedValue(activeEvent);
    const { router } = renderApp(api, `/eventos/${activeEvent.id}`);
    expect(await screen.findByRole('heading', { name: activeEvent.name!, level: 1 })).toBeInTheDocument();

    await act(async () => router.navigate(`/eventos/${activeEvent.id}/configuracion/revision`));
    await waitFor(() => expect(router.state.location.pathname).toBe('/eventos'));
    await act(async () => router.navigate(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/eventos/${activeEvent.id}`));
    expect(screen.queryByText('Completa los pasos para dejar tu evento listo para activar.')).not.toBeInTheDocument();
  });

  it.each(['CONFIGURED', 'READY_TO_ACTIVATE'] as const)(
    'renders %s as Provider preparation with facts and no technical actions',
    async (status) => {
      const api = mockApiClient(managedUser);
      const event = {
        ...configuredEvent,
        serviceId: 'service-flyer',
        serviceCode: 'FLYER',
        status,
        floorplanEnabled: true
      } satisfies Event;
      vi.mocked(api.events.get).mockResolvedValue(event);
      const { router } = renderApp(api, `/eventos/${event.id}`);

      expect(await screen.findByRole('heading', { name: event.name!, level: 1 })).toBeInTheDocument();
      expect(screen.getByText('Preparación a cargo de InvitacionesPremium')).toBeInTheDocument();
      expect(screen.getByText('Flyer')).toBeInTheDocument();
      expect(screen.getByText('120 personas')).toBeInTheDocument();
      expect(screen.getByText('Con distribución de mesas')).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(`/eventos/${event.id}`);
      expect(screen.queryByRole('navigation', { name: 'Secciones del Evento' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Activar evento/i })).not.toBeInTheDocument();
      expect(api.services.listAvailable).not.toHaveBeenCalled();
      expect(api.events.activate).not.toHaveBeenCalled();
      expect(api.design.get).not.toHaveBeenCalled();
      expect(api.floorplan.get).not.toHaveBeenCalled();
      expect(api.physicalPasses.generate).not.toHaveBeenCalled();
    }
  );

  it('preserves Self-Service creation, Wizard, pre-active destinations, and Finance', async () => {
    const api = mockApiClient(independentUser);
    vi.mocked(api.events.list).mockResolvedValue([configuredEvent, readyEvent]);
    const { router } = renderApp(api, '/eventos');

    expect(await screen.findByRole('link', { name: 'Nuevo evento' })).toHaveAttribute('href', '/eventos/nuevo');
    expect(await screen.findByRole('link', { name: 'Continuar configuración' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Activar evento' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Finanzas' })).toBeInTheDocument();

    await act(async () => router.navigate('/eventos/nuevo'));
    expect(await screen.findByRole('heading', { name: 'Nuevo Evento', level: 1 })).toBeInTheDocument();
    expect(api.services.listAvailable).toHaveBeenCalled();

    await act(async () => router.navigate('/finanzas'));
    expect(await screen.findByRole('heading', { name: 'Finanzas', level: 1 })).toBeInTheDocument();
    expect(api.finance.balance).toHaveBeenCalledTimes(1);
  });
});
