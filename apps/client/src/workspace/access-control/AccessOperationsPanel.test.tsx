import {
  ApiError,
  type AnonymousAccessOperations,
  type Event,
  type NominalAccessOperations
} from '@invitaciones/api-client';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeEvent, mockApiClient, organizationPlanner } from '../../test/fixtures';
import { renderApp } from '../../test/render-app';
import { accessOperationsPollingInterval } from './AccessOperationsPanel';

const nominalEvent = {
  ...activeEvent,
  serviceCode: 'ACCESS_CONTROL',
  accessMode: 'NOMINAL',
  floorplanEnabled: true
} satisfies Event;
const anonymousEvent = { ...nominalEvent, accessMode: 'ANONYMOUS' } satisfies Event;
const user = { ...organizationPlanner, clientOperatingProfile: 'MANAGED' as const };
const nominal = {
  eventId: nominalEvent.id,
  accessMode: 'NOMINAL',
  eventStatus: 'ACTIVE',
  capacity: 10,
  issuedHistorical: 5,
  revokedHistorical: 2,
  activeRights: 3,
  entered: 1,
  pending: 2,
  availableCapacity: 7,
  asOf: '2026-10-23T18:00:00.000Z',
  detailPage: 1,
  detailPageSize: 150,
  detailTotal: 3,
  tables: [
    {
      tableId: 'table-a',
      tableName: 'Mesa Norte',
      capacity: 10,
      activeRights: 3,
      entered: 1,
      pending: 2,
      availableCapacity: 7
    }
  ],
  details: [
    {
      assistantId: 'assistant-a',
      name: 'Ana Ruiz',
      group: 'Familia Ruiz',
      table: { id: 'table-a', name: 'Mesa Norte' },
      seat: { id: 'seat-a', label: 'A1' },
      status: 'ENTERED',
      enteredAt: '2026-10-23T17:59:00.000Z'
    },
    {
      assistantId: 'assistant-b',
      name: 'Ana Ruiz',
      group: null,
      table: { id: 'table-a', name: 'Mesa Norte' },
      seat: { id: 'seat-b', label: 'A2' },
      status: 'PENDING',
      enteredAt: null
    },
    {
      assistantId: 'assistant-c',
      name: 'María Sol',
      group: null,
      table: { id: 'table-a', name: 'Mesa Norte' },
      seat: null,
      status: 'PENDING',
      enteredAt: null
    }
  ]
} satisfies NominalAccessOperations;
const anonymous = {
  ...nominal,
  accessMode: 'ANONYMOUS',
  issuedHistorical: 3,
  revokedHistorical: 1,
  activeRights: 2,
  entered: 1,
  pending: 1,
  availableCapacity: 8,
  tables: [{ ...nominal.tables[0]!, activeRights: 2, entered: 1, pending: 1, availableCapacity: 8 }],
  details: [
    { passNumber: 1, table: { id: 'table-a', name: 'Mesa Norte' }, status: 'UNUSED', usedAt: null },
    { passNumber: 2, table: { id: 'table-a', name: 'Mesa Norte' }, status: 'REVOKED', usedAt: null },
    { passNumber: 3, table: { id: 'table-a', name: 'Mesa Norte' }, status: 'USED', usedAt: '2026-10-23T17:59:00.000Z' }
  ]
} satisfies AnonymousAccessOperations;

afterEach(() => focusManager.setFocused(undefined));

function setup(event: Event = nominalEvent) {
  const api = mockApiClient(user);
  vi.mocked(api.events.get).mockResolvedValue(event);
  vi.mocked(api.events.getAccessOperations).mockResolvedValue(event.accessMode === 'NOMINAL' ? nominal : anonymous);
  return api;
}
function metric(label: string): HTMLElement {
  return within(screen.getByLabelText('Cifras del evento')).getByText(label).parentElement!.querySelector('dd')!;
}

describe('Client access operations', () => {
  it('uses contextual navigation and presents authoritative nominal totals, history and exact places', async () => {
    const api = setup();
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}`);
    await actor.click(await screen.findByRole('link', { name: 'Ingresos y aforo' }));
    expect(await screen.findByRole('table', { name: 'Ingresos nominales' })).toBeInTheDocument();
    expect(metric('Accesos vigentes')).toHaveTextContent('3');
    expect(metric('Ingresados')).toHaveTextContent('1');
    expect(metric('Pendientes')).toHaveTextContent('2');
    expect(metric('Capacidad disponible')).toHaveTextContent('7');
    expect(
      within(screen.getByLabelText('Capacidad e histórico')).getByText('Emitidos históricamente').parentElement
    ).toHaveTextContent('5');
    expect(screen.getByText('Mesa Norte · Lugar A1')).toBeInTheDocument();
    const tables = screen.getByRole('table', { name: 'Ocupación por mesa' });
    expect(within(tables).getByRole('row', { name: 'Mesa Norte 10 3 1 2 7' })).toBeInTheDocument();
    expect(api.events.getAccessOperations).toHaveBeenCalledWith(nominalEvent.id, expect.any(AbortSignal), 1);
    expect(api.contacts.list).not.toHaveBeenCalled();
    expect(api.invitations.list).not.toHaveBeenCalled();
    expect(api.physicalPasses.list).not.toHaveBeenCalled();
    expect(api.finance.balance).not.toHaveBeenCalled();
    expect(api.scanner.checkIn).not.toHaveBeenCalled();
  });

  it('filters a loaded nominal page by status and accent-insensitive search without changing global figures', async () => {
    const api = setup();
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    const table = await screen.findByRole('table', { name: 'Ingresos nominales' });
    expect(within(table).getAllByText('Ana Ruiz')).toHaveLength(2);
    await actor.type(screen.getByRole('textbox', { name: 'Buscar en esta página' }), 'Ána');
    expect(within(table).getAllByText('Ana Ruiz')).toHaveLength(2);
    expect(within(table).queryByText('María Sol')).not.toBeInTheDocument();
    await actor.click(screen.getByRole('combobox', { name: 'Estado en esta página' }));
    await actor.click(screen.getByRole('option', { name: 'Ingresado' }));
    expect(within(table).getAllByText('Ana Ruiz')).toHaveLength(1);
    expect(metric('Accesos vigentes')).toHaveTextContent('3');
    expect(metric('Pendientes')).toHaveTextContent('2');
    expect(api.events.getAccessOperations).toHaveBeenCalledOnce();
    expect(screen.getByText(/sólo a esta página/)).toBeInTheDocument();
  });

  it('presents anonymous historical folios, including revoked gaps, without nominal data or mutation controls', async () => {
    const api = setup(anonymousEvent);
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${anonymousEvent.id}?seccion=ingresos`);
    const table = await screen.findByRole('table', { name: 'Ingresos por folio' });
    expect(within(table).getByRole('row', { name: /2 Mesa Norte Revocado/ })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Nombre' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Revocar|Emitir|Descargar|Registrar ingreso/ })
    ).not.toBeInTheDocument();
    await actor.click(screen.getByRole('combobox', { name: 'Estado en esta página' }));
    await actor.click(screen.getByRole('option', { name: 'Revocado' }));
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(metric('Accesos vigentes')).toHaveTextContent('2');
    expect(metric('Ingresados')).toHaveTextContent('1');
    expect(api.contacts.list).not.toHaveBeenCalled();
    expect(api.invitations.list).not.toHaveBeenCalled();
  });

  it('refreshes the database snapshot manually and on focus without accumulating deltas', async () => {
    const api = setup();
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    await screen.findByLabelText('Cifras del evento');
    vi.mocked(api.events.getAccessOperations).mockResolvedValue({
      ...nominal,
      entered: 2,
      pending: 1,
      asOf: '2026-10-23T18:00:10.000Z'
    });
    await actor.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(metric('Ingresados')).toHaveTextContent('2'));
    vi.mocked(api.events.getAccessOperations).mockResolvedValue({
      ...nominal,
      entered: 3,
      pending: 0,
      asOf: '2026-10-23T18:00:20.000Z'
    });
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(metric('Ingresados')).toHaveTextContent('3'));
    expect(metric('Accesos vigentes')).toHaveTextContent('3');
    expect(document.querySelector('time[datetime="2026-10-23T18:00:20.000Z"]')).toBeInTheDocument();
  });

  it('marks a retained snapshot as stale on network failure and recovers without session side effects', async () => {
    const api = setup();
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    await screen.findByLabelText('Cifras del evento');
    vi.mocked(api.events.getAccessOperations).mockRejectedValueOnce(new TypeError('Network'));
    await actor.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText(/Datos desactualizados/)).toBeInTheDocument();
    expect(metric('Ingresados')).toHaveTextContent('1');
    expect(screen.getByText(/Última lectura confirmada/)).toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
    await actor.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(screen.queryByText(/Datos desactualizados/)).not.toBeInTheDocument());
  });

  it('hides retained nominal detail when access is no longer authorized', async () => {
    const api = setup();
    const actor = userEvent.setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    await screen.findByRole('table', { name: 'Ingresos nominales' });
    vi.mocked(api.events.getAccessOperations).mockRejectedValueOnce(new ApiError(404, 'EVENT_NOT_FOUND', 'Not found'));
    await actor.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText(/ya no tiene acceso/)).toBeInTheDocument();
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cifras del evento')).not.toBeInTheDocument();
  });

  it.each([
    [403, 'FORBIDDEN'],
    [409, 'ACCESS_OPERATIONS_INCONSISTENT'],
    [410, 'ACCESS_OPERATIONS_DETAIL_EXPIRED']
  ] as const)('does not resurrect protected detail after %s followed by a network error', async (status, code) => {
    const api = setup();
    const actor = userEvent.setup();
    vi.mocked(api.events.getAccessOperations)
      .mockResolvedValueOnce(nominal)
      .mockRejectedValueOnce(new ApiError(status, code, 'Unavailable'))
      .mockRejectedValueOnce(new TypeError('Network'))
      .mockResolvedValue(nominal);
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    await screen.findByLabelText('Cifras del evento');
    await actor.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(screen.queryByLabelText('Cifras del evento')).not.toBeInTheDocument());
    await actor.click(await screen.findByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(api.events.getAccessOperations).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cifras del evento')).not.toBeInTheDocument();
    expect(screen.queryByText(/Datos desactualizados/)).not.toBeInTheDocument();
    await actor.click(await screen.findByRole('button', { name: 'Actualizar' }));
    await screen.findByLabelText('Cifras del evento');
    expect(metric('Accesos vigentes')).toHaveTextContent('3');
  });

  it.each([
    [409, 'ACCESS_OPERATIONS_INCONSISTENT', /Hay una inconsistencia/],
    [410, 'ACCESS_OPERATIONS_DETAIL_EXPIRED', /plazo permitido/],
    [410, 'ACCESS_OPERATIONS_CONTENT_EXPIRED', /plazo permitido/]
  ] as const)(
    'hides prior details after %s %s without treating them as a stale network snapshot',
    async (status, code, message) => {
      const api = setup();
      const actor = userEvent.setup();
      renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
      await screen.findByRole('table', { name: 'Ingresos nominales' });
      vi.mocked(api.events.getAccessOperations).mockRejectedValueOnce(new ApiError(status, code, 'Private diagnostic'));
      await actor.click(screen.getByRole('button', { name: 'Actualizar' }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Cifras del evento')).not.toBeInTheDocument();
      expect(screen.queryByText(/Datos desactualizados/)).not.toBeInTheDocument();
    }
  );

  it('polls authoritative results and stops once the response says CLOSED even if the workspace was ACTIVE', async () => {
    const api = setup();
    const { queryClient } = renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    await screen.findByLabelText('Cifras del evento');
    focusManager.setFocused(true);
    vi.useFakeTimers();
    try {
      await act(async () => {
        await queryClient.invalidateQueries({ queryKey: ['access-operations', nominalEvent.id] });
        await vi.advanceTimersByTimeAsync(1);
      });
      const before = vi.mocked(api.events.getAccessOperations).mock.calls.length;
      vi.mocked(api.events.getAccessOperations).mockResolvedValue({
        ...nominal,
        eventStatus: 'CLOSED',
        entered: 2,
        pending: 1
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(api.events.getAccessOperations).toHaveBeenCalledTimes(before + 1);
      expect(metric('Ingresados')).toHaveTextContent('2');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(api.events.getAccessOperations).toHaveBeenCalledTimes(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('paginates revoked history through the endpoint and retains global totals', async () => {
    const api = setup(anonymousEvent);
    const actor = userEvent.setup();
    vi.mocked(api.events.getAccessOperations).mockImplementation(async (_id, _signal, page) => ({
      ...anonymous,
      issuedHistorical: 151,
      revokedHistorical: 149,
      detailPage: page ?? 1,
      detailTotal: 151,
      details: page === 2 ? [{ passNumber: 151, table: null, status: 'REVOKED', usedAt: null }] : anonymous.details
    }));
    renderApp(api, `/eventos/${anonymousEvent.id}?seccion=ingresos`);
    await screen.findByRole('table', { name: 'Ingresos por folio' });
    await actor.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Página 2 · 151 registros en total')).toBeInTheDocument();
    expect(metric('Accesos vigentes')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(api.events.getAccessOperations).toHaveBeenLastCalledWith(anonymousEvent.id, expect.any(AbortSignal), 2);
  });

  it('does not leak a late nominal response when navigating to another event and mode', async () => {
    const api = setup();
    const secondEvent = { ...anonymousEvent, id: 'other-event', name: 'Otro evento' };
    let resolveFirst!: (value: NominalAccessOperations) => void;
    vi.mocked(api.events.get).mockImplementation(async (id) => (id === nominalEvent.id ? nominalEvent : secondEvent));
    vi.mocked(api.events.getAccessOperations).mockImplementation((id) =>
      id === nominalEvent.id
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ ...anonymous, eventId: secondEvent.id })
    );
    const { router } = renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    await screen.findByText('Cargando ingresos y aforo…');
    const signal = vi.mocked(api.events.getAccessOperations).mock.calls[0]![1]!;
    await act(() => router.navigate(`/eventos/${secondEvent.id}?seccion=ingresos`));
    await screen.findByRole('table', { name: 'Ingresos por folio' });
    await act(async () => resolveFirst(nominal));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
    expect(metric('Accesos vigentes')).toHaveTextContent('2');
  });

  it('shows empty preparation and missing capacity without inventing zeros for capacity', async () => {
    const api = setup({ ...nominalEvent, floorplanEnabled: false, status: 'DRAFT' });
    vi.mocked(api.events.getAccessOperations).mockResolvedValue({
      ...nominal,
      eventStatus: 'DRAFT',
      capacity: null,
      availableCapacity: null,
      issuedHistorical: 0,
      revokedHistorical: 0,
      activeRights: 0,
      entered: 0,
      pending: 0,
      detailTotal: 0,
      details: [],
      tables: []
    });
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    expect(await screen.findByText('No hay registros de acceso para mostrar.')).toBeInTheDocument();
    expect(metric('Accesos vigentes')).toHaveTextContent('0');
    expect(metric('Capacidad disponible')).toHaveTextContent('Por definir');
    expect(screen.getByText('Este evento no utiliza croquis ni mesas.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Ocupación por mesa' })).not.toBeInTheDocument();
  });

  it('shows a safe inconsistency error instead of fabricated figures', async () => {
    const api = setup();
    vi.mocked(api.events.getAccessOperations).mockRejectedValue(
      new ApiError(409, 'ACCESS_OPERATIONS_INCONSISTENT', 'Private technical diagnostic')
    );
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    expect(await screen.findByText(/Hay una inconsistencia/)).toBeInTheDocument();
    expect(screen.queryByText('Private technical diagnostic')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cifras del evento')).not.toBeInTheDocument();
  });

  it('uses a readable mobile record list with labels and no duplicated desktop table', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false
    }));
    const api = setup();
    renderApp(api, `/eventos/${nominalEvent.id}?seccion=ingresos`);
    const list = await screen.findByRole('list', { name: 'Ingresos nominales' });
    expect(within(list).getAllByText('Ana Ruiz')).toHaveLength(2);
    expect(within(list).getByText('Mesa Norte · Lugar A1')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Ingresos nominales' })).not.toBeInTheDocument();
  });

  it.each(['ACTIVE', 'EVENT_DAY'])('polls %s authority every ten seconds', (status) =>
    expect(accessOperationsPollingInterval(status)).toBe(10_000)
  );
  it.each(['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE', 'CLOSED', 'CANCELLED', 'ARCHIVED', undefined])(
    'does not poll %s continuously',
    (status) => expect(accessOperationsPollingInterval(status)).toBe(false)
  );

  it.each(['FLYER', 'PHYSICAL_QR'] as const)(
    'preserves %s navigation without access-operations queries',
    async (serviceCode) => {
      const api = setup({ ...nominalEvent, serviceCode, accessMode: null, floorplanEnabled: false });
      renderApp(api, `/eventos/${nominalEvent.id}`);
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('link', { name: 'Ingresos y aforo' })).not.toBeInTheDocument();
      expect(api.events.getAccessOperations).not.toHaveBeenCalled();
    }
  );
});
