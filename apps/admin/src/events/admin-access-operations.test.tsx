import { ApiError, type AccessOperationalSummary, type AdminEvent } from '@invitaciones/api-client';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminEvent, mockAdminApi } from '../test/fixtures';
import { AdminAccessOperationsPanel } from './AdminAccessOperationsPanel';

const event: AdminEvent = {
  ...adminEvent,
  serviceCode: 'ACCESS_CONTROL',
  accessMode: 'NOMINAL',
  floorplanEnabled: true
};
const reading: AccessOperationalSummary = {
  eventId: event.id,
  accessMode: 'NOMINAL',
  eventStatus: 'ACTIVE',
  capacity: 10,
  issuedHistorical: 11,
  revokedHistorical: 3,
  activeRights: 8,
  entered: 3,
  pending: 5,
  availableCapacity: 2,
  asOf: '2026-10-23T18:12:34.000Z',
  tables: [
    {
      tableId: 'table-north',
      tableName: 'Mesa Norte',
      capacity: 6,
      activeRights: 6,
      entered: 3,
      pending: 3,
      availableCapacity: 0
    },
    {
      tableId: 'table-south',
      tableName: 'Mesa Sur',
      capacity: 4,
      activeRights: 2,
      entered: 0,
      pending: 2,
      availableCapacity: 2
    }
  ]
};
const clients: QueryClient[] = [];

function setup(api = mockAdminApi(), selectedEvent = event) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(queryClient);
  const panel = (next: AdminEvent) => (
    <QueryClientProvider client={queryClient}>
      <AdminAccessOperationsPanel apiClient={api} event={next} />
    </QueryClientProvider>
  );
  const view = render(panel(selectedEvent));
  return { ...view, api, queryClient, changeEvent: (next: AdminEvent) => view.rerender(panel(next)) };
}

function expectMetric(label: string, value: string) {
  const term = screen.getByText(label, { selector: 'dt' });
  expect(term.parentElement?.querySelector('dd')).toHaveTextContent(value);
}

describe('Admin access operations', () => {
  beforeEach(() => {
    configure({ asyncUtilTimeout: 5_000 });
    focusManager.setFocused(true);
  });
  afterEach(() => {
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    vi.useRealTimers();
    focusManager.setFocused(undefined);
    configure({ asyncUtilTimeout: 1_000 });
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'shows the authoritative %s summary and table aggregates without requesting Client resources',
    async (accessMode) => {
      const api = mockAdminApi();
      vi.mocked(api.adminEventPreparation.getAccessOperations).mockResolvedValue({ ...reading, accessMode });
      setup(api, { ...event, accessMode });
      expect(
        await screen.findByText(`Modalidad: ${accessMode === 'NOMINAL' ? 'Nominal' : 'Anónima'}`)
      ).toBeInTheDocument();
      expectMetric('Accesos vigentes', '8');
      expectMetric('Ingresados', '3');
      expectMetric('Pendientes', '5');
      expectMetric('Capacidad disponible', '2');
      expect(screen.getByText('Capacidad total: 10')).toBeInTheDocument();
      expect(screen.getByText('Emitidos históricos: 11')).toBeInTheDocument();
      expect(screen.getByText('Revocados históricos: 3')).toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Ocupación por Mesa' });
      const north = within(table).getByRole('rowheader', { name: 'Mesa Norte' }).closest('tr')!;
      expect(
        within(north)
          .getAllByRole('cell')
          .map((cell) => cell.textContent)
      ).toEqual(['6', '6', '3', '3', '0']);
      expect(screen.getByText(/Última lectura del servidor/).querySelector('time')).toHaveAttribute(
        'datetime',
        reading.asOf
      );
      expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledWith(
        event.clientId,
        event.id,
        expect.any(AbortSignal)
      );
      expect(api.events.getAccessOperations).not.toHaveBeenCalled();
      expect(api.contacts.list).not.toHaveBeenCalled();
      expect(api.nominalAccessCredentials.list).not.toHaveBeenCalled();
      expect(api.physicalPasses.list).not.toHaveBeenCalled();
      expect(api.adminEventPreparation.getAccessReadiness).not.toHaveBeenCalled();
      expect(api.adminReports.listEvent).not.toHaveBeenCalled();
      expect(api.adminFinance.balance).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /Scanner|Emitir|Revocar|Check.?in/i })).not.toBeInTheDocument();
    }
  );

  it('shows loading, safely reports failure, and retries as a read without clearing the session', async () => {
    const api = mockAdminApi();
    const request = deferred<AccessOperationalSummary>();
    vi.mocked(api.adminEventPreparation.getAccessOperations)
      .mockReturnValueOnce(request.promise)
      .mockResolvedValue(reading);
    setup(api);
    expect(screen.getByRole('status')).toHaveTextContent('Consultando ingresos y aforo');
    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled();
    await act(async () => request.reject(new TypeError('network')));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar ingresos y aforo');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('Emitidos históricos: 11')).toBeInTheDocument();
    expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(2);
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('preserves the prior snapshot with an explicit stale warning after a refresh fails', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.getAccessOperations)
      .mockResolvedValueOnce(reading)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValue({ ...reading, entered: 4, pending: 4, asOf: '2026-10-23T18:13:00.000Z' });
    setup(api);
    await screen.findByText('Emitidos históricos: 11');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Datos desactualizados');
    expectMetric('Ingresados', '3');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expectMetric('Ingresados', '4'));
    expect(screen.queryByText(/Datos desactualizados/)).not.toBeInTheDocument();
  });

  it('shows an empty preparation reading without inventing capacity or tables', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.getAccessOperations).mockResolvedValue({
      ...reading,
      eventStatus: 'DRAFT',
      capacity: null,
      issuedHistorical: 0,
      revokedHistorical: 0,
      activeRights: 0,
      entered: 0,
      pending: 0,
      availableCapacity: null,
      tables: []
    });
    setup(api, { ...event, status: 'DRAFT', floorplanEnabled: false });
    expect(await screen.findByText('Este Evento todavía no tiene accesos vigentes.')).toBeInTheDocument();
    expectMetric('Capacidad disponible', 'Sin definir');
    expect(screen.getByText('Capacidad total: Sin definir')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Evento sin Croquis: se muestran los totales del Evento.')).toBeInTheDocument();
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'EVENT_NOT_FOUND'],
    [409, 'ACCESS_OPERATIONS_INCONSISTENT'],
    [410, 'ACCESS_OPERATIONS_CONTENT_EXPIRED']
  ] as const)('hides prior aggregates and stops polling after authoritative error %s', async (status, code) => {
    vi.useFakeTimers();
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.getAccessOperations)
      .mockResolvedValueOnce(reading)
      .mockRejectedValue(new ApiError(status, code, 'unavailable'));
    setup(api);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expectMetric('Accesos vigentes', '8');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.queryByText('Accesos vigentes', { selector: 'dt' })).not.toBeInTheDocument();
    expect(screen.queryByText('Mesa Norte')).not.toBeInTheDocument();
    expect(screen.queryByText(/Última lectura del servidor/)).not.toBeInTheDocument();
    if (status === 409) expect(screen.getByRole('alert')).toHaveTextContent('No podemos mostrar cifras conciliadas');
    if (status === 410) expect(screen.getByRole('alert')).toHaveTextContent('política de conservación');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(2);
  });

  it.each([
    [403, 'FORBIDDEN'],
    [409, 'ACCESS_OPERATIONS_INCONSISTENT'],
    [410, 'ACCESS_OPERATIONS_CONTENT_EXPIRED']
  ] as const)(
    'does not resurrect hidden snapshot %s after 503 or remount, and releases it only after a new successful read',
    async (status, code) => {
      const api = mockAdminApi();
      const recovered = deferred<AccessOperationalSummary>();
      vi.mocked(api.adminEventPreparation.getAccessOperations)
        .mockResolvedValueOnce(reading)
        .mockRejectedValueOnce(new ApiError(status, code, 'unavailable'))
        .mockRejectedValueOnce(new ApiError(503, 'HTTP_503', 'unavailable'))
        .mockReturnValueOnce(recovered.promise);
      const view = setup(api);
      await screen.findByText('Emitidos históricos: 11');
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
      await waitFor(() => expect(screen.queryByText('Accesos vigentes', { selector: 'dt' })).not.toBeInTheDocument());
      fireEvent.click(await screen.findByRole('button', { name: 'Actualizar' }));
      await waitFor(() => expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(3));
      await screen.findByRole('button', { name: 'Actualizar' });
      expect(screen.queryByText('Accesos vigentes', { selector: 'dt' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Datos desactualizados/)).not.toBeInTheDocument();
      view.rerender(
        <QueryClientProvider client={view.queryClient}>
          <AdminAccessOperationsPanel key="remounted" apiClient={api} event={event} />
        </QueryClientProvider>
      );
      await waitFor(() => expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(4));
      expect(screen.queryByText('Accesos vigentes', { selector: 'dt' })).not.toBeInTheDocument();
      await act(async () => recovered.resolve(reading));
      await waitFor(() => expectMetric('Accesos vigentes', '8'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );

  it('aborts Event A on navigation and discards its late response while Event B loads', async () => {
    const api = mockAdminApi();
    const late = deferred<AccessOperationalSummary>();
    vi.mocked(api.adminEventPreparation.getAccessOperations)
      .mockReturnValueOnce(late.promise)
      .mockResolvedValue({
        ...reading,
        eventId: 'event-b',
        accessMode: 'ANONYMOUS',
        activeRights: 2,
        entered: 1,
        pending: 1,
        availableCapacity: 8,
        tables: []
      });
    const view = setup(api);
    const signal = vi.mocked(api.adminEventPreparation.getAccessOperations).mock.calls[0]?.[2];
    view.changeEvent({ ...event, id: 'event-b', accessMode: 'ANONYMOUS', floorplanEnabled: false });
    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText('Modalidad: Anónima')).toBeInTheDocument();
    await act(async () => late.resolve(reading));
    expectMetric('Accesos vigentes', '2');
    expect(screen.queryByText('Mesa Norte')).not.toBeInTheDocument();
  });

  it('keeps a changed modality in a separate query and rejects mismatched context', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.getAccessOperations)
      .mockResolvedValueOnce(reading)
      .mockResolvedValueOnce({ ...reading, accessMode: 'ANONYMOUS' })
      .mockResolvedValue({ ...reading, eventId: 'foreign-event' });
    const view = setup(api);
    await screen.findByText('Modalidad: Nominal');
    view.changeEvent({ ...event, accessMode: 'ANONYMOUS' });
    expect(await screen.findByText('Modalidad: Anónima')).toBeInTheDocument();
    expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(2);
    view.changeEvent({ ...event, id: 'event-c', accessMode: 'ANONYMOUS' });
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos consultar ingresos y aforo');
    expect(screen.queryByText('Mesa Norte')).not.toBeInTheDocument();
    expect(screen.queryByText('Modalidad: Anónima')).not.toBeInTheDocument();
  });

  it.each([
    'ACTIVE',
    'EVENT_DAY',
    'DRAFT',
    'CONFIGURED',
    'READY_TO_ACTIVATE',
    'CLOSED',
    'CANCELLED',
    'ARCHIVED'
  ] as const)('polls only operational Events, including %s', async (status) => {
    vi.useFakeTimers();
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.getAccessOperations).mockResolvedValue({ ...reading, eventStatus: status });
    setup(api, { ...event, status });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(
      status === 'ACTIVE' || status === 'EVENT_DAY' ? 2 : 1
    );
  });

  it('refreshes on focus and stops polling when the authoritative response closes the Event', async () => {
    vi.useFakeTimers();
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.getAccessOperations)
      .mockResolvedValueOnce(reading)
      .mockResolvedValue({ ...reading, eventStatus: 'CLOSED' });
    setup(api);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.adminEventPreparation.getAccessOperations).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
