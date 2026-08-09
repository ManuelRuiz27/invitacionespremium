import { ApiError, type Event, type EventStatus } from '@invitaciones/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { activeEvent, configuredEvent, mockApiClient } from '../test/fixtures';
import { renderApp } from '../test/render-app';

const workspaceEvent = {
  ...activeEvent,
  serviceId: 'service-flyer',
  serviceCode: 'FLYER',
  eventDateTime: '2026-08-16T01:00:00.000Z',
  timeZone: 'America/Tijuana',
  capacity: 180,
  floorplanEnabled: true
} satisfies Event;

describe('Active Event workspace routing', () => {
  it.each([
    ['DRAFT', 'datos'],
    ['CONFIGURED', 'datos'],
    ['READY_TO_ACTIVATE', 'revision']
  ] satisfies [EventStatus, string][])('redirects %s before mounting the workspace', async (status, step) => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...configuredEvent, status });
    const { router } = renderApp(api, `/eventos/${configuredEvent.id}`);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/eventos/${configuredEvent.id}/configuracion/${step}`)
    );
    expect(screen.queryByRole('navigation', { name: 'Secciones del Evento' })).not.toBeInTheDocument();
  });

  it.each([
    ['ACTIVE', 'Activo', 'Este evento está operativo.'],
    ['EVENT_DAY', 'Día del evento', 'Hoy es el día del evento.'],
    ['CLOSED', 'Cerrado', 'Este evento está cerrado y disponible para consulta.'],
    ['ALBUM_PUBLISHED', 'Álbum publicado', 'El álbum de este evento está publicado.'],
    ['ARCHIVED', 'Archivado', 'Este evento está archivado y ya no admite cambios operativos.'],
    ['CANCELLED', 'Cancelado', 'Este evento fue cancelado.']
  ] satisfies [EventStatus, string, string][])('renders %s in the workspace as %s', async (status, label, message) => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...workspaceEvent, status });
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByRole('heading', { name: workspaceEvent.name!, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(status)).not.toBeInTheDocument();
  });
});

describe('Active Event workspace summary', () => {
  it('renders only authoritative facts with natural service, social type and Event time zone', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...workspaceEvent, socialType: 'QUINCEANERA' });
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByText('Flyer')).toBeInTheDocument();
    expect(screen.getByText('XV años')).toBeInTheDocument();
    expect(screen.getAllByText(/sábado,? 15 de agosto de 2026,? 6:00 p\.\s?m\./i).length).toBeGreaterThan(0);
    expect(screen.getByText('180 personas')).toBeInTheDocument();
    expect(screen.getByText('Con distribución de mesas')).toBeInTheDocument();
    expect(screen.queryByText('QUINCEANERA')).not.toBeInTheDocument();
    expect(screen.queryByText('America/Tijuana')).not.toBeInTheDocument();
    expect(screen.queryByText(workspaceEvent.id)).not.toBeInTheDocument();
    expect(screen.queryByText(workspaceEvent.clientId)).not.toBeInTheDocument();
    expect(screen.queryByText(workspaceEvent.createdByUserId)).not.toBeInTheDocument();
    expect(screen.queryByText('FLYER')).not.toBeInTheDocument();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('uses natural fallback copy when EventResponse has no contracted service', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...workspaceEvent, serviceId: null, serviceCode: null });
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByText('Servicio no disponible')).toBeInTheDocument();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('uses natural copy for optional capacity and disabled distribution', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...workspaceEvent, capacity: null, floorplanEnabled: false });
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByText('Capacidad pendiente')).toBeInTheDocument();
    expect(screen.getByText('Sin distribución de mesas')).toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('exposes one contextual h1, named local navigation and no future navigation items', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await screen.findByRole('heading', { name: workspaceEvent.name!, level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const localNavigation = screen.getByRole('navigation', { name: 'Secciones del Evento' });
    expect(within(localNavigation).getByRole('link', { name: 'Resumen', current: 'page' })).toBeInTheDocument();
    expect(within(localNavigation).queryByText('Mesas y distribución')).not.toBeInTheDocument();
    expect(within(localNavigation).queryByText('Staff')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const back = screen.getByRole('link', { name: 'Volver a eventos' });
    for (let index = 0; index < 12 && document.activeElement !== back; index += 1) await user.tab();
    expect(back).toHaveFocus();
  });

  it('links Dashboard actions to the canonical workspace route', async () => {
    const api = mockApiClient();
    renderApp(api, '/eventos');

    const links = await screen.findAllByRole('link', { name: 'Ver evento' });
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute('href') === `/eventos/${activeEvent.id}`)).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Resumen del Evento' })).not.toBeInTheDocument();
  });
});

describe('Active Event workspace loading and errors', () => {
  it('announces neutral loading and removes stale metadata immediately when eventId changes', async () => {
    const api = mockApiClient();
    const secondId = 'c4257e31-08a5-4284-a6e9-7973f39781a4';
    vi.mocked(api.events.get).mockImplementation((eventId) => {
      if (eventId === workspaceEvent.id) return Promise.resolve(workspaceEvent);
      return new Promise<Event>(() => undefined);
    });
    const { router } = renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByRole('heading', { name: workspaceEvent.name!, level: 1 })).toBeInTheDocument();
    await router.navigate(`/eventos/${secondId}`);
    expect(await screen.findByRole('status')).toHaveTextContent('Cargando evento…');
    expect(screen.queryByText(workspaceEvent.name!)).not.toBeInTheDocument();
    expect(api.events.get).toHaveBeenLastCalledWith(secondId, expect.any(AbortSignal));
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('retries only the failed Event request and keeps the session mounted for network errors', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(workspaceEvent);
    const user = userEvent.setup();
    const { router } = renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByText('No pudimos cargar este evento.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/eventos/${workspaceEvent.id}`);
    expect(api.services.listAvailable).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: workspaceEvent.name!, level: 1 })).toBeInTheDocument();
    expect(api.events.get).toHaveBeenCalledTimes(2);
    expect(api.services.listAvailable).not.toHaveBeenCalled();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('uses common session expiry for 401 and preserves the workspace return path', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    const { router } = renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.search).toContain(`returnTo=${encodeURIComponent(`/eventos/${workspaceEvent.id}`)}`);
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it.each([
    [403, 'FORBIDDEN', 'Acceso no permitido'],
    [404, 'EVENT_NOT_FOUND', 'Este evento no está disponible.']
  ])('renders a safe state for HTTP %s without exposing ownership', async (status, code, heading) => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockRejectedValue(new ApiError(status, code, 'technical message'));
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a eventos' })).toBeInTheDocument();
    expect(screen.queryByText('technical message')).not.toBeInTheDocument();
    expect(screen.queryByText(workspaceEvent.id)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('shows an operation reference only as secondary error information', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'technical message', 'operation-workspace-1')
    );
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    expect(await screen.findByText('Referencia: operation-workspace-1')).toBeInTheDocument();
    expect(screen.queryByText('technical message')).not.toBeInTheDocument();
  });
});
