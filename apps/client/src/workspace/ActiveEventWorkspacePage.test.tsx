import {
  ApiError,
  type Event,
  type EventStatus,
  type Floorplan,
  type SeatingWorkspacePage
} from '@invitaciones/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const floorplan = {
  id: 'c9bcb994-04fb-410e-bc1d-c87ff6dfab98',
  eventId: workspaceEvent.id,
  image: { fileAssetId: 'c6f89399-a5ac-42ba-91c5-392a8c9c7927', contentPath: '/floorplan' },
  locked: true,
  lockedAt: '2026-08-09T18:00:00.000Z',
  shapes: [
    {
      id: 'bc23b224-03c9-4e42-a43d-ce4be5cc031d',
      kind: 'TABLE',
      geometry: 'CIRCLE',
      name: '12',
      capacity: 10,
      occupancy: 7,
      availableCapacity: 3,
      x: 0.2,
      y: 0.2,
      width: 0.15,
      height: 0.15,
      rotation: 0,
      polygonPoints: null
    },
    {
      id: '4dffdf39-3e79-4612-9a02-d37ed876c85f',
      kind: 'TABLE',
      geometry: 'RECTANGLE',
      name: '20',
      capacity: 8,
      occupancy: 2,
      availableCapacity: 6,
      x: 0.55,
      y: 0.2,
      width: 0.18,
      height: 0.14,
      rotation: 0,
      polygonPoints: null
    }
  ],
  createdAt: '2026-08-09T18:00:00.000Z',
  updatedAt: '2026-08-09T18:00:00.000Z'
} satisfies Floorplan;

const seatingItem = {
  assistantId: '1bce73ae-71ee-48cd-9af8-6e34c0037f9a',
  name: 'Ana María',
  invitation: {
    id: '0b34cf44-df22-42a6-adfc-b8105223b4a1',
    eligibleAssistantCount: 3,
    assignedAssistantCount: 1
  },
  group: {
    id: 'b77037d7-c73b-44ca-875e-8229f90cb7c5',
    name: 'Familia Ruiz',
    eligibleAssistantCount: 5,
    assignedAssistantCount: 2
  },
  table: null,
  checkedIn: false
} satisfies SeatingWorkspacePage['items'][number];

const unassignedPage = {
  items: [seatingItem],
  summary: { unassignedCount: 1, selectedTable: null },
  nextCursor: null
} satisfies SeatingWorkspacePage;

const tablePage = {
  items: [{ ...seatingItem, table: { id: floorplan.shapes[0]!.id, name: floorplan.shapes[0]!.name } }],
  summary: {
    unassignedCount: 0,
    selectedTable: { id: floorplan.shapes[0]!.id, name: floorplan.shapes[0]!.name, occupancy: 7, capacity: 10 }
  },
  nextCursor: null
} satisfies SeatingWorkspacePage;

const mutationResult = {
  changes: [{ assistantId: seatingItem.assistantId, fromTableId: null, toTableId: floorplan.shapes[0]!.id }],
  affectedTables: [{ tableId: floorplan.shapes[0]!.id, occupancy: 8, capacity: 10 }]
};

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:floorplan');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

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

  it('exposes one contextual h1 and only functional local navigation items', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await screen.findByRole('heading', { name: workspaceEvent.name!, level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const localNavigation = screen.getByRole('navigation', { name: 'Secciones del Evento' });
    expect(within(localNavigation).getByRole('link', { name: 'Resumen', current: 'page' })).toBeInTheDocument();
    expect(within(localNavigation).getByRole('link', { name: 'Mesas y distribución' })).toBeInTheDocument();
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

describe('Active Event seating workspace', () => {
  it('does not expose or request Floorplan when floorplanEnabled is false', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...workspaceEvent, floorplanEnabled: false });
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    const navigation = await screen.findByRole('navigation', { name: 'Secciones del Evento' });
    expect(within(navigation).queryByText('Mesas y distribución')).not.toBeInTheDocument();
    expect(api.floorplan.get).not.toHaveBeenCalled();
  });

  it('opens the production Croquis read-only and nominal panel for Flyer', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.floorplan.seating).mockResolvedValue({
      items: [],
      summary: { unassignedCount: 0, selectedTable: null },
      nextCursor: null
    });
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    expect(await screen.findByRole('heading', { name: 'Mesas y distribución' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    expect(await screen.findByRole('heading', { name: '12', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sin mesa/ })).toBeInTheDocument();
    expect(api.floorplan.seating).toHaveBeenCalled();
    expect(api.floorplan.updateShape).not.toHaveBeenCalled();
  });

  it('shows Physical QR occupancy without requesting nominal seating', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue({ ...workspaceEvent, serviceCode: 'PHYSICAL_QR' });
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    expect(await screen.findByText('7 / 10 lugares')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Sin mesa/ })).not.toBeInTheDocument();
    expect(api.floorplan.seating).not.toHaveBeenCalled();
  });

  it('assigns a bounded selection with one stable idempotency key and no layout mutation', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.floorplan.seating).mockResolvedValue(unassignedPage);
    vi.mocked(api.floorplan.assign).mockResolvedValue(mutationResult);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana María' }));
    await user.click(screen.getByRole('button', { name: 'Asignar 1 a 12' }));

    await waitFor(() => expect(api.floorplan.assign).toHaveBeenCalledOnce());
    expect(api.floorplan.assign).toHaveBeenCalledWith(
      workspaceEvent.id,
      { assistantIds: [seatingItem.assistantId], tableShapeId: floorplan.shapes[0]!.id },
      expect.stringMatching(/^[0-9a-f-]{36}$/u),
      expect.any(AbortSignal)
    );
    expect(api.floorplan.updateShape).not.toHaveBeenCalled();
  });

  it('retries an uncertain assignment with the same idempotency key', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.floorplan.seating).mockResolvedValue(unassignedPage);
    vi.mocked(api.floorplan.assign)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(mutationResult);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana María' }));
    await user.click(screen.getByRole('button', { name: 'Asignar 1 a 12' }));
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(api.floorplan.assign).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.floorplan.assign).mock.calls[0]?.[2]).toBe(vi.mocked(api.floorplan.assign).mock.calls[1]?.[2]);
  });

  it('shows aggregate family/group impact before mutation and blocks over-capacity groups', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.floorplan.seating).mockResolvedValue(unassignedPage);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    await user.click(await screen.findByRole('button', { name: 'Invitación completa' }));
    expect(await screen.findByText(/Asignar a las 3 personas/)).toBeInTheDocument();
    expect(screen.getByText(/1 ya tienen Mesa/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: 'Grupo completo' }));
    expect(await screen.findByText(/Asignar a las 5 personas de Familia Ruiz/)).toBeInTheDocument();
    expect(screen.getByText(/supera los 3 lugares disponibles/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar asignación' })).toBeDisabled();
    expect(api.floorplan.assignFamily).not.toHaveBeenCalled();
    expect(api.floorplan.assignGroup).not.toHaveBeenCalled();
  });

  it.each([
    ['Invitación completa', 'Mesa 12 · 10', 'assignFamily'],
    ['Grupo completo', 'Mesa 20 · 8', 'assignGroup']
  ] as const)('executes %s only after explicit confirmation', async (action, tableButton, method) => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.floorplan.seating).mockResolvedValue(unassignedPage);
    vi.mocked(api.floorplan[method]).mockResolvedValue(mutationResult);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: tableButton }));
    await user.click(await screen.findByRole('button', { name: action }));
    expect(api.floorplan[method]).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar asignación' }));
    await waitFor(() => expect(api.floorplan[method]).toHaveBeenCalledOnce());
    expect(vi.mocked(api.floorplan[method]).mock.calls[0]?.[2]).toEqual(expect.any(String));
  });

  it('reconciles a 409 and leaves terminal Events read-only', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.floorplan.seating).mockResolvedValue(unassignedPage);
    vi.mocked(api.floorplan.assign).mockRejectedValue(new ApiError(409, 'SEATING_CAPACITY_EXCEEDED', 'full'));
    const user = userEvent.setup();
    const { unmount } = renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana María' }));
    await user.click(screen.getByRole('button', { name: 'Asignar 1 a 12' }));
    expect(await screen.findByText(/La disponibilidad cambió/)).toBeInTheDocument();
    expect(api.floorplan.get).toHaveBeenCalledTimes(2);

    unmount();
    const closedApi = mockApiClient();
    vi.mocked(closedApi.events.get).mockResolvedValue({ ...workspaceEvent, status: 'CLOSED' });
    vi.mocked(closedApi.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(closedApi.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(closedApi.floorplan.seating).mockResolvedValue(unassignedPage);
    renderApp(closedApi, `/eventos/${workspaceEvent.id}?seccion=mesas`);
    expect(await screen.findByText(/modo de consulta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Asignar/ })).not.toBeInTheDocument();
  });

  it('sends debounced search and Group filters while keeping the page bounded to 50', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.contacts.groups).mockResolvedValue([
      {
        id: seatingItem.group!.id,
        eventId: workspaceEvent.id,
        name: seatingItem.group!.name,
        createdAt: '2026-08-09T18:00:00.000Z',
        updatedAt: '2026-08-09T18:00:00.000Z'
      }
    ]);
    vi.mocked(api.floorplan.seating).mockResolvedValue(unassignedPage);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    await user.type(await screen.findByRole('textbox', { name: 'Buscar Asistente' }), '  María  ');
    await waitFor(() =>
      expect(api.floorplan.seating).toHaveBeenCalledWith(
        workspaceEvent.id,
        expect.objectContaining({ search: 'María', limit: 50 }),
        expect.any(AbortSignal)
      )
    );
    await user.click(screen.getByRole('combobox', { name: 'Grupo' }));
    await user.click(await screen.findByRole('option', { name: 'Familia Ruiz' }));
    await waitFor(() =>
      expect(api.floorplan.seating).toHaveBeenCalledWith(
        workspaceEvent.id,
        expect.objectContaining({ groupId: seatingItem.group!.id, limit: 50 }),
        expect.any(AbortSignal)
      )
    );
  });

  it('uses PATCH for changing or unassigning one Assistant and exposes both table scopes', async () => {
    const api = mockApiClient();
    vi.mocked(api.events.get).mockResolvedValue(workspaceEvent);
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.floorplan.seating).mockImplementation((_eventId, query) =>
      Promise.resolve(query.scope === 'TABLE' ? tablePage : unassignedPage)
    );
    vi.mocked(api.floorplan.updateSeating).mockResolvedValue(mutationResult);
    const user = userEvent.setup();
    renderApp(api, `/eventos/${workspaceEvent.id}`);

    await user.click(await screen.findByRole('link', { name: 'Mesas y distribución' }));
    await user.click(await screen.findByRole('button', { name: 'Mesa 12 · 10' }));
    await user.click(await screen.findByRole('tab', { name: 'En esta mesa' }));
    expect(await screen.findByRole('list', { name: 'Asistentes en 12' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana María' }));
    await user.click(screen.getByRole('button', { name: 'Cambiar mesa de 1' }));
    await user.click(await screen.findByRole('button', { name: /20.*2\/8.*6 disponibles/ }));
    await waitFor(() => expect(api.floorplan.updateSeating).toHaveBeenCalledOnce());
    expect(api.floorplan.updateSeating).toHaveBeenLastCalledWith(
      workspaceEvent.id,
      seatingItem.assistantId,
      { tableShapeId: floorplan.shapes[1]!.id },
      expect.any(String),
      expect.any(AbortSignal)
    );

    await user.click(await screen.findByRole('button', { name: 'Quitar Mesa' }));
    await waitFor(() => expect(api.floorplan.updateSeating).toHaveBeenCalledTimes(2));
    expect(api.floorplan.updateSeating).toHaveBeenLastCalledWith(
      workspaceEvent.id,
      seatingItem.assistantId,
      { tableShapeId: null },
      expect.any(String),
      expect.any(AbortSignal)
    );
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
