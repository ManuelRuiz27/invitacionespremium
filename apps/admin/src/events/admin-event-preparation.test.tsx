import {
  ApiError,
  type AdminEvent,
  type AdminFloorplan,
  type AdminFloorplanSeat,
  type AdminFloorplanShape,
  type AdminFloorplanSvgSource,
  type AdminPrice
} from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminEvent, deletedEvent, mockAdminApi, organization } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const floorplanHarness = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock('@invitaciones/floorplan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@invitaciones/floorplan')>();
  return {
    ...actual,
    FloorplanSurface: (props: {
      floorplan: AdminFloorplan;
      onSelect: (shape: AdminFloorplanShape) => void;
      onSeatSelect?: (seatId: string, options: { additive: boolean }) => void;
      onSeatMove?: (seatId: string, point: { x: number; y: number }) => void;
      dock?: ReactNode;
    }) => {
      floorplanHarness.props = props as unknown as Record<string, unknown>;
      return (
        <div data-testid="admin-floorplan-surface">
          {props.floorplan.shapes.map((shape) => (
            <button key={shape.id} onClick={() => props.onSelect(shape)}>
              {shape.name}
            </button>
          ))}
          {props.floorplan.seats.map((seat) => (
            <button key={seat.id} onClick={() => props.onSeatSelect?.(seat.id, { additive: false })}>
              {seat.label}
            </button>
          ))}
          {props.dock}
        </div>
      );
    },
    FloorplanInventory: ({ onCreate }: { onCreate: (value: unknown[]) => void }) => (
      <button onClick={() => onCreate([{ geometry: 'CIRCLE', quantity: 2, capacity: 8, namePrefix: 'Mesa' }])}>
        Preparar dos mesas
      </button>
    ),
    FloorplanTray: () => <div>Mesas pendientes</div>
  };
});

describe('Admin Event preparation surfaces', () => {
  it.each(['TABLE', 'SEAT'] as const)(
    'maps a selected table in %s mode, reloads and unlinks without deleting domain records',
    async (seatingMode) => {
      const initial = floorplan({
        seatingMode,
        image: { fileAssetId: 'svg-asset', contentPath: '/private', sourceType: 'SVG' }
      });
      const mapped = shape({ sourceElementId: 'private-circle', capacity: seatingMode === 'SEAT' ? 0 : 8 });
      const api = preparedFloorplanApi(initial);
      vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue({
        fileAssetId: 'svg-asset',
        aspectRatio: 1,
        viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
        selectableElements: [
          {
            sourceElementId: 'private-circle',
            elementType: 'circle',
            bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }
          }
        ]
      });
      vi.mocked(api.adminEventPreparation.mapFloorplanSvgElement).mockImplementation(async () => {
        vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue({ ...initial, shapes: [mapped] });
        return mapped;
      });
      vi.mocked(api.adminEventPreparation.unlinkFloorplanSvgMapping).mockImplementation(async () => {
        const unlinked = { ...mapped, sourceElementId: null };
        vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue({ ...initial, shapes: [unlinked] });
        return unlinked;
      });
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      // The first direct builder navigation also loads the lazy preparation route.
      await screen.findByTestId('admin-floorplan-surface', {}, { timeout: 10_000 });
      await waitFor(() => expect(floorplanHarness.props?.svgSource).toBeDefined());
      await userEvent.click(screen.getByRole('button', { name: 'Mapeo SVG' }));
      act(() => (floorplanHarness.props!.onSourceSelect as (id: string) => void)('private-circle'));
      expect(await screen.findByRole('heading', { name: 'Clasificar Mesa' })).toBeInTheDocument();
      expect(screen.getByText('Nuevo elemento del plano')).toBeInTheDocument();
      expect(screen.getByText('Guarda o cancela antes de seleccionar otro elemento.')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Mesa Principal' } });
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() =>
        expect(api.adminEventPreparation.mapFloorplanSvgElement).toHaveBeenCalledWith(
          adminEvent.clientId,
          adminEvent.id,
          {
            sourceElementId: 'private-circle',
            kind: 'TABLE',
            name: 'Mesa Principal',
            capacity: seatingMode === 'TABLE' ? 8 : 0
          }
        )
      );
      await userEvent.click(await screen.findByRole('button', { name: 'Mesa Principal' }));
      expect(screen.queryByLabelText('Forma')).not.toBeInTheDocument();
      expect(floorplanHarness.props?.draft).toBeUndefined();
      expect(screen.queryByText('private-circle')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Editar Mesa Principal' })).toBeInTheDocument();
      expect(screen.getByText('Elemento vinculado al plano')).toBeInTheDocument();
      expect(screen.queryByText('Mesa seleccionada')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Más opciones' }));
      await userEvent.click(screen.getByRole('button', { name: 'Desvincular del plano' }));
      await waitFor(() =>
        expect(api.adminEventPreparation.unlinkFloorplanSvgMapping).toHaveBeenCalledWith(
          adminEvent.clientId,
          adminEvent.id,
          mapped.id
        )
      );
      expect(api.adminEventPreparation.removeFloorplanShape).not.toHaveBeenCalled();
      expect(api.adminEventPreparation.removeFloorplanSeat).not.toHaveBeenCalled();
      await waitFor(() =>
        expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes[0]?.sourceElementId).toBeNull()
      );
    }
  );
  it('maps an irregular decorative zone using the chosen suggested name and zero capacity', async () => {
    const initial = floorplan({ image: { fileAssetId: 'svg-asset', contentPath: '/private', sourceType: 'SVG' } });
    const api = preparedFloorplanApi(initial);
    vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue({
      fileAssetId: 'svg-asset',
      aspectRatio: 1,
      viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
      selectableElements: [
        { sourceElementId: 'private-path', elementType: 'path', bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }
      ]
    });
    vi.mocked(api.adminEventPreparation.mapFloorplanSvgElement).mockImplementation(async (_client, _event, input) => {
      const mapped = shape({ ...input, geometry: 'RECTANGLE' });
      vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue({ ...initial, shapes: [mapped] });
      return mapped;
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await waitFor(() => expect(floorplanHarness.props?.svgSource).toBeDefined());
    await userEvent.click(screen.getByRole('button', { name: 'Mapeo SVG' }));
    act(() => (floorplanHarness.props!.onSourceSelect as (id: string) => void)('private-path'));
    await userEvent.click(screen.getByRole('combobox', { name: 'Tipo de elemento' }));
    for (const name of ['Mesa', 'Pista', 'DJ / escenario', 'Baños', 'Barra', 'Entrada', 'Zona']) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('option', { name: 'DJ / escenario' }));
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('DJ / escenario');
    expect(screen.queryByLabelText(/Número de lugares/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Escenario principal' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.mapFloorplanSvgElement).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        {
          sourceElementId: 'private-path',
          kind: 'DECORATIVE_ZONE',
          name: 'Escenario principal',
          capacity: 0
        }
      )
    );
    expect(await screen.findByRole('button', { name: 'Escenario principal' })).toBeInTheDocument();
  });
  beforeEach(() => {
    floorplanHarness.props = undefined;
    setAdminViewportWidth(1440);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:admin-floorplan')
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it.each(['RASTER', 'SVG'] as const)(
    'CALCA05 reads authoritative TABLE capacities and returns with selection intact for %s',
    async (sourceType) => {
      const original = floorplan({
        image: { fileAssetId: 'review-source', contentPath: '/private', sourceType },
        shapes: [shape({ capacity: 7 }), shape({ id: 'zone', name: 'Pista', kind: 'DECORATIVE_ZONE', capacity: 0 })]
      });
      const latest = {
        ...original,
        shapes: [shape({ capacity: 23 }), shape({ id: 'table-b', name: 'Mesa B', capacity: 11 }), original.shapes[1]!]
      };
      const api = preparedFloorplanApi(original);
      vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(original).mockResolvedValue(latest);
      vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue(svgSource('review-source'));
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      await userEvent.click(await screen.findByRole('button', { name: 'Calcar distribución' }, { timeout: 10_000 }));
      await userEvent.click(screen.getByRole('button', { name: 'Mesa Principal' }));
      await userEvent.click(screen.getByRole('button', { name: 'Revisar distribución' }));
      const review = await screen.findByRole('region', { name: 'Revisión de distribución' });
      expect(within(review).getByText('2 mesas · 1 zona · 34 lugares de capacidad configurada')).toBeVisible();
      expect(within(review).getByText('Mesa Principal: 23 lugares configurados')).toBeVisible();
      expect(floorplanHarness.props?.readOnly).toBe(true);
      expect(floorplanHarness.props?.onSeatMove).toBeUndefined();
      expect(floorplanHarness.props?.onCanvasPlace).toBeUndefined();
      await userEvent.click(within(review).getByRole('button', { name: 'Volver a corregir' }));
      expect(floorplanHarness.props?.selectedId).toBe('table-a');
      expect(floorplanHarness.props?.readOnly).toBe(false);
      expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toEqual(latest.shapes);
      expect(api.adminEventPreparation.lockFloorplan).not.toHaveBeenCalled();
      expect(api.adminEventPreparation.setFloorplanSeatingMode).not.toHaveBeenCalled();
      expectNoSeatWrites(api);
    }
  );

  it('CALCA05 shows defined, blocked and authoritative assignable places without blocking an empty table', async () => {
    const fixture = traceFixture();
    fixture.state = {
      ...fixture.state,
      shapes: [
        shape({ capacity: 0 }),
        shape({ id: 'empty', name: 'Mesa vacía', capacity: 0 }),
        shape({ id: 'api-capacity', name: 'Mesa API', capacity: 5 })
      ],
      seats: [
        { ...serpentineSeats('table-a')[0]!, isBlocked: true },
        { ...serpentineSeats('api-capacity')[1]!, id: 'defined-free' }
      ]
    };
    vi.mocked(fixture.api.adminEventPreparation.lockFloorplan).mockImplementation(async () => {
      fixture.state = { ...fixture.state, locked: true, lockedAt: adminEvent.updatedAt };
      return fixture.state;
    });
    await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Revisar distribución' }));
    const review = await screen.findByRole('region', { name: 'Revisión de distribución' });
    expect(within(review).getByText('3 mesas · 0 zonas · 2 lugares definidos · 1 bloqueado')).toBeVisible();
    expect(within(review).getByText('Mesa API: 5 asignables · 1 definido · 0 bloqueados')).toBeVisible();
    expect(within(review).getByText('Sin lugares definidos')).toBeVisible();
    expect(within(review).getByText('Sin lugares asignables')).toBeVisible();
    const finalize = within(review).getByRole('button', { name: 'Finalizar distribución' });
    expect(finalize).toBeEnabled();
    fireEvent.click(finalize);
    fireEvent.click(finalize);
    await waitFor(() => expect(fixture.api.adminEventPreparation.lockFloorplan).toHaveBeenCalledOnce());
    await screen.findByText('Distribución finalizada. Vista de solo lectura.');
    expectNoSeatWrites(fixture.api);
  });

  it('CALCA05 serializes review reads and blocks review during drafts or active tracing', async () => {
    const fixture = traceFixture();
    await openTraceParent(fixture.api);
    fireEvent.change(screen.getByLabelText('Nombre o número'), { target: { value: 'Borrador' } });
    expect(screen.getByRole('button', { name: 'Revisar distribución' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mesa Principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    expect(screen.getByRole('button', { name: 'Revisar distribución' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Terminar mesa' }));
    let resolve!: (value: AdminFloorplan) => void;
    vi.mocked(fixture.api.adminEventPreparation.getFloorplan).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const button = screen.getByRole('button', { name: 'Revisar distribución' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fixture.api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Actualizando plano…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeDisabled();
    await act(async () => resolve(fixture.state));
    await screen.findByRole('region', { name: 'Revisión de distribución' });
    expectNoSeatWrites(fixture.api);
  });

  it('CALCA05 does not enter review or finalize when its authoritative read fails', async () => {
    const fixture = traceFixture();
    await openTraceParent(fixture.api);
    vi.mocked(fixture.api.adminEventPreparation.getFloorplan).mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Revisar distribución' }));
    await screen.findByRole('button', { name: 'Actualizar plano' });
    expect(screen.queryByRole('region', { name: 'Revisión de distribución' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar distribución' })).toBeDisabled();
    expect(fixture.api.adminEventPreparation.lockFloorplan).not.toHaveBeenCalled();
  });

  it.each(['RASTER', 'SVG'] as const)(
    'CALCA05 locks once despite failed refresh, reloads read-only, then unlocks %s',
    async (sourceType) => {
      const fixture = traceFixture();
      fixture.state = {
        ...fixture.state,
        image: { fileAssetId: 'review-lock-source', contentPath: '/private', sourceType },
        seats: serpentineSeats('table-a')
      };
      vi.mocked(fixture.api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue(
        svgSource('review-lock-source')
      );
      let resolve!: (value: AdminFloorplan) => void;
      vi.mocked(fixture.api.adminEventPreparation.lockFloorplan).mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      const view = await openTraceParent(fixture.api);
      await userEvent.click(screen.getByRole('button', { name: 'Revisar distribución' }));
      const review = await screen.findByRole('region', { name: 'Revisión de distribución' });
      vi.mocked(fixture.api.adminEventPreparation.getFloorplan).mockRejectedValueOnce(new Error('GET failed'));
      const finalize = within(review).getByRole('button', { name: 'Finalizar distribución' });
      fireEvent.click(finalize);
      fireEvent.click(finalize);
      expect(screen.getByText('Guardando...')).toBeInTheDocument();
      expect(fixture.api.adminEventPreparation.lockFloorplan).toHaveBeenCalledOnce();
      fixture.state = { ...fixture.state, locked: true, lockedAt: adminEvent.updatedAt };
      await act(async () => resolve(fixture.state));
      await screen.findByText('Guardado · falta actualizar. La acción no se repetirá.');
      expect(screen.getByRole('button', { name: 'Editar distribución' })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Editar distribución' })).toBeEnabled());
      expect(fixture.api.adminEventPreparation.lockFloorplan).toHaveBeenCalledOnce();
      view.unmount();
      renderAdminApp(fixture.api, `/eventos/${adminEvent.id}/preparar/croquis`);
      await screen.findByTestId('admin-floorplan-surface');
      expect(floorplanHarness.props?.readOnly).toBe(true);
      expect((floorplanHarness.props?.floorplan as AdminFloorplan).seats).toEqual(fixture.state.seats);
      vi.mocked(fixture.api.adminEventPreparation.unlockFloorplan).mockImplementation(async () => {
        fixture.state = { ...fixture.state, locked: false, lockedAt: null };
        return fixture.state;
      });
      await userEvent.click(screen.getByRole('button', { name: 'Editar distribución' }));
      await waitFor(() => expect(floorplanHarness.props?.readOnly).toBe(false));
      expect(screen.queryByRole('region', { name: 'Revisión de distribución' })).not.toBeInTheDocument();
      expect(fixture.api.adminEventPreparation.unlockFloorplan).toHaveBeenCalledOnce();
      expectNoSeatWrites(fixture.api);
    }
  );

  it.each([false, true])('CALCA05 stops an uncertain lock without replay; committed=%s', async (committed) => {
    const fixture = traceFixture();
    vi.mocked(fixture.api.adminEventPreparation.lockFloorplan).mockImplementation(async () => {
      if (committed) fixture.state = { ...fixture.state, locked: true, lockedAt: adminEvent.updatedAt };
      throw new Error('lost response');
    });
    await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Revisar distribución' }));
    const review = await screen.findByRole('region', { name: 'Revisión de distribución' });
    await userEvent.click(within(review).getByRole('button', { name: 'Finalizar distribución' }));
    await screen.findByRole('button', { name: 'Actualizar plano' });
    expect(within(review).getByRole('button', { name: 'Finalizar distribución' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    await waitFor(() => expect((floorplanHarness.props?.floorplan as AdminFloorplan).locked).toBe(committed));
    if (committed) {
      await screen.findByText('Distribución finalizada. Vista de solo lectura.');
      expect(screen.queryByText('No pudimos finalizar la distribución. Inténtalo nuevamente.')).not.toBeInTheDocument();
      expect(screen.getByText('Guardado', { exact: true })).toBeVisible();
    } else
      await waitFor(() => expect(within(review).getByRole('button', { name: 'Finalizar distribución' })).toBeEnabled());
    expect(fixture.api.adminEventPreparation.lockFloorplan).toHaveBeenCalledOnce();
  });

  it.each(['PHYSICAL_QR', 'ACCESS_CONTROL'] as const)(
    'CALCA05 review does not enable exact seating for restricted TABLE %s',
    async (serviceCode) => {
      const api = preparedFloorplanApi(floorplan({ shapes: [shape()] }));
      vi.mocked(api.adminEvents.get).mockResolvedValue({
        ...adminEvent,
        serviceCode,
        accessMode: serviceCode === 'ACCESS_CONTROL' ? 'ANONYMOUS' : null,
        floorplanEnabled: true
      });
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      await userEvent.click(await screen.findByRole('button', { name: 'Calcar distribución' }));
      await userEvent.click(screen.getByRole('button', { name: 'Revisar distribución' }));
      await screen.findByRole('region', { name: 'Revisión de distribución' });
      expect(api.adminEventPreparation.setFloorplanSeatingMode).not.toHaveBeenCalled();
      expectNoSeatWrites(api);
    }
  );

  it.each([1440, 1024])(
    'CALCA04 selects, moves and batch-moves Trace Seats outside the parent bbox at %d',
    async (width) => {
      setAdminViewportWidth(width);
      const fixture = traceFixture();
      fixture.state = { ...fixture.state, seats: serpentineSeats('table-a') };
      vi.mocked(fixture.api.adminEventPreparation.batchFloorplanSeats).mockImplementation(
        async (_client, _event, input) => {
          const seats = input.seats.map((change) => ({
            ...fixture.state.seats.find((seat) => seat.id === change.seatId)!,
            x: change.x!,
            y: change.y!
          }));
          fixture.state = {
            ...fixture.state,
            seats: fixture.state.seats.map((seat) => seats.find((updated) => updated.id === seat.id) ?? seat)
          };
          return seats;
        }
      );
      await openTraceParent(fixture.api);
      act(() => selectTraceSeat('seat-s1'));
      expect(floorplanHarness.props?.selectedId).toBe('table-a');
      expect(floorplanHarness.props?.draft).toBeUndefined();
      expect(screen.getByRole('region', { name: 'Corrección de lugares' })).toBeVisible();
      expect(document.querySelector('.MuiModal-root')).toBeNull();
      await act(async () => moveTraceSeat('seat-s1', { x: 0.7, y: 0.6 }));
      await waitFor(() => expect(fixture.state.seats[0]?.x).toBeCloseTo(0.7));
      act(() => selectTraceSeat('seat-s2', true));
      const before = fixture.state.seats.slice(0, 2).map((seat) => ({ ...seat }));
      await act(async () => moveTraceSeat('seat-s2', { x: 0.4, y: 0.3 }));
      await waitFor(() => expect(fixture.api.adminEventPreparation.batchFloorplanSeats).toHaveBeenCalledTimes(2));
      expect(fixture.state.seats[0]!.x - fixture.state.seats[1]!.x).toBeCloseTo(before[0]!.x - before[1]!.x);
      expect(fixture.state.seats[0]!.y - fixture.state.seats[1]!.y).toBeCloseTo(before[0]!.y - before[1]!.y);
      expect(fixture.state.seats[0]!.floorplanShapeId).toBe('table-a');
      expect(fixture.api.adminEventPreparation.createFloorplanSeat).not.toHaveBeenCalled();
      expect(fixture.api.adminEventPreparation.removeFloorplanSeat).not.toHaveBeenCalled();
      expect(screen.getByText(/Acciones sólo al principal/)).toBeInTheDocument();
    }
  );

  it('CALCA04 renames inline and renumbers while retaining UUID, parent and occupancy', async () => {
    const fixture = traceFixture();
    fixture.state = {
      ...fixture.state,
      seats: serpentineSeats('table-a').map((seat, i) => ({ ...seat, occupied: i === 0 }))
    };
    vi.mocked(fixture.api.adminEventPreparation.updateFloorplanSeat).mockImplementation(
      async (_client, _event, id, input) => {
        const updated = { ...fixture.state.seats.find((seat) => seat.id === id)!, ...input };
        fixture.state = {
          ...fixture.state,
          seats: fixture.state.seats.map((seat) => (seat.id === id ? updated : seat))
        };
        return updated;
      }
    );
    vi.mocked(fixture.api.adminEventPreparation.renumberFloorplanSeats).mockImplementation(async () => {
      const seats = fixture.state.seats.map((seat, i) => ({ ...seat, label: `${i + 1}` }));
      fixture.state = { ...fixture.state, seats };
      return seats;
    });
    await openTraceParent(fixture.api);
    act(() => selectTraceSeat('seat-s1'));
    expect(screen.getByRole('button', { name: 'Bloquear' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar lugar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar lugar' }));
    expect(fixture.api.adminEventPreparation.updateFloorplanSeat).not.toHaveBeenCalled();
    expect(fixture.api.adminEventPreparation.removeFloorplanSeat).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre del lugar'), { target: { value: 'Cabecera preferente' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    await waitFor(() => expect(fixture.state.seats[0]?.label).toBe('Cabecera preferente'));
    const identity = fixture.state.seats.map(({ id, floorplanShapeId, occupied }) => ({
      id,
      floorplanShapeId,
      occupied
    }));
    await userEvent.click(screen.getByRole('button', { name: 'Renumerar lugares' }));
    await waitFor(() => expect(fixture.api.adminEventPreparation.renumberFloorplanSeats).toHaveBeenCalledOnce());
    expect(
      fixture.state.seats.map(({ id, floorplanShapeId, occupied }) => ({ id, floorplanShapeId, occupied }))
    ).toEqual(identity);
    expect(fixture.api.adminEventPreparation.removeFloorplanSeat).not.toHaveBeenCalled();
  });

  it('CALCA04 duplicates with a normalized unique label and blocks, unblocks and deletes only the primary', async () => {
    const fixture = traceFixture();
    fixture.state = {
      ...fixture.state,
      seats: [
        ...serpentineSeats('table-a'),
        { ...serpentineSeats('table-a')[0]!, id: 'collision', label: ' asiento   a 2 ' }
      ]
    };
    vi.mocked(fixture.api.adminEventPreparation.updateFloorplanSeat).mockImplementation(async (_c, _e, id, input) => {
      const updated = { ...fixture.state.seats.find((seat) => seat.id === id)!, ...input };
      fixture.state = { ...fixture.state, seats: fixture.state.seats.map((seat) => (seat.id === id ? updated : seat)) };
      return updated;
    });
    vi.mocked(fixture.api.adminEventPreparation.removeFloorplanSeat).mockImplementation(async (_c, _e, id) => {
      fixture.state = { ...fixture.state, seats: fixture.state.seats.filter((seat) => seat.id !== id) };
    });
    await openTraceParent(fixture.api);
    act(() => selectTraceSeat('seat-s1'));
    await userEvent.click(screen.getByRole('button', { name: 'Duplicar lugar' }));
    await waitFor(() => expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce());
    expect(fixture.state.seats.at(-1)?.label).toBe('Asiento A 3');
    await userEvent.click(await screen.findByRole('button', { name: 'Bloquear' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(fixture.api.adminEventPreparation.updateFloorplanSeat).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar lugar' }));
    await waitFor(() => expect(fixture.api.adminEventPreparation.removeFloorplanSeat).toHaveBeenCalledOnce());
    expect(fixture.state.seats).toHaveLength(4);
    expect(floorplanHarness.props?.selectedId).toBe('table-a');
  });

  it('CALCA04 active tracing ignores stale selection/movement, and Manual adds a free label after gaps', async () => {
    const fixture = traceFixture();
    fixture.state = {
      ...fixture.state,
      seats: serpentineSeats('table-a')
        .slice(0, 2)
        .map((seat, i) => ({ ...seat, label: `Lugar ${i === 0 ? 1 : 3}` }))
    };
    await openTraceParent(fixture.api);
    act(() => selectTraceSeat('seat-s1'));
    const staleMove = floorplanHarness.props?.onSeatMove as (id: string, point: { x: number; y: number }) => void;
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    act(() => {
      selectTraceSeat('seat-s2');
      staleMove('seat-s1', { x: 0.8, y: 0.8 });
    });
    expect(floorplanHarness.props?.selectedSeatId).toBeUndefined();
    expect(floorplanHarness.props?.onSeatMove).toBeUndefined();
    expect(fixture.api.adminEventPreparation.batchFloorplanSeats).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Terminar mesa' }));
    await chooseManual();
    await userEvent.click(screen.getByRole('button', { name: 'Mesa Principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar lugar' }));
    act(() => canvasPlace()({ x: 0.5, y: 0.6 }));
    await waitFor(() => expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce());
    expect(fixture.state.seats.at(-1)?.label).toBe('Lugar 2');
  });

  it('CALCA04 keeps correction context on a concurrent move rejection and adopts occupied authority without replay', async () => {
    const fixture = traceFixture();
    fixture.state = { ...fixture.state, seats: serpentineSeats('table-a') };
    vi.mocked(fixture.api.adminEventPreparation.batchFloorplanSeats).mockImplementation(async () => {
      fixture.state = {
        ...fixture.state,
        seats: fixture.state.seats.map((seat) => ({ ...seat, occupied: seat.id === 'seat-s1' }))
      };
      throw new ApiError(409, 'FLOORPLAN_CONCURRENCY_CONFLICT', 'concurrent occupancy');
    });
    await openTraceParent(fixture.api);
    act(() => selectTraceSeat('seat-s1'));
    await act(async () => moveTraceSeat('seat-s1', { x: 0.8, y: 0.8 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Bloquear' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Eliminar lugar' })).toBeDisabled();
    expect(floorplanHarness.props?.selectedSeatId).toBe('seat-s1');
    expect(floorplanHarness.props?.selectedId).toBe('table-a');
    expect(fixture.state.seats[0]!.x).toBe(0.2);
    expect(fixture.api.adminEventPreparation.batchFloorplanSeats).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(screen.getByLabelText('Nombre del lugar'), { target: { value: 'Borrador local' } });
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(true);
    expect(fixture.api.adminEventPreparation.updateFloorplanSeat).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar nombre' }));
  });

  it('CALCA04 follows the primary Seat parent and its SVG binding when additive selection changes', async () => {
    const fixture = traceFixture();
    const source = svgSource('trace-svg');
    source.selectableElements.push({
      sourceElementId: 'private-circle',
      elementType: 'circle',
      bbox: { x: 0.1, y: 0.1, width: 0.18, height: 0.18 }
    });
    const mapped = shape({
      id: 'mapped-parent',
      name: 'Mesa mapeada',
      sourceElementId: source.selectableElements[0]!.sourceElementId
    });
    fixture.state = {
      ...fixture.state,
      image: { fileAssetId: 'trace-svg', contentPath: '/private', sourceType: 'SVG' },
      shapes: [shape(), mapped],
      seats: [serpentineSeats('table-a')[0]!, { ...serpentineSeats(mapped.id)[1]!, id: 'mapped-seat' }]
    };
    vi.mocked(fixture.api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue(source);
    await openTraceParent(fixture.api);
    act(() => {
      selectTraceSeat('seat-s1');
      selectTraceSeat('mapped-seat', true);
    });
    expect(floorplanHarness.props?.selectedId).toBe(mapped.id);
    expect(floorplanHarness.props?.selectedSourceElementId).toBe(mapped.sourceElementId);
    act(() => selectTraceSeat('mapped-seat', true));
    expect(floorplanHarness.props?.selectedSeatId).toBe('seat-s1');
    expect(floorplanHarness.props?.selectedId).toBe('table-a');
    expect(floorplanHarness.props?.selectedSourceElementId).toBeUndefined();
    expectNoSeatWrites(fixture.api);
  });

  it('CALCA03 traces ten confirmed seats serially, ends with the parent selected and reloads stable identity', async () => {
    const fixture = traceFixture();
    const view = await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    for (let index = 0; index < 10; index++) {
      act(() => canvasPlace()({ x: 0.2 + index * 0.03, y: 0.3 }));
      await screen.findByText(`${index + 1} lugares confirmados`);
    }
    expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledTimes(10);
    expect(fixture.state.seats).toHaveLength(10);
    expect(fixture.state.seats.map((seat) => seat.label)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Lugar ${i + 1}`)
    );
    expect(new Set(fixture.state.seats.map((seat) => seat.floorplanShapeId))).toEqual(new Set(['table-a']));
    const identities = fixture.state.seats.map(({ id, label, floorplanShapeId }) => ({ id, label, floorplanShapeId }));
    const stalePlacement = canvasPlace();
    await userEvent.click(screen.getByRole('button', { name: 'Terminar mesa' }));
    expect(floorplanHarness.props?.selectedId).toBe('table-a');
    expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeEnabled();
    expect(floorplanHarness.props?.onCanvasPlace).toBeUndefined();
    act(() => stalePlacement({ x: 0.7, y: 0.7 }));
    expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledTimes(10);
    view.unmount();
    await openTraceParent(fixture.api);
    expect(
      (floorplanHarness.props?.floorplan as AdminFloorplan).seats.map(({ id, label, floorplanShapeId }) => ({
        id,
        label,
        floorplanShapeId
      }))
    ).toEqual(identities);
    expect(fixture.api.adminEventPreparation.removeFloorplanSeat).not.toHaveBeenCalled();
    expect(fixture.api.adminEventPreparation.renumberFloorplanSeats).not.toHaveBeenCalled();
  });

  it('CALCA03 finds free labels after rename/delete gaps and reload instead of using seat count', async () => {
    const fixture = traceFixture();
    fixture.state = {
      ...fixture.state,
      seats: [
        {
          id: 'seed-1',
          floorplanShapeId: 'table-a',
          label: 'Lugar 1',
          x: 0.1,
          y: 0.1,
          isBlocked: false,
          occupied: false
        },
        {
          id: 'seed-3',
          floorplanShapeId: 'table-a',
          label: 'lugar   3',
          x: 0.2,
          y: 0.1,
          isBlocked: false,
          occupied: false
        },
        {
          id: 'seed-vip',
          floorplanShapeId: 'table-a',
          label: 'Cabecera',
          x: 0.3,
          y: 0.1,
          isBlocked: false,
          occupied: false
        }
      ]
    };
    const view = await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    for (const count of [4, 5]) {
      act(() => canvasPlace()({ x: 0.5, y: 0.5 }));
      await screen.findByText(`${count} lugares confirmados`);
    }
    expect(fixture.state.seats.slice(3).map((seat) => seat.label)).toEqual(['Lugar 2', 'Lugar 4']);
    view.unmount();
    fixture.state = {
      ...fixture.state,
      seats: fixture.state.seats
        .filter((seat) => seat.id !== 'seed-1')
        .map((seat) => (seat.label === 'Lugar 2' ? { ...seat, label: 'Preferente' } : seat))
    };
    await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    act(() => canvasPlace()({ x: 0.6, y: 0.5 }));
    await screen.findByText('5 lugares confirmados');
    expect(fixture.state.seats.at(-1)?.label).toBe('Lugar 1');
    expect(new Set(fixture.state.seats.map((seat) => seat.label.trim().replace(/\s+/gu, ' ').toLowerCase())).size).toBe(
      5
    );
  });

  it('CALCA03 rejects additional gestures throughout POST and reconciliation and can finish during a write', async () => {
    const fixture = traceFixture();
    let resolvePost!: (value: AdminFloorplanSeat) => void;
    let resolveRead!: (value: AdminFloorplan) => void;
    vi.mocked(fixture.api.adminEventPreparation.createFloorplanSeat).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        })
    );
    await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    const place = canvasPlace();
    act(() => {
      place({ x: 0.3, y: 0.4 });
      place({ x: 0.3, y: 0.4 });
    });
    expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
    const saved: AdminFloorplanSeat = {
      id: 'confirmed-seat',
      floorplanShapeId: 'table-a',
      label: 'Lugar 1',
      x: 0.3,
      y: 0.4,
      isBlocked: false,
      occupied: false
    };
    const leavePending = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leavePending);
    expect(leavePending.defaultPrevented).toBe(true);
    fixture.state = { ...fixture.state, seats: [saved], shapes: [shape({ capacity: 1 })] };
    vi.mocked(fixture.api.adminEventPreparation.getFloorplan).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    await act(async () => {
      resolvePost(saved);
    });
    act(() => place({ x: 0.4, y: 0.4 }));
    expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Terminar mesa' }));
    await act(async () => {
      resolveRead(fixture.state);
    });
    expect(floorplanHarness.props?.selectedId).toBe('table-a');
    expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeEnabled();
    act(() => place({ x: 0.5, y: 0.4 }));
    expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
    expect(fixture.state.seats).toEqual([saved]);
  });

  it.each(['locked', 'missing', 'TABLE'] as const)(
    'CALCA03 adopts %s recovery without reactivating placement',
    async (condition) => {
      const fixture = traceFixture();
      await openTraceParent(fixture.api);
      await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
      const place = canvasPlace();
      fixture.state = {
        ...fixture.state,
        locked: condition === 'locked',
        shapes: condition === 'missing' ? [] : fixture.state.shapes,
        seatingMode: condition === 'TABLE' ? 'TABLE' : 'SEAT'
      };
      vi.mocked(fixture.api.adminEventPreparation.createFloorplanSeat).mockRejectedValue(
        new ApiError(409, 'FLOORPLAN_CONCURRENCY_CONFLICT', 'conflict')
      );
      act(() => place({ x: 0.3, y: 0.3 }));
      await screen.findByText(/Trazado detenido/);
      expect(screen.queryByRole('button', { name: 'Trazar lugares' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Terminar mesa' })).not.toBeInTheDocument();
      if (condition !== 'TABLE') expect(floorplanHarness.props?.selectedId).toBeUndefined();
      act(() => place({ x: 0.4, y: 0.3 }));
      expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
    }
  );

  it('CALCA03 rejects invalid points, drops and a dirty parent without Seat writes', async () => {
    const fixture = traceFixture();
    await openTraceParent(fixture.api);
    fireEvent.change(screen.getByLabelText('Nombre o número'), { target: { value: 'Cambio local' } });
    expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mesa Principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    act(() => {
      for (const point of [
        { x: NaN, y: 0.3 },
        { x: 0.3, y: Infinity },
        { x: -0.1, y: 0.3 },
        { x: 0.3, y: 1.1 }
      ])
        canvasPlace()(point);
      (floorplanHarness.props?.onCanvasPlace as (point: { x: number; y: number }, id: string) => void)(
        { x: 0.3, y: 0.3 },
        'dragged-table'
      );
    });
    expectNoSeatWrites(fixture.api);
  });

  it.each(['CLOSED', 'CANCELLED'] as const)(
    'CALCA03 does not expose tracing in terminal digital Event %s',
    async (status) => {
      const fixture = traceFixture();
      vi.mocked(fixture.api.adminEvents.get).mockResolvedValue({
        ...adminEvent,
        serviceCode: 'FLYER',
        floorplanEnabled: true,
        status
      });
      renderAdminApp(fixture.api, `/eventos/${adminEvent.id}/preparar/croquis`);
      await userEvent.click(await screen.findByRole('button', { name: 'Calcar distribución' }));
      await userEvent.click(screen.getByRole('button', { name: 'Mesa Principal' }));
      expect(screen.queryByRole('button', { name: 'Trazar lugares' })).not.toBeInTheDocument();
      expectNoSeatWrites(fixture.api);
    }
  );

  it.each([
    new Error('network'),
    new ApiError(0, 'NETWORK_ERROR', 'network'),
    new ApiError(504, 'TIMEOUT', 'timeout'),
    new ApiError(429, 'RATE_LIMITED', 'limit'),
    new ApiError(500, 'INTERNAL_ERROR', 'server'),
    new ApiError(409, 'FLOORPLAN_CONCURRENCY_CONFLICT', 'conflict')
  ])('CALCA03 stops on failure, recovers authority and never replays the POST: %s', async (failure) => {
    const fixture = traceFixture();
    vi.mocked(fixture.api.adminEventPreparation.createFloorplanSeat).mockRejectedValue(failure);
    await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    const place = canvasPlace();
    act(() => place({ x: 0.3, y: 0.3 }));
    await screen.findByText(/Trazado detenido. Revisa los lugares confirmados/);
    expect(screen.queryByRole('button', { name: 'Terminar mesa' })).not.toBeInTheDocument();
    expect(floorplanHarness.props?.selectedId).toBe('table-a');
    expect(fixture.api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(2);
    act(() => place({ x: 0.4, y: 0.4 }));
    expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
  });

  it('CALCA03 reconciles an uncertain committed POST without replay, and requires an explicit new session', async () => {
    const fixture = traceFixture();
    const create = vi.mocked(fixture.api.adminEventPreparation.createFloorplanSeat).getMockImplementation()!;
    vi.mocked(fixture.api.adminEventPreparation.createFloorplanSeat).mockImplementationOnce(async (...args) => {
      await create(...args);
      throw new Error('lost response');
    });
    await openTraceParent(fixture.api);
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    act(() => canvasPlace()({ x: 0.3, y: 0.3 }));
    await screen.findByText(/Trazado detenido. Revisa los lugares confirmados/);
    expect(fixture.state.seats).toHaveLength(1);
    expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
    expect(screen.getByText('1 lugares definidos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
    act(() => canvasPlace()({ x: 0.4, y: 0.3 }));
    await screen.findByText('2 lugares confirmados');
    expect(fixture.state.seats.map((seat) => seat.label)).toEqual(['Lugar 1', 'Lugar 2']);
  });

  it.each([false, true])(
    'CALCA03 stops and blocks resumption when authoritative GET fails after POST success=%s',
    async (success) => {
      const fixture = traceFixture();
      await openTraceParent(fixture.api);
      vi.mocked(fixture.api.adminEventPreparation.getFloorplan).mockRejectedValueOnce(new Error('read unavailable'));
      if (!success)
        vi.mocked(fixture.api.adminEventPreparation.createFloorplanSeat).mockRejectedValueOnce(
          new Error('unknown result')
        );
      await userEvent.click(screen.getByRole('button', { name: 'Trazar lugares' }));
      const place = canvasPlace();
      act(() => place({ x: 0.3, y: 0.3 }));
      await screen.findByText(/Trazado detenido/);
      expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeDisabled();
      act(() => place({ x: 0.4, y: 0.3 }));
      expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
      await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeEnabled());
      expect(screen.queryByRole('button', { name: 'Terminar mesa' })).not.toBeInTheDocument();
      expect(fixture.api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledOnce();
    }
  );

  it.each(['TABLE', 'locked', 'missing', 'zone', 'Manual'] as const)(
    'CALCA03 never exposes tracing for %s',
    async (scenario) => {
      const fixture = traceFixture();
      fixture.state = {
        ...fixture.state,
        ...(scenario === 'TABLE' ? { seatingMode: 'TABLE' } : {}),
        locked: scenario === 'locked',
        shapes: scenario === 'missing' ? [] : [shape({ ...(scenario === 'zone' ? { kind: 'DECORATIVE_ZONE' } : {}) })]
      };
      renderAdminApp(fixture.api, `/eventos/${adminEvent.id}/preparar/croquis`);
      await screen.findByTestId('admin-floorplan-surface');
      if (scenario !== 'locked')
        await userEvent.click(
          screen.getByRole('button', { name: scenario === 'Manual' ? 'Manual' : 'Calcar distribución' })
        );
      if (scenario !== 'missing') await userEvent.click(screen.getByRole('button', { name: 'Mesa Principal' }));
      expect(screen.queryByRole('button', { name: 'Trazar lugares' })).not.toBeInTheDocument();
      expectNoSeatWrites(fixture.api);
    }
  );
  it.each(
    (
      [
        { mime: 'image/jpeg', sourceType: 'RASTER' },
        { mime: 'image/png', sourceType: 'RASTER' },
        { mime: 'image/svg+xml', sourceType: 'SVG' }
      ] as const
    ).flatMap((source) => (['TABLE', 'SEAT'] as const).map((seatingMode) => ({ ...source, seatingMode })))
  )(
    'reopens $mime in $seatingMode and creates one Trace parent without seats or selection writes',
    async ({ mime, sourceType, seatingMode }) => {
      let current = floorplan({
        seatingMode,
        image: { fileAssetId: 'trace-source', contentPath: '/private', sourceType }
      });
      const api = preparedFloorplanApi(current);
      vi.mocked(api.adminEventPreparation.floorplanAssetContent).mockResolvedValue(new Blob(['plan'], { type: mime }));
      vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue(svgSource('trace-source'));
      vi.mocked(api.adminEventPreparation.createFloorplanShape).mockImplementation(
        async (_clientId, _eventId, input) => {
          const created = shape({ ...input, id: 'trace-parent' });
          current = { ...current, shapes: [created] };
          vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue(current);
          return created;
        }
      );
      const view = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      const canvas = await screen.findByTestId('admin-floorplan-surface');
      expect(screen.getByRole('heading', { name: 'Plano listo para calcar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Mesa redonda' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mapeo SVG' })).toHaveProperty('disabled', sourceType !== 'SVG');
      await userEvent.click(screen.getByRole('button', { name: 'Calcar distribución' }));
      expect(screen.getByTestId('admin-floorplan-surface')).toBe(canvas);
      expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
      expect(floorplanHarness.props?.captureCanvasClicks).toBe(true);
      expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
      act(() => canvasPlace()({ x: 0.4, y: 0.5 }));
      fireEvent.change((await screen.findAllByLabelText('Nombre o número')).at(-1)!, {
        target: { value: 'Mesa Calca' }
      });
      expect(screen.queryByLabelText('Forma')).not.toBeInTheDocument();
      if (seatingMode === 'TABLE') {
        fireEvent.change(screen.getAllByLabelText('Número de lugares').at(-1)!, { target: { value: '6' } });
      } else {
        expect(screen.queryByLabelText('Número de lugares')).not.toBeInTheDocument();
        expect(screen.getByText('La capacidad se calcula al definir los lugares.')).toBeInTheDocument();
      }
      const save = enabledButton('Agregar mesa');
      fireEvent.click(save);
      fireEvent.click(save);
      await waitFor(() => expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(2));
      expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
      expect(vi.mocked(api.adminEventPreparation.createFloorplanShape).mock.calls[0]![2]).toEqual(
        expect.objectContaining({
          name: 'Mesa Calca',
          kind: 'TABLE',
          ...(seatingMode === 'TABLE' ? { capacity: 6 } : {})
        })
      );
      expect(floorplanHarness.props?.selectedId).toBe('trace-parent');
      expect(screen.getByLabelText('Nombre o número')).toHaveValue('Mesa Calca');
      expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
      if (seatingMode === 'SEAT') {
        expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Agregar lugar' })).not.toBeInTheDocument();
        expect(floorplanHarness.props?.onSeatMove).toBeUndefined();
      }
      expectNoSeatWrites(api);
      view.unmount();
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      await userEvent.click(await screen.findByRole('button', { name: 'Calcar distribución' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Mesa Calca' }));
      expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
      expect(api.adminEventPreparation.updateFloorplanShape).not.toHaveBeenCalled();
      expect(api.adminEventPreparation.setFloorplanSeatingMode).not.toHaveBeenCalled();
      expectNoSeatWrites(api);
    }
  );

  it.each([1440, 1024])(
    'keeps the same canvas and Manual available after canceling a Trace draft at width %d',
    async (width) => {
      setAdminViewportWidth(width);
      const parent = shape({ id: 'existing-trace-parent', capacity: 0, availableCapacity: 0 });
      const api = preparedFloorplanApi(floorplan({ seatingMode: 'SEAT', shapes: [parent] }));
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      const canvas = await screen.findByTestId('admin-floorplan-surface');
      await userEvent.click(screen.getByRole('button', { name: 'Calcar distribución' }));
      await userEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
      act(() => canvasPlace()({ x: 0.45, y: 0.5 }));
      expect(screen.getByText('Manual', { selector: 'button' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Salir de Calca' })).toBeDisabled();
      await userEvent.click(enabledButton('Cancelar'));
      expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
      expectNoSeatWrites(api);
      await userEvent.click(await screen.findByRole('button', { name: parent.name }));
      expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeEnabled();
      expect(floorplanHarness.props?.tracePresentation).toBe(true);
      expect(document.querySelector('.MuiModal-root .MuiBackdrop-root')).toBeNull();
      await userEvent.click(enabledButton('Cancelar'));
      await chooseManual();
      expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeInTheDocument();
      expect(screen.getByTestId('admin-floorplan-surface')).toBe(canvas);
    }
  );

  it.each([
    { width: 1600, height: 1000 },
    { width: 1000, height: 1600 },
    { width: 1000, height: 1000 }
  ])(
    'centers a Trace reference at the clicked point on a $width × $height plan and cancels without writes',
    async (size) => {
      const api = preparedFloorplanApi(floorplan());
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      await userEvent.click(await screen.findByRole('button', { name: 'Calcar distribución' }));
      await userEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
      act(() =>
        (
          floorplanHarness.props?.onCanvasPlace as (
            point: { x: number; y: number },
            id: undefined,
            size: { width: number; height: number }
          ) => void
        )({ x: 0.4, y: 0.5 }, undefined, size)
      );
      const draft = floorplanHarness.props?.draft as AdminFloorplanShape;
      const side = 0.08 * Math.min(size.width, size.height);
      expect(draft.x * size.width + side / 2).toBeCloseTo(0.4 * size.width);
      expect(draft.y * size.height + side / 2).toBeCloseTo(0.5 * size.height);
      await userEvent.click(enabledButton('Cancelar'));
      expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
      expectNoSeatWrites(api);
    }
  );

  it('retains the confirmed Trace parent during refresh failure without replaying the write', async () => {
    const initial = floorplan({ seatingMode: 'SEAT' });
    const api = preparedFloorplanApi(initial);
    const saved = shape({ id: 'confirmed-trace', name: 'Mesa confirmada' });
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue(saved);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ...initial, shapes: [saved] });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: 'Calcar distribución' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    act(() => canvasPlace()({ x: 0.4, y: 0.5 }));
    fireEvent.change(screen.getByLabelText('Nombre o número'), { target: { value: saved.name } });
    fireEvent.click(enabledButton('Agregar mesa'));
    await screen.findByText('Guardado · falta actualizar. La acción no se repetirá.');
    expect(floorplanHarness.props?.selectedId).toBe(saved.id);
    expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    await waitFor(() => expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(3));
    expect(floorplanHarness.props?.selectedId).toBe(saved.id);
    expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.updateFloorplanShape).not.toHaveBeenCalled();
    expectNoSeatWrites(api);
  });

  it('keeps an existing zero-capacity exact parent editable without creating a seat', async () => {
    const parent = shape({ capacity: 0, availableCapacity: 0 });
    const api = preparedFloorplanApi(floorplan({ seatingMode: 'SEAT', shapes: [parent] }));
    vi.mocked(api.adminEventPreparation.updateFloorplanShape).mockResolvedValue({ ...parent, name: 'Mesa padre' });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: parent.name }));
    fireEvent.change(screen.getAllByLabelText('Nombre o número').at(-1)!, { target: { value: 'Mesa padre' } });
    await userEvent.click(enabledButton('Guardar cambios'));
    await waitFor(() => expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledOnce());
    expect(vi.mocked(api.adminEventPreparation.updateFloorplanShape).mock.calls[0]![3]).toEqual(
      expect.objectContaining({ name: 'Mesa padre', capacity: 0 })
    );
    expectNoSeatWrites(api);
  });

  it('keeps decorative-zone editing in Manual while Calca selects only parent tables', async () => {
    const zone = shape({ id: 'zone-trace', name: 'Pista', kind: 'DECORATIVE_ZONE', capacity: 0 });
    const api = preparedFloorplanApi(floorplan({ shapes: [zone] }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: 'Calcar distribución' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pista' }));
    expect(screen.queryByLabelText('Nombre de zona')).not.toBeInTheDocument();
    await chooseManual();
    await userEvent.click(within(screen.getByTestId('admin-floorplan-surface')).getByRole('button', { name: 'Pista' }));
    expect(screen.getAllByLabelText('Nombre de zona').at(-1)).toHaveValue('Pista');
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
    expect(api.adminEventPreparation.updateFloorplanShape).not.toHaveBeenCalled();
    expectNoSeatWrites(api);
  });

  it('offers preparation only for non-deleted Events', async () => {
    const api = mockAdminApi();
    const view = renderAdminApp(api, `/eventos/${adminEvent.id}`);
    expect(await screen.findByRole('link', { name: 'Preparar evento' }, { timeout: 5_000 })).toHaveAttribute(
      'href',
      `/eventos/${adminEvent.id}/preparar`
    );
    vi.mocked(api.adminEvents.get).mockResolvedValue(deletedEvent);
    await view.router.navigate(`/eventos/${deletedEvent.id}`);
    expect(await screen.findByRole('heading', { name: deletedEvent.name!, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Preparar evento' })).not.toBeInTheDocument();
  });

  it('redirects the preparation root to Datos and saves through the client-scoped Admin API', async () => {
    const api = mockAdminApi();
    const { router } = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar`);
    expect(await screen.findByRole('heading', { name: 'Datos del Evento' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/eventos/${adminEvent.id}/preparar/datos`);
    expect(api.adminEvents.get).toHaveBeenCalledWith(adminEvent.id, expect.any(AbortSignal));
    expect(screen.getByLabelText('Servicio')).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Evento preparado');
    await userEvent.type(screen.getByLabelText('Fecha y hora de finalización'), '2035-10-19T01:00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.updateEvent).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        expect.objectContaining({
          name: 'Evento preparado',
          eventEndDateTime: expect.any(String)
        })
      )
    );
    expect(api.events.update).not.toHaveBeenCalled();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('keeps Managed preparation out of Commercial and redirects a direct URL to Datos', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, status: 'CONFIGURED', designKickoffAt: null });
    vi.mocked(api.adminClients.get).mockResolvedValue({
      ...organization,
      id: adminEvent.clientId,
      type: 'PLANNER',
      operatingProfile: 'MANAGED'
    });
    const { router } = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);

    expect(await screen.findByRole('heading', { name: 'Datos del Evento' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/eventos/${adminEvent.id}/preparar/datos`);
    expect(screen.queryByRole('link', { name: 'Comercial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar evento' })).not.toBeInTheDocument();
    expect(api.adminEventPreparation.getCommercialQuote).not.toHaveBeenCalled();

    await router.navigate(`/eventos/${adminEvent.id}/preparar/invitacion`);
    expect(
      await screen.findByRole('button', { name: 'Subir imagen principal' }, { timeout: 5_000 })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir a Comercial' })).not.toBeInTheDocument();
    expect(api.adminEventPreparation.getCommercialQuote).not.toHaveBeenCalled();
  });

  it('offers Managed activation only when ready and requires explicit confirmation', async () => {
    const ready = {
      ...adminEvent,
      status: 'READY_TO_ACTIVATE' as const,
      activatedAt: null,
      activatedByUserId: null,
      activatedServiceId: null,
      activatedServicePriceId: null,
      baseCostCredits: null,
      promotionDiscountCredits: null,
      finalCostCredits: null,
      purchasedCreditsUsed: null,
      creditLineCreditsUsed: null,
      creditUnitValueMxnCentsSnapshot: null,
      activationReceiptId: null,
      activationIdempotencyKey: null
    };
    const selfServiceApi = mockAdminApi();
    vi.mocked(selfServiceApi.adminEvents.get).mockResolvedValue(ready);
    const selfService = renderAdminApp(selfServiceApi, `/eventos/${adminEvent.id}/preparar/datos`);
    expect(await screen.findByRole('heading', { name: 'Datos del Evento' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar evento' })).not.toBeInTheDocument();
    selfService.unmount();

    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue(ready);
    vi.mocked(api.adminClients.get).mockResolvedValue({
      ...organization,
      id: adminEvent.clientId,
      type: 'PLANNER',
      operatingProfile: 'MANAGED'
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar evento' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/no genera ningún cargo financiero/u));
    expect(api.adminEvents.activateManagedForClient).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('adopts authoritative ACTIVE and hides Managed activation after success', async () => {
    const ready = managedReadyEvent();
    const active = { ...ready, status: 'ACTIVE' as const, activatedAt: '2026-09-15T12:00:00.000Z' };
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValueOnce(ready).mockResolvedValue(active);
    vi.mocked(api.adminEvents.activateManagedForClient).mockResolvedValue(active);
    vi.mocked(api.adminClients.get).mockResolvedValue(managedPlannerClient());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Activar evento' }));
    await waitFor(() => expect(api.adminEvents.activateManagedForClient).toHaveBeenCalledOnce());
    expect(await screen.findByText('Activo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar evento' })).not.toBeInTheDocument();
    expect(api.adminEvents.get).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it('adopts uncertain Managed activation only when the authoritative Event has the same key', async () => {
    const ready = managedReadyEvent();
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValueOnce(ready);
    vi.mocked(api.adminEvents.activateManagedForClient).mockImplementationOnce(async (_clientId, _eventId, key) => {
      vi.mocked(api.adminEvents.get).mockResolvedValue({
        ...ready,
        status: 'ACTIVE',
        activatedAt: '2026-09-15T12:00:00.000Z',
        activationIdempotencyKey: key
      });
      throw new TypeError('network');
    });
    vi.mocked(api.adminClients.get).mockResolvedValue(managedPlannerClient());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Activar evento' }));
    expect(await screen.findByText('El Evento quedó activo.')).toBeInTheDocument();
    expect(api.adminEvents.activateManagedForClient).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Activar evento' })).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('adopts an activation owned by another key without retrying the POST', async () => {
    const ready = managedReadyEvent();
    const active = {
      ...ready,
      status: 'ACTIVE' as const,
      activatedAt: '2026-09-15T12:00:00.000Z',
      activationIdempotencyKey: 'another-managed-activation-key'
    };
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValueOnce(ready).mockResolvedValue(active);
    vi.mocked(api.adminEvents.activateManagedForClient).mockRejectedValueOnce(new TypeError('network'));
    vi.mocked(api.adminClients.get).mockResolvedValue(managedPlannerClient());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Activar evento' }));
    expect(await screen.findByText(/activado por otra operación/u)).toBeInTheDocument();
    expect(api.adminEvents.activateManagedForClient).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Activar evento' })).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('uses a new Managed activation key after a definitive API error', async () => {
    const ready = managedReadyEvent();
    const active = { ...ready, status: 'ACTIVE' as const, activatedAt: '2026-09-15T12:00:00.000Z' };
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValueOnce(ready).mockResolvedValue(active);
    vi.mocked(api.adminEvents.activateManagedForClient)
      .mockRejectedValueOnce(new ApiError(409, 'EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT', 'conflict'))
      .mockResolvedValueOnce(active);
    vi.mocked(api.adminClients.get).mockResolvedValue(managedPlannerClient());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Activar evento' }));
    expect(await screen.findByText(/ya fue activado mediante otra operación/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar evento' }));
    await waitFor(() => expect(api.adminEvents.activateManagedForClient).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(api.adminEvents.activateManagedForClient).mock.calls;
    expect(calls[0]?.[2]).not.toBe(calls[1]?.[2]);
    confirm.mockRestore();
  });

  it('keeps exactly the same Managed activation key while uncertain authority remains ready', async () => {
    const ready = managedReadyEvent();
    const active = { ...ready, status: 'ACTIVE' as const, activatedAt: '2026-09-15T12:00:00.000Z' };
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValueOnce(ready).mockResolvedValueOnce(ready).mockResolvedValue(active);
    vi.mocked(api.adminEvents.activateManagedForClient)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(active);
    vi.mocked(api.adminClients.get).mockResolvedValue(managedPlannerClient());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);

    await userEvent.click(await screen.findByRole('button', { name: 'Activar evento' }));
    expect(await screen.findByText(/No pudimos confirmar el resultado/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar evento' }));
    await waitFor(() => expect(api.adminEvents.activateManagedForClient).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(api.adminEvents.activateManagedForClient).mock.calls;
    expect(calls[0]?.[2]).toBe(calls[1]?.[2]);
    expect(await screen.findByText('Activo')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('renders the authoritative commercial quote and submits authorization only once on a double click', async () => {
    const api = mockAdminApi();
    const baseQuote = await api.adminEventPreparation.getCommercialQuote(adminEvent.clientId, adminEvent.id);
    const pendingQuote = {
      ...baseQuote,
      authorizedAt: null,
      priceLockedAt: null,
      designKickoffAt: null,
      customWorkExists: false
    };
    vi.mocked(api.adminEventPreparation.getCommercialQuote).mockReset().mockResolvedValue(pendingQuote);
    vi.mocked(api.adminEventPreparation.authorizeCommercial).mockResolvedValue({
      ...pendingQuote,
      authorizedAt: '2026-08-26T12:00:00.000Z',
      priceLockedAt: '2026-08-26T12:00:00.000Z',
      lockMatchesCurrentContext: true
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);

    expect(await screen.findByRole('heading', { name: 'Comercial' })).toBeInTheDocument();
    expect(screen.getByText(/Estándar \/ PVP/u)).toBeInTheDocument();
    expect(screen.getByText(/10 créditos/u)).toBeInTheDocument();
    expect(screen.getByText(/34 créditos · suficiente/u)).toBeInTheDocument();
    expect(
      screen.getByText('La autorización no reserva créditos. El cargo se realiza al activar el evento.')
    ).toBeInTheDocument();
    const authorize = screen.getByRole('button', { name: 'Autorizar preparación' });
    await userEvent.dblClick(authorize);
    await waitFor(() => expect(api.adminEventPreparation.authorizeCommercial).toHaveBeenCalledTimes(1));
    expect(api.adminEventPreparation.authorizeCommercial).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
      acceptanceConfirmed: true
    });
    confirm.mockRestore();
  });

  it('offers kickoff for authorized digital services', async () => {
    const api = mockAdminApi();
    const baseQuote = await api.adminEventPreparation.getCommercialQuote(adminEvent.clientId, adminEvent.id);
    vi.mocked(api.adminEventPreparation.getCommercialQuote)
      .mockReset()
      .mockResolvedValue({
        ...baseQuote,
        serviceCode: 'FLYER',
        authorizedAt: '2026-08-26T12:00:00.000Z',
        priceLockedAt: '2026-08-26T12:00:00.000Z',
        designKickoffAt: null,
        lockMatchesCurrentContext: true
      });
    vi.mocked(api.adminEventPreparation.startDesignKickoff).mockResolvedValue({
      ...baseQuote,
      designKickoffAt: '2026-08-26T12:00:00.000Z'
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar diseño' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.startDesignKickoff).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id)
    );
  });

  it('offers explicit re-quote for stale terms', async () => {
    const api = mockAdminApi();
    const baseQuote = await api.adminEventPreparation.getCommercialQuote(adminEvent.clientId, adminEvent.id);
    vi.mocked(api.adminEventPreparation.getCommercialQuote)
      .mockReset()
      .mockResolvedValue({
        ...baseQuote,
        designKickoffAt: null,
        lockMatchesCurrentContext: false
      });
    vi.mocked(api.adminEventPreparation.requoteCommercial).mockResolvedValue(baseQuote);
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([catalogPrice(baseQuote.serviceId, 'FLYER')]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);
    await userEvent.click(await screen.findByRole('button', { name: 'Re-cotizar' }));
    expect(await screen.findByRole('heading', { name: 'Re-cotizar Evento' })).toBeInTheDocument();
    expect(screen.getByText(/Precio vigente:/u)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Confirmar nueva cotización' });
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.dblClick(submit);
    await waitFor(() =>
      expect(api.adminEventPreparation.requoteCommercial).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
        serviceId: baseQuote.serviceId,
        capacity: baseQuote.capacity,
        acceptanceConfirmed: true
      })
    );
    expect(api.adminEventPreparation.requoteCommercial).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('routes legacy custom work through exactly one explicit re-quote and never offers authorization', async () => {
    const api = mockAdminApi();
    const baseQuote = await api.adminEventPreparation.getCommercialQuote(adminEvent.clientId, adminEvent.id);
    const legacy = {
      ...baseQuote,
      quoteSource: 'CURRENT' as const,
      authorizedAt: null,
      priceLockedAt: null,
      designKickoffAt: null,
      customWorkExists: true
    };
    vi.mocked(api.adminEventPreparation.getCommercialQuote).mockReset().mockResolvedValue(legacy);
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([catalogPrice(baseQuote.serviceId, 'FLYER')]);
    vi.mocked(api.adminEventPreparation.requoteCommercial).mockResolvedValue(baseQuote);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);

    expect(await screen.findByRole('button', { name: 'Re-cotizar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Autorizar preparación' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Re-cotizar' }));
    const submit = await screen.findByRole('button', { name: 'Confirmar nueva cotización' });
    await waitFor(() => expect(submit).toBeEnabled());
    await userEvent.dblClick(submit);
    await waitFor(() => expect(api.adminEventPreparation.requoteCommercial).toHaveBeenCalledTimes(1));
    confirm.mockRestore();
  });

  it('lets an authorized Event with design kickoff discover and change catalog-backed terms', async () => {
    const api = mockAdminApi();
    const baseQuote = await api.adminEventPreparation.getCommercialQuote(adminEvent.clientId, adminEvent.id);
    const locked = {
      ...baseQuote,
      designKickoffAt: '2026-08-26T12:00:00.000Z',
      lockMatchesCurrentContext: true
    };
    vi.mocked(api.adminEventPreparation.getCommercialQuote).mockReset().mockResolvedValue(locked);
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([catalogPrice(baseQuote.serviceId, 'FLYER')]);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);

    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar términos' }));
    expect(await screen.findByLabelText('SKU propuesto')).toHaveTextContent('Flyer');
    expect(screen.getByLabelText('Capacidad propuesta')).toHaveValue(baseQuote.capacity);
  });

  it('shows no kickoff for QR and gates Invitation mutations before a digital kickoff', async () => {
    const api = mockAdminApi();
    const baseQuote = await api.adminEventPreparation.getCommercialQuote(adminEvent.clientId, adminEvent.id);
    vi.mocked(api.adminEventPreparation.getCommercialQuote)
      .mockReset()
      .mockResolvedValue({
        ...baseQuote,
        serviceCode: 'PHYSICAL_QR',
        designKickoffAt: null
      });
    vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, status: 'CONFIGURED', designKickoffAt: null });
    const { router } = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);
    expect(await screen.findByRole('heading', { name: 'Comercial' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar diseño' })).not.toBeInTheDocument();

    await router.navigate(`/eventos/${adminEvent.id}/preparar/invitacion`);
    expect(
      await screen.findByText(
        'Autoriza los términos comerciales e inicia el diseño antes de cargar o editar la invitación.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Comercial' })).toHaveAttribute(
      'href',
      `/eventos/${adminEvent.id}/preparar/comercial`
    );
    expect(api.adminEventPreparation.uploadInvitationAsset).not.toHaveBeenCalled();
  });

  it('creates a Flyer with Admin uploads and never uses Planner visual APIs', async () => {
    const api = mockAdminApi();
    const initial = asset('initial', 'FLYER_INITIAL_IMAGE');
    const qr = asset('qr', 'FLYER_QR_IMAGE');
    vi.mocked(api.adminEventPreparation.uploadInvitationAsset).mockResolvedValueOnce(initial).mockResolvedValueOnce(qr);
    vi.mocked(api.adminEventPreparation.createFlyer).mockResolvedValue({
      id: 'design-1',
      eventId: adminEvent.id,
      type: 'FLYER',
      flyerInitialAssetId: initial.id,
      flyerQrAssetId: qr.id,
      pages: [],
      hotspots: [],
      createdAt: adminEvent.createdAt,
      updatedAt: adminEvent.updatedAt
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/invitacion`);
    const initialButton = await screen.findByRole('button', { name: 'Subir imagen principal' });
    await userEvent.upload(
      initialButton.querySelector('input')!,
      new File(['a'], 'initial.png', { type: 'image/png' })
    );
    const qrButton = screen.getByRole('button', { name: 'Subir imagen QR' });
    await userEvent.upload(qrButton.querySelector('input')!, new File(['b'], 'qr.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear Flyer' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.createFlyer).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
        initialAssetId: initial.id,
        qrAssetId: qr.id
      })
    );
    expect(api.fileAssets.upload).not.toHaveBeenCalled();
    expect(api.design.createFlyer).not.toHaveBeenCalled();
  });

  it('keeps a disabled Croquis explicit and links to Datos without creating infrastructure', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByRole('heading', { name: 'Croquis deshabilitado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Datos' })).toHaveAttribute(
      'href',
      `/eventos/${adminEvent.id}/preparar/datos`
    );
    expect(api.adminEventPreparation.getFloorplan).not.toHaveBeenCalled();
    expect(api.adminEventPreparation.createFloorplan).not.toHaveBeenCalled();
  });

  it('loads the provider Builder with a focused Croquis header and private image', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, floorplanEnabled: true });
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue(floorplan());
    vi.mocked(api.adminEventPreparation.floorplanAssetContent).mockResolvedValue(new Blob(['image']));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await screen.findByTestId('admin-floorplan-surface');
    expect(screen.getByText('Croquis', { selector: 'h2' })).toBeInTheDocument();
    expect(
      screen.queryByText(`Cliente ${adminEvent.clientId} · Servicio ${adminEvent.serviceCode}`)
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Acomodo')).toHaveTextContent('Por mesa');
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      expect.any(AbortSignal)
    );
    expect(api.adminEventPreparation.floorplanAssetContent).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      'asset-floorplan',
      expect.any(AbortSignal)
    );
    expect(await screen.findByTestId('admin-floorplan-surface')).toBeInTheDocument();
    expect(api.floorplan.get).not.toHaveBeenCalled();
  });

  it('shows an image-load warning instead of waiting indefinitely for the Croquis', async () => {
    const api = preparedFloorplanApi();
    vi.mocked(api.adminEventPreparation.floorplanAssetContent).mockRejectedValue(new Error('asset unavailable'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await waitFor(() => expect(api.adminEventPreparation.floorplanAssetContent).toHaveBeenCalledOnce());
    expect(await screen.findByText('No pudimos cargar el plano.')).toBeInTheDocument();
    expect(screen.queryByText('Cargando plano...')).not.toBeInTheDocument();
  });

  it('shows a local warning when SVG metadata cannot load', async () => {
    const api = preparedFloorplanApi(
      floorplan({ image: { fileAssetId: 'svg-asset', contentPath: '/private', sourceType: 'SVG' } })
    );
    vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockRejectedValue(new Error('metadata unavailable'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await waitFor(() => expect(api.adminEventPreparation.getFloorplanSvgSource).toHaveBeenCalledOnce());
    expect(await screen.findByText('No pudimos preparar las áreas editables del SVG.')).toBeInTheDocument();
    expect(floorplanHarness.props?.svgSource).toBeUndefined();
  });

  it.each([
    ['salon.png', 'image/png'],
    ['salon.png', ''],
    ['salon.JPG', ''],
    ['salon.jpeg', 'application/octet-stream'],
    ['salon', 'image/jpeg']
  ])('shows the empty onboarding and creates a Floorplan from an Admin-only upload: %s (%s)', async (name, type) => {
    const api = mockAdminApi();
    const event = { ...adminEvent, floorplanEnabled: true };
    const created = floorplan();
    vi.mocked(api.adminEvents.get).mockResolvedValue(event);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockRejectedValueOnce(new ApiError(404, 'FLOORPLAN_NOT_FOUND', 'not found'))
      .mockResolvedValue(created);
    vi.mocked(api.adminEventPreparation.uploadFloorplanAsset).mockResolvedValue(floorplanAsset());
    vi.mocked(api.adminEventPreparation.createFloorplan).mockResolvedValue(created);
    vi.mocked(api.adminEventPreparation.floorplanAssetContent).mockResolvedValue(new Blob(['image']));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const upload = await screen.findByRole('button', { name: 'Subir plano' });
    await userEvent.upload(upload.querySelector('input')!, new File(['plan'], name, { type }));
    await waitFor(() =>
      expect(api.adminEventPreparation.uploadFloorplanAsset).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        expect.any(File)
      )
    );
    expect(api.adminEventPreparation.createFloorplan).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
      imageAssetId: 'asset-floorplan'
    });
    expect(api.fileAssets.upload).not.toHaveBeenCalled();
    expect(api.floorplan.setImage).not.toHaveBeenCalled();
    expect(api.adminEventPreparation.uploadFloorplanSvgAsset).not.toHaveBeenCalled();
  });

  it('replaces an existing image through Admin upload plus PATCH and adopts the response', async () => {
    const api = preparedFloorplanApi();
    const replacement = floorplan({
      image: { fileAssetId: 'asset-replacement', contentPath: '/private/new', sourceType: 'RASTER' }
    });
    vi.mocked(api.adminEventPreparation.uploadFloorplanAsset).mockResolvedValue(
      floorplanAsset({ id: 'asset-replacement' })
    );
    vi.mocked(api.adminEventPreparation.replaceFloorplanImage).mockResolvedValue(replacement);
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(floorplan()).mockResolvedValue(replacement);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const button = await screen.findByRole('button', { name: 'Cambiar plano' });
    await userEvent.upload(button.querySelector('input')!, new File(['next'], 'nuevo.jpg', { type: 'image/jpeg' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.replaceFloorplanImage).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
        imageAssetId: 'asset-replacement'
      })
    );
    expect(api.adminEventPreparation.createFloorplan).not.toHaveBeenCalled();
  });

  it.each([
    ['salon.svg', 'image/svg+xml'],
    ['salon.svg', ''],
    ['salon.SVG', 'application/octet-stream'],
    ['salon', 'image/svg+xml']
  ])(
    'uploads an SVG source through the Admin SVG asset endpoint without changing domain data: %s (%s)',
    async (name, type) => {
      const current = floorplan({ shapes: [shape()], seats: [serpentineSeats('table-a')[0]!] });
      const replacement = floorplan({
        shapes: current.shapes,
        seats: current.seats,
        image: { fileAssetId: 'svg-replacement', contentPath: '/private/svg', sourceType: 'SVG' }
      });
      const api = preparedFloorplanApi(current);
      vi.mocked(api.adminEventPreparation.uploadFloorplanSvgAsset).mockResolvedValue(
        floorplanAsset({ id: 'svg-replacement', fileType: 'FLOORPLAN_SVG', mimeType: 'image/svg+xml' })
      );
      vi.mocked(api.adminEventPreparation.replaceFloorplanImage).mockResolvedValue(replacement);
      vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(current).mockResolvedValue(replacement);
      vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue(svgSource('svg-replacement'));
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      const button = await screen.findByRole('button', { name: 'Cambiar plano' });
      const file = new File(['<svg/>'], name, { type });
      await userEvent.upload(button.querySelector('input')!, file);
      await waitFor(() =>
        expect(api.adminEventPreparation.uploadFloorplanSvgAsset).toHaveBeenCalledWith(
          adminEvent.clientId,
          adminEvent.id,
          file
        )
      );
      expect(api.adminEventPreparation.uploadFloorplanSvgAsset).toHaveBeenCalledOnce();
      expect(api.adminEventPreparation.uploadFloorplanAsset).not.toHaveBeenCalled();
      expect(api.adminEventPreparation.replaceFloorplanImage).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
        imageAssetId: 'svg-replacement'
      });
      expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toEqual(current.shapes);
      expect((floorplanHarness.props?.floorplan as AdminFloorplan).seats).toEqual(current.seats);
    }
  );

  it.each([
    ['FILE_SVG_INVALID', 'El archivo SVG no es válido. Vuelve a exportarlo y carga el nuevo archivo.'],
    [
      'FILE_SVG_UNSAFE',
      'El SVG contiene contenido no permitido. Exporta una versión sin scripts ni recursos externos.'
    ],
    [
      'FILE_SVG_LIMIT_EXCEEDED',
      'El SVG supera los límites de tamaño o complejidad. Simplifica el plano y vuelve a cargarlo.'
    ]
  ])('shows actionable feedback for backend SVG rejection %s', async (code, message) => {
    const current = floorplan({ shapes: [shape()], seats: [serpentineSeats('table-a')[0]!] });
    const api = preparedFloorplanApi(current);
    vi.mocked(api.adminEventPreparation.uploadFloorplanSvgAsset).mockRejectedValue(new ApiError(400, code, 'rejected'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const button = await screen.findByRole('button', { name: 'Cambiar plano' });
    await userEvent.upload(
      button.querySelector('input')!,
      new File(['<svg/>'], 'salon.svg', { type: 'image/svg+xml' })
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(floorplanHarness.props?.disabled).toBe(false));
    expect(api.adminEventPreparation.uploadFloorplanSvgAsset).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.uploadFloorplanAsset).not.toHaveBeenCalled();
    expect(api.adminEventPreparation.replaceFloorplanImage).not.toHaveBeenCalled();
    expect(api.adminEventPreparation.createFloorplan).not.toHaveBeenCalled();
    expect(floorplanHarness.props?.floorplan).toEqual(current);
  });

  it('requires explicit confirmation before replacing a mapped SVG and sends the detach confirmation only then', async () => {
    const mapped = shape({ sourceElementId: 'private-circle' });
    const current = floorplan({
      image: { fileAssetId: 'svg-current', contentPath: '/private/svg', sourceType: 'SVG' },
      shapes: [mapped],
      seats: [serpentineSeats(mapped.id)[0]!]
    });
    const replacement = floorplan({
      image: { fileAssetId: 'raster-replacement', contentPath: '/private/raster', sourceType: 'RASTER' },
      shapes: [{ ...mapped, sourceElementId: null }],
      seats: current.seats
    });
    const api = preparedFloorplanApi(current);
    vi.mocked(api.adminEventPreparation.uploadFloorplanAsset).mockResolvedValue(
      floorplanAsset({ id: 'raster-replacement' })
    );
    vi.mocked(api.adminEventPreparation.replaceFloorplanImage).mockResolvedValue(replacement);
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(current).mockResolvedValue(replacement);
    vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue(svgSource('svg-current'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const button = await screen.findByRole('button', { name: 'Cambiar plano' });
    await userEvent.upload(button.querySelector('input')!, new File(['next'], 'nuevo.png', { type: 'image/png' }));
    expect(await screen.findByRole('heading', { name: '¿Reemplazar el plano SVG?' })).toBeInTheDocument();
    expect(api.adminEventPreparation.uploadFloorplanAsset).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reemplazar y desvincular' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.replaceFloorplanImage).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
        imageAssetId: 'raster-replacement',
        confirmSvgMappingDetach: true
      })
    );
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toEqual(replacement.shapes);
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).seats).toEqual(current.seats);
  });

  it('refetches authoritative state after a replacement timeout without retrying the upload or PATCH', async () => {
    const mapped = shape({ sourceElementId: 'private-circle' });
    const current = floorplan({
      image: { fileAssetId: 'svg-current', contentPath: '/private/svg', sourceType: 'SVG' },
      shapes: [mapped]
    });
    const recovered = floorplan({
      image: { fileAssetId: 'raster-replacement', contentPath: '/private/raster', sourceType: 'RASTER' },
      shapes: [{ ...mapped, sourceElementId: null }]
    });
    const api = preparedFloorplanApi(current);
    vi.mocked(api.adminEventPreparation.uploadFloorplanAsset).mockResolvedValue(
      floorplanAsset({ id: 'raster-replacement' })
    );
    vi.mocked(api.adminEventPreparation.replaceFloorplanImage).mockRejectedValue(new Error('timeout'));
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(current).mockResolvedValue(recovered);
    vi.mocked(api.adminEventPreparation.getFloorplanSvgSource).mockResolvedValue(svgSource('svg-current'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const button = await screen.findByRole('button', { name: 'Cambiar plano' });
    await userEvent.upload(button.querySelector('input')!, new File(['next'], 'nuevo.png', { type: 'image/png' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reemplazar y desvincular' }));
    await waitFor(() => expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(2));
    expect(api.adminEventPreparation.uploadFloorplanAsset).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.replaceFloorplanImage).toHaveBeenCalledOnce();
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).image).toEqual(recovered.image);
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toEqual(recovered.shapes);
  });

  it('opens a natural table inspector only after selection and updates through Admin', async () => {
    const table = shape();
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    vi.mocked(api.adminEventPreparation.updateFloorplanShape).mockResolvedValue({ ...table, name: 'Mesa Roble' });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByTestId('admin-floorplan-surface')).toBeInTheDocument();
    expect(screen.queryByText('Mesa seleccionada')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: table.name }));
    expect(await screen.findAllByText('Mesa seleccionada')).not.toHaveLength(0);
    const names = screen.getAllByLabelText('Nombre o número');
    await userEvent.clear(names.at(-1)!);
    await userEvent.type(names.at(-1)!, 'Mesa Roble');
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar cambios' }).at(-1)!);
    await waitFor(() =>
      expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        table.id,
        expect.objectContaining({ name: 'Mesa Roble' })
      )
    );
    expect(api.floorplan.updateShape).not.toHaveBeenCalled();
  });

  it('opens a zone inspector without a capacity field', async () => {
    const zone = shape({ id: 'zone-a', name: 'Pista', kind: 'DECORATIVE_ZONE', capacity: 0, geometry: 'RECTANGLE' });
    const api = preparedFloorplanApi(floorplan({ shapes: [zone] }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await userEvent.click(
      within(await screen.findByTestId('admin-floorplan-surface')).getByRole('button', { name: 'Pista' })
    );
    expect((await screen.findAllByText('Zona seleccionada')).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('Número de lugares')).not.toBeInTheDocument();
    expect(screen.queryByText('DECORATIVE_ZONE')).not.toBeInTheDocument();
  });

  it('creates a Mesa through the Admin shape endpoint', async () => {
    const api = preparedFloorplanApi();
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue(shape());
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]!);
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
    act(() => canvasPlace()({ x: 0.5, y: 0.5 }));
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
    const names = await screen.findAllByLabelText('Nombre o número');
    await userEvent.clear(names.at(-1)!);
    await userEvent.type(names.at(-1)!, 'Mesa Uno');
    await userEvent.click(enabledButton('Agregar mesa'));
    await waitFor(() =>
      expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        expect.objectContaining({
          name: 'Mesa Uno',
          kind: 'TABLE',
          geometry: 'CIRCLE',
          capacity: 10,
          x: 0.44,
          y: 0.44
        })
      )
    );
    const payload = vi.mocked(api.adminEventPreparation.createFloorplanShape).mock.calls[0]![2];
    expect(payload).not.toHaveProperty('presetId');
    expect(payload).not.toHaveProperty('stickerId');
  });

  it('creates a Zona with capacity zero and natural geometry labels', async () => {
    const api = preparedFloorplanApi();
    const zone = shape({ id: 'zone-a', name: 'Pista', kind: 'DECORATIVE_ZONE', capacity: 0, geometry: 'RECTANGLE' });
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue(zone);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseStickerAndPlace('Pista', { x: 0.55, y: 0.45 });
    expect(screen.getAllByRole('combobox', { name: 'Forma' }).at(-1)).toHaveTextContent('Rectangular');
    await userEvent.click(enabledButton('Agregar zona'));
    await waitFor(() =>
      expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        expect.objectContaining({ kind: 'DECORATIVE_ZONE', capacity: 0 })
      )
    );
  });

  it('deletes the selected shape through Admin and not Planner', async () => {
    const table = shape();
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    vi.mocked(api.adminEventPreparation.removeFloorplanShape).mockResolvedValue(undefined);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const surface = await screen.findByTestId('admin-floorplan-surface', {}, { timeout: 5_000 });
    await userEvent.click(within(surface).getByRole('button', { name: table.name }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Eliminar mesa' }))[0]!);
    await waitFor(() =>
      expect(api.adminEventPreparation.removeFloorplanShape).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        table.id
      )
    );
    expect(api.floorplan.removeShape).not.toHaveBeenCalled();
  });

  it('locks an editable Floorplan and makes the Builder read-only', async () => {
    const api = preparedFloorplanApi();
    const locked = floorplan({ locked: true, lockedAt: adminEvent.updatedAt });
    vi.mocked(api.adminEventPreparation.lockFloorplan).mockResolvedValue(locked);
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(floorplan()).mockResolvedValue(locked);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: 'Finalizar distribución' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.lockFloorplan).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id)
    );
    expect(await screen.findByRole('button', { name: 'Editar distribución' })).toBeInTheDocument();
  });

  it('unlocks a protected Floorplan through Admin', async () => {
    const locked = floorplan({ locked: true, lockedAt: adminEvent.updatedAt });
    const api = preparedFloorplanApi(locked);
    vi.mocked(api.adminEventPreparation.unlockFloorplan).mockResolvedValue(floorplan());
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar distribución' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.unlockFloorplan).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id)
    );
  });

  it.each(['TABLE', 'SEAT'] as const)(
    'presents a finalized Croquis as a canvas-first read-only view in %s',
    async (seatingMode) => {
      const table = shape({ id: 'finalized-table' });
      const [seat] = serpentineSeats(table.id);
      const api = preparedFloorplanApi(
        floorplan({
          locked: true,
          lockedAt: adminEvent.updatedAt,
          seatingMode,
          shapes: [table],
          seats: seatingMode === 'SEAT' ? [seat!] : []
        })
      );
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
      expect(await screen.findByTestId('admin-floorplan-surface')).toBeInTheDocument();
      expect(screen.getByText('Distribución finalizada. Vista de solo lectura.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Editar distribución' })).toBeInTheDocument();
      expect(screen.getByText(seatingMode === 'SEAT' ? 'Por lugar exacto' : 'Por mesa')).toBeInTheDocument();
      expect(screen.queryByLabelText('Acomodo')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cambiar plano' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Crear varias mesas' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Agregar lugar' })).not.toBeInTheDocument();
      expect(floorplanHarness.props?.disabled).toBe(true);
      expect(floorplanHarness.props?.readOnly).toBe(true);
    }
  );

  it('keeps the editor chrome in place while finalization is still saving', async () => {
    const api = preparedFloorplanApi();
    const locked = floorplan({ locked: true, lockedAt: adminEvent.updatedAt });
    let resolveLock!: (value: AdminFloorplan) => void;
    vi.mocked(api.adminEventPreparation.lockFloorplan).mockReturnValue(
      new Promise((resolve) => {
        resolveLock = resolve;
      })
    );
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(floorplan()).mockResolvedValue(locked);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await userEvent.click(await screen.findByRole('button', { name: 'Finalizar distribución' }));
    expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeDisabled();
    expect(screen.getByLabelText('Acomodo')).toBeInTheDocument();
    expect(floorplanHarness.props?.readOnly).toBe(false);
    resolveLock(locked);
    expect(await screen.findByRole('button', { name: 'Editar distribución' })).toBeInTheDocument();
  });

  it('restores the existing editor presentation after unlocking', async () => {
    const table = shape({ id: 'unlock-table' });
    const locked = floorplan({ locked: true, lockedAt: adminEvent.updatedAt, seatingMode: 'SEAT', shapes: [table] });
    const unlocked = floorplan({ seatingMode: 'SEAT', shapes: [table] });
    const api = preparedFloorplanApi(locked);
    vi.mocked(api.adminEventPreparation.unlockFloorplan).mockResolvedValue(unlocked);
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValueOnce(locked).mockResolvedValue(unlocked);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar distribución' }));
    await waitFor(() => expect(floorplanHarness.props?.disabled).toBe(false));
    expect(floorplanHarness.props?.readOnly).toBe(false);
    await chooseManual();
    expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeEnabled();
    expect(screen.getByLabelText('Acomodo')).toHaveTextContent('Por lugar exacto');
    expect(screen.getByRole('button', { name: 'Cambiar plano' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: table.name }));
    expect(await screen.findByRole('button', { name: 'Agregar lugar' })).toBeInTheDocument();
  });

  it('preserves an editable draft after a failed shape mutation', async () => {
    const api = preparedFloorplanApi();
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockRejectedValue(new Error('network'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseStickerAndPlace('Mesa redonda');
    const input = (await screen.findAllByLabelText('Nombre o número')).at(-1)!;
    await userEvent.clear(input);
    await userEvent.type(input, 'Mesa pendiente');
    await userEvent.click(enabledButton('Agregar mesa'));
    expect((await screen.findAllByDisplayValue('Mesa pendiente')).at(-1)).toBeInTheDocument();
    expect(enabledButton('Agregar mesa')).toBeEnabled();
  });

  it('does not replay a confirmed mutation when the subsequent refresh fails', async () => {
    const api = preparedFloorplanApi();
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue(shape());
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(floorplan())
      .mockRejectedValueOnce(new Error('refresh'))
      .mockResolvedValueOnce(floorplan({ shapes: [shape({ name: 'Mesa confirmada' })] }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseStickerAndPlace('Mesa redonda');
    const input = (await screen.findAllByLabelText('Nombre o número')).at(-1)!;
    await userEvent.clear(input);
    await userEvent.type(input, 'Mesa confirmada');
    await userEvent.click(enabledButton('Agregar mesa'));
    expect(await screen.findByText('Guardado · falta actualizar')).toBeInTheDocument();
    expect(screen.queryByText('Error al guardar')).not.toBeInTheDocument();
    expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    await waitFor(() => expect(screen.queryByText('Guardado · falta actualizar')).not.toBeInTheDocument());
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
  });

  it('does not replay a confirmed update when its reconciliation GET fails', async () => {
    const table = shape();
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    vi.mocked(api.adminEventPreparation.updateFloorplanShape).mockResolvedValue({ ...table, name: 'Mesa guardada' });
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(floorplan({ shapes: [table] }))
      .mockRejectedValueOnce(new Error('refresh'))
      .mockResolvedValueOnce(floorplan({ shapes: [{ ...table, name: 'Mesa guardada' }] }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: table.name }));
    const name = screen.getAllByLabelText('Nombre o número').at(-1)!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Mesa guardada');
    await userEvent.click(enabledButton('Guardar cambios'));
    expect(await screen.findByText('Guardado · falta actualizar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(3);
  });

  it('does not replay a confirmed delete when its reconciliation GET fails', async () => {
    const table = shape();
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    vi.mocked(api.adminEventPreparation.removeFloorplanShape).mockResolvedValue(undefined);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(floorplan({ shapes: [table] }))
      .mockRejectedValueOnce(new Error('refresh'))
      .mockResolvedValueOnce(floorplan({ shapes: [] }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: table.name }));
    await userEvent.click(enabledButton('Eliminar mesa'));
    expect(await screen.findByText('Guardado · falta actualizar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    expect(api.adminEventPreparation.removeFloorplanShape).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(3);
  });

  it('does not replay a confirmed lock when its reconciliation GET fails', async () => {
    const unlocked = floorplan();
    const locked = floorplan({ locked: true, lockedAt: adminEvent.updatedAt });
    const api = preparedFloorplanApi(unlocked);
    vi.mocked(api.adminEventPreparation.lockFloorplan).mockResolvedValue(locked);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(unlocked)
      .mockRejectedValueOnce(new Error('refresh'))
      .mockResolvedValueOnce(locked);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: 'Finalizar distribución' }));
    expect(await screen.findByText('Guardado · falta actualizar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    expect(api.adminEventPreparation.lockFloorplan).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(3);
  });

  it('does not replay a confirmed unlock when its reconciliation GET fails', async () => {
    const locked = floorplan({ locked: true, lockedAt: adminEvent.updatedAt });
    const unlocked = floorplan();
    const api = preparedFloorplanApi(locked);
    vi.mocked(api.adminEventPreparation.unlockFloorplan).mockResolvedValue(unlocked);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(locked)
      .mockRejectedValueOnce(new Error('refresh'))
      .mockResolvedValueOnce(unlocked);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar distribución' }));
    expect(await screen.findByText('Guardado · falta actualizar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    expect(api.adminEventPreparation.unlockFloorplan).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(3);
  });

  it('keeps the shared canvas operable with more than twenty elements', async () => {
    const shapes = Array.from({ length: 24 }, (_, index) => shape({ id: `table-${index}`, name: `Mesa ${index + 1}` }));
    const api = preparedFloorplanApi(floorplan({ shapes }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByText('24 elementos · 192 lugares')).toBeInTheDocument();
    await screen.findByTestId('admin-floorplan-surface');
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toHaveLength(24);
  });

  it.each([50, 100, 200])('mounts the single shared Builder with %d deterministic tables', async (count) => {
    const shapes = scaleAdminShapes(count);
    const api = preparedFloorplanApi(floorplan({ shapes }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByText(`${count} elementos · ${count * 10} lugares`)).toBeInTheDocument();
    await screen.findByTestId('admin-floorplan-surface');
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toHaveLength(count);
    expect(screen.getAllByTestId('admin-floorplan-surface')).toHaveLength(1);
    await chooseManual();
    expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeEnabled();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledOnce();
  });

  it('operates on Mesa 200 without selection writes, double submit, replay or duplicate create', async () => {
    const shapes = scaleAdminShapes(200);
    const source = floorplan({ shapes });
    const api = preparedFloorplanApi(source);
    let resolveUpdate!: (value: AdminFloorplanShape) => void;
    vi.mocked(api.adminEventPreparation.updateFloorplanShape).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      })
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const surface = await screen.findByTestId('admin-floorplan-surface');
    await userEvent.click(within(surface).getByRole('button', { name: 'Mesa 200' }));
    expect(api.adminEventPreparation.updateFloorplanShape).not.toHaveBeenCalled();
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
    expect((await screen.findAllByText('Mesa seleccionada')).length).toBeGreaterThan(0);
    const name = screen.getAllByLabelText('Nombre o número').at(-1)!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Mesa 200 actualizada');
    const save = enabledButton('Guardar cambios');
    fireEvent.click(save);
    fireEvent.click(save);
    expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledOnce();
    resolveUpdate({ ...shapes.at(-1)!, name: 'Mesa 200 actualizada' });
    await waitFor(() => expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(2));
    expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledOnce();

    expect(api.floorplan.updateShape).not.toHaveBeenCalled();
  });

  it('duplicates Mesa 200 through exactly one Admin POST', async () => {
    const shapes = scaleAdminShapes(200);
    const api = preparedFloorplanApi(floorplan({ shapes }));
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue(
      shape({ ...shapes.at(-1), id: 'table-201', name: 'Mesa 201' })
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    fireEvent.click(
      within(await screen.findByTestId('admin-floorplan-surface')).getByRole('button', { name: 'Mesa 200' })
    );
    fireEvent.click((await screen.findAllByRole('button', { name: 'Duplicar' })).at(-1)!);
    await waitFor(() => expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce());
    expect(api.floorplan.addShape).not.toHaveBeenCalled();
  });

  it('keeps the compact catalog behind one disclosure at 1024x768', async () => {
    setAdminViewportWidth(1024);
    const api = preparedFloorplanApi(floorplan({ shapes: scaleAdminShapes(200) }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByTestId('admin-floorplan-surface', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mesa redonda' })).not.toBeInTheDocument();
    await chooseManual();
    expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preparar dos mesas' })).toBeInTheDocument();
  });

  it('keeps multi-table inventory available from the provider palette', async () => {
    const api = preparedFloorplanApi();
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Crear varias mesas' }))[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Preparar dos mesas' }));
    expect(await screen.findByText('Mesas pendientes')).toBeInTheDocument();
  });

  it('disables Builder mutations while the authoritative Floorplan is locked', async () => {
    const api = preparedFloorplanApi(
      floorplan({ locked: true, lockedAt: adminEvent.updatedAt, shapes: scaleAdminShapes(200) })
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await screen.findByTestId('admin-floorplan-surface');
    expect(floorplanHarness.props?.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Pista' })).not.toBeInTheDocument();
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
  });

  it('cancels and switches unpersisted Sticker drafts without creating orphan shapes', async () => {
    const api = preparedFloorplanApi();
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseStickerAndPlace('Mesa redonda');
    await userEvent.click(enabledButton('Cancelar'));
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();

    await chooseStickerAndPlace('Mesa redonda');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Pista' }))[0]!);
    expect(screen.queryByLabelText('Nombre o número')).not.toBeInTheDocument();
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
    act(() => canvasPlace()({ x: 0.5, y: 0.5 }));
    expect((await screen.findAllByDisplayValue('Pista')).length).toBeGreaterThan(0);
  });

  it('persists Texto / etiqueta as an ordinary decorative zone', async () => {
    const api = preparedFloorplanApi();
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue(
      shape({ id: 'label-a', name: 'Etiqueta', kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0 })
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseStickerAndPlace('Texto / etiqueta');
    await userEvent.click(enabledButton('Agregar zona'));
    await waitFor(() => expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce());
    expect(vi.mocked(api.adminEventPreparation.createFloorplanShape).mock.calls[0]![2]).toEqual(
      expect.objectContaining({
        name: 'Etiqueta',
        kind: 'DECORATIVE_ZONE',
        geometry: 'RECTANGLE',
        capacity: 0,
        width: 0.18,
        height: 0.05
      })
    );
  });

  it('duplicates a table through one Admin create without copying derived fields or replaying after refresh failure', async () => {
    const table = shape({ name: 'Mesa principal', occupancy: 4, availableCapacity: 4 });
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    const duplicateShape = shape({ id: 'table-copy', name: 'Mesa 1', x: 0.12, y: 0.12 });
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue(duplicateShape);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(floorplan({ shapes: [table] }))
      .mockRejectedValueOnce(new Error('refresh'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(
      within(await screen.findByTestId('admin-floorplan-surface')).getByRole('button', { name: table.name })
    );
    await userEvent.click((await screen.findAllByRole('button', { name: 'Duplicar' })).at(-1)!);
    expect(await screen.findByText('Guardado · falta actualizar')).toBeInTheDocument();
    expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
    const payload = vi.mocked(api.adminEventPreparation.createFloorplanShape).mock.calls[0]![2];
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Mesa 1',
        kind: table.kind,
        geometry: table.geometry,
        capacity: table.capacity
      })
    );
    expect(payload.x).toBeCloseTo(0.12);
    expect(payload.y).toBeCloseTo(0.12);
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('occupancy');
    expect(payload).not.toHaveProperty('availableCapacity');
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
  });

  it('duplicates a decorative zone with capacity zero and a natural unique name', async () => {
    const zone = shape({ id: 'zone-a', name: 'Pista', kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0 });
    const api = preparedFloorplanApi(floorplan({ shapes: [zone] }));
    vi.mocked(api.adminEventPreparation.createFloorplanShape).mockResolvedValue({
      ...zone,
      id: 'zone-b',
      name: 'Pista 2'
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await userEvent.click(
      within(await screen.findByTestId('admin-floorplan-surface')).getByRole('button', { name: zone.name })
    );
    await userEvent.click((await screen.findAllByRole('button', { name: 'Duplicar' })).at(-1)!);
    await waitFor(() => expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce());
    expect(vi.mocked(api.adminEventPreparation.createFloorplanShape).mock.calls[0]![2]).toEqual(
      expect.objectContaining({ name: 'Pista 2', kind: 'DECORATIVE_ZONE', capacity: 0 })
    );
  });

  it.each([
    ['plano.txt', 'text/plain'],
    ['salon.svg.exe', ''],
    ['salon.png.txt', ''],
    ['salon.jpg.exe', '']
  ])('rejects a non-image upload before calling the Admin asset API: %s', async (name, type) => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, floorplanEnabled: true });
    vi.mocked(api.adminEventPreparation.getFloorplan).mockRejectedValue(
      new ApiError(404, 'FLOORPLAN_NOT_FOUND', 'not found')
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const input = (await screen.findByRole('button', { name: 'Subir plano' })).querySelector('input')!;
    fireEvent.change(input, { target: { files: [new File(['text'], name, { type })] } });
    expect(await screen.findByText('Selecciona una imagen JPG, PNG o SVG.')).toBeInTheDocument();
    expect(api.adminEventPreparation.uploadFloorplanAsset).not.toHaveBeenCalled();
    expect(api.adminEventPreparation.uploadFloorplanSvgAsset).not.toHaveBeenCalled();
  });

  it('revokes the private image Object URL when the Builder unmounts', async () => {
    const api = preparedFloorplanApi();
    const view = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await screen.findByTestId('admin-floorplan-surface');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:admin-floorplan');
  });

  it('recovers a concurrency conflict through one PATCH and one authoritative refetch without replay', async () => {
    const table = shape();
    const authoritative = floorplan({ shapes: [{ ...table, name: 'Mesa externa', x: 0.4 }] });
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(floorplan({ shapes: [table] }))
      .mockResolvedValueOnce(authoritative);
    vi.mocked(api.adminEventPreparation.updateFloorplanShape).mockRejectedValue(
      new ApiError(409, 'FLOORPLAN_CONCURRENCY_CONFLICT', 'serialization')
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: table.name }));
    const name = screen.getAllByLabelText('Nombre o número').at(-1)!;
    await userEvent.clear(name);
    await userEvent.type(name, 'Cambio local');
    await userEvent.click(enabledButton('Guardar cambios'));
    expect(await screen.findByText(/cambió al mismo tiempo/i)).toBeInTheDocument();
    expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Mesa seleccionada')).not.toBeInTheDocument();
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes[0]?.name).toBe('Mesa externa');
  });

  it('adopts an external lock, exits the editor and blocks further mutations', async () => {
    const table = shape();
    const locked = floorplan({ shapes: [table], locked: true, lockedAt: adminEvent.updatedAt });
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(floorplan({ shapes: [table] }))
      .mockResolvedValueOnce(locked);
    vi.mocked(api.adminEventPreparation.updateFloorplanShape).mockRejectedValue(
      new ApiError(409, 'FLOORPLAN_LAYOUT_LOCKED', 'locked')
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: table.name }));
    await userEvent.click(enabledButton('Guardar cambios'));
    expect(await screen.findByRole('button', { name: 'Editar distribución' })).toBeInTheDocument();
    expect((floorplanHarness.props?.disabled as boolean) ?? false).toBe(true);
    expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledOnce();
  });

  it('closes a stale inspector when the selected shape disappeared externally', async () => {
    const table = shape();
    const api = preparedFloorplanApi(floorplan({ shapes: [table] }));
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(floorplan({ shapes: [table] }))
      .mockResolvedValueOnce(floorplan({ shapes: [] }));
    vi.mocked(api.adminEventPreparation.updateFloorplanShape).mockRejectedValue(
      new ApiError(404, 'FLOORPLAN_SHAPE_NOT_FOUND', 'missing')
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: table.name }));
    await userEvent.click(enabledButton('Guardar cambios'));
    expect(await screen.findByText(/ya no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByText('Mesa seleccionada')).not.toBeInTheDocument();
    expect(api.adminEventPreparation.updateFloorplanShape).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.createFloorplanShape).not.toHaveBeenCalled();
  });

  it('enables beforeunload only for unsaved draft changes and clears it on cancel', async () => {
    const api = preparedFloorplanApi();
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await screen.findByTestId('admin-floorplan-surface');
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await chooseStickerAndPlace('Mesa redonda');
    await screen.findByText('Cambios sin guardar');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);

    await userEvent.click(enabledButton('Cancelar'));
    await screen.findByText('Guardado');
    const cancelled = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cancelled);
    expect(cancelled.defaultPrevented).toBe(false);
  });

  it('keeps pending inventory dirty until its local work is resolved', async () => {
    const api = preparedFloorplanApi();
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Crear varias mesas' }))[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Preparar dos mesas' }));
    await screen.findByText('Cambios sin guardar');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('blocks internal navigation only while local Croquis work is dirty', async () => {
    const api = preparedFloorplanApi();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const view = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseStickerAndPlace('Mesa redonda');
    await screen.findByText('Cambios sin guardar');
    void view.router.navigate(`/eventos/${adminEvent.id}/preparar/datos`);
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(view.router.state.location.pathname).toBe(`/eventos/${adminEvent.id}/preparar/croquis`);

    await userEvent.click(enabledButton('Cancelar'));
    await screen.findByText('Guardado');
    await view.router.navigate(`/eventos/${adminEvent.id}/preparar/datos`);
    expect(view.router.state.location.pathname).toBe(`/eventos/${adminEvent.id}/preparar/datos`);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('does not repeat a confirmed background upload/PATCH when reconciliation fails', async () => {
    const original = floorplan({ shapes: [shape()] });
    const replacement = floorplan({
      shapes: original.shapes,
      image: { fileAssetId: 'asset-replacement', contentPath: '/private/new', sourceType: 'RASTER' }
    });
    const api = preparedFloorplanApi(original);
    vi.mocked(api.adminEventPreparation.uploadFloorplanAsset).mockResolvedValue(
      floorplanAsset({ id: 'asset-replacement' })
    );
    vi.mocked(api.adminEventPreparation.replaceFloorplanImage).mockResolvedValue(replacement);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockResolvedValueOnce(original)
      .mockRejectedValueOnce(new Error('refresh'))
      .mockResolvedValueOnce(replacement);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const button = await screen.findByRole('button', { name: 'Cambiar plano' });
    await userEvent.upload(button.querySelector('input')!, new File(['next'], 'nuevo.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText('Guardado · falta actualizar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    expect(api.adminEventPreparation.uploadFloorplanAsset).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.replaceFloorplanImage).toHaveBeenCalledOnce();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledTimes(3);
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toEqual(original.shapes);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:admin-floorplan');
  });

  it('keeps an occupied table after one rejected DELETE with natural copy', async () => {
    const table = shape({ occupancy: 2, availableCapacity: 6 });
    const current = floorplan({ shapes: [table] });
    const api = preparedFloorplanApi(current);
    vi.mocked(api.adminEventPreparation.removeFloorplanShape).mockRejectedValue(
      new ApiError(409, 'FLOORPLAN_TABLE_OCCUPIED', 'occupied')
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await userEvent.click(await screen.findByRole('button', { name: table.name }));
    await userEvent.click(enabledButton('Eliminar mesa'));
    expect(await screen.findByText(/tiene lugares asignados/i)).toBeInTheDocument();
    expect(api.adminEventPreparation.removeFloorplanShape).toHaveBeenCalledOnce();
    expect((floorplanHarness.props?.floorplan as AdminFloorplan).shapes).toContainEqual(table);
  });

  it('keeps the primary seat within the additive selection', async () => {
    const table = shape({ id: 'table-selection', capacity: 2, availableCapacity: 2 });
    const [firstSeat, secondSeat] = serpentineSeats(table.id);
    const api = preparedFloorplanApi(
      floorplan({ seatingMode: 'SEAT', shapes: [table], seats: [firstSeat!, secondSeat!] })
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await screen.findByTestId('admin-floorplan-surface');

    act(() => {
      (floorplanHarness.props?.onSeatSelect as (seatId: string, options: { additive: boolean }) => void)(
        firstSeat!.id,
        {
          additive: false
        }
      );
      (floorplanHarness.props?.onSeatSelect as (seatId: string, options: { additive: boolean }) => void)(
        secondSeat!.id,
        {
          additive: true
        }
      );
    });
    await waitFor(() => expect(floorplanHarness.props?.selectedSeatId).toBe(secondSeat!.id));
    expect(floorplanHarness.props?.selectedSeatIds).toEqual([firstSeat!.id, secondSeat!.id]);

    act(() => {
      (floorplanHarness.props?.onSeatSelect as (seatId: string, options: { additive: boolean }) => void)(
        secondSeat!.id,
        {
          additive: true
        }
      );
    });
    await waitFor(() => expect(floorplanHarness.props?.selectedSeatId).toBe(firstSeat!.id));
    expect(floorplanHarness.props?.selectedSeatIds).toEqual([firstSeat!.id]);
  });

  it('reconciles primary and additive seat selection when a reload no longer contains the seat', async () => {
    const table = shape({ id: 'table-reload', capacity: 1, availableCapacity: 1 });
    const seat: AdminFloorplanSeat = {
      id: 'seat-reload',
      floorplanShapeId: table.id,
      label: 'Lugar 1',
      x: 0.2,
      y: 0.2,
      isBlocked: false,
      occupied: false
    };
    const initial = floorplan({ seatingMode: 'SEAT', shapes: [table], seats: [seat] });
    const reloaded = floorplan({ seatingMode: 'SEAT', shapes: [table], seats: [] });
    const api = preparedFloorplanApi(initial);
    vi.mocked(api.adminEventPreparation.getFloorplan)
      .mockReset()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(reloaded);
    vi.mocked(api.adminEventPreparation.updateFloorplanSeat).mockResolvedValue({ ...seat, isBlocked: true });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await userEvent.click(await screen.findByRole('button', { name: seat.label }));
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => expect(floorplanHarness.props?.floorplan).toEqual(reloaded));
    expect(floorplanHarness.props?.selectedSeatId).toBeUndefined();
    expect(floorplanHarness.props?.selectedSeatIds).toEqual([]);
  });

  it('requires explicit confirmation before changing detailed seating to table seating', async () => {
    const api = preparedFloorplanApi(floorplan({ seatingMode: 'SEAT' }));
    vi.mocked(api.adminEventPreparation.setFloorplanSeatingMode).mockResolvedValue(floorplan({ seatingMode: 'TABLE' }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const chooseTableMode = async () => {
      await userEvent.click(await screen.findByLabelText('Acomodo'));
      await userEvent.click(await screen.findByRole('option', { name: 'Por mesa' }));
    };

    await chooseTableMode();
    expect(await screen.findByRole('heading', { name: '¿Cambiar a acomodo por mesa?' })).toBeInTheDocument();
    expect(
      screen.getByText('Las personas conservarán su mesa, pero dejarán de tener un lugar exacto asignado.')
    ).toBeInTheDocument();
    expect(api.adminEventPreparation.setFloorplanSeatingMode).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.adminEventPreparation.setFloorplanSeatingMode).not.toHaveBeenCalled();

    await chooseTableMode();
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a mesas' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.setFloorplanSeatingMode).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        'TABLE'
      )
    );
  });

  it('uses only Admin provider controls for detailed-seat mutations', async () => {
    const table = shape({ id: 'table-seats', capacity: 1, availableCapacity: 1 });
    const seat: AdminFloorplanSeat = {
      id: 'seat-1',
      floorplanShapeId: table.id,
      label: 'Lugar 1',
      x: 0.2,
      y: 0.2,
      isBlocked: false,
      occupied: false
    };
    const api = preparedFloorplanApi(floorplan({ seatingMode: 'SEAT', shapes: [table], seats: [seat] }));
    vi.mocked(api.adminEventPreparation.updateFloorplanSeat).mockImplementation(
      async (_client, _event, _id, input) => ({
        ...seat,
        ...input
      })
    );
    vi.mocked(api.adminEventPreparation.createFloorplanSeat).mockResolvedValue({
      ...seat,
      id: 'seat-2',
      label: 'Lugar 1 2',
      x: 0.22,
      y: 0.22
    });
    vi.mocked(api.adminEventPreparation.removeFloorplanSeat).mockResolvedValue(undefined);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await screen.findByTestId('admin-floorplan-surface');
    await userEvent.click(await screen.findByRole('button', { name: seat.label }));
    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    await userEvent.clear(screen.getByLabelText('Nombre del lugar'));
    await userEvent.type(screen.getByLabelText('Nombre del lugar'), 'Lugar de honor');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.updateFloorplanSeat).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        seat.id,
        { label: 'Lugar de honor' }
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renombrar lugar' })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.updateFloorplanSeat).toHaveBeenLastCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        seat.id,
        { isBlocked: true }
      )
    );
    await userEvent.click(screen.getByRole('button', { name: 'Duplicar' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.createFloorplanSeat).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        table.id,
        { label: 'Lugar 1 2', x: 0.22, y: 0.22 }
      )
    );
    act(() => {
      (floorplanHarness.props?.onSeatSelect as (seatId: string, options: { additive: boolean }) => void)(seat.id, {
        additive: false
      });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Lugar 1' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.removeFloorplanSeat).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        seat.id
      )
    );
    expect(api.floorplan.updateShape).not.toHaveBeenCalled();
  });

  it('keeps seat rename local until a changed label is submitted from its dialog', async () => {
    const table = shape({ id: 'table-rename', name: 'Mesa de honor', capacity: 1, availableCapacity: 1 });
    const seat: AdminFloorplanSeat = {
      id: 'seat-rename',
      floorplanShapeId: table.id,
      label: 'Lugar 1',
      x: 0.2,
      y: 0.2,
      isBlocked: false,
      occupied: false
    };
    const api = preparedFloorplanApi(floorplan({ seatingMode: 'SEAT', shapes: [table], seats: [seat] }));
    vi.mocked(api.adminEventPreparation.updateFloorplanSeat).mockResolvedValue({ ...seat, label: 'Lugar de honor' });

    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseManual();
    await screen.findByTestId('admin-floorplan-surface');
    await userEvent.click(await screen.findByRole('button', { name: seat.label }));
    expect(await screen.findByText('Lugar 1 · Mesa de honor')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    expect(screen.getByLabelText('Nombre del lugar')).toHaveValue('Lugar 1');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renombrar lugar' })).not.toBeInTheDocument());
    expect(api.adminEventPreparation.updateFloorplanSeat).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renombrar lugar' })).not.toBeInTheDocument());
    expect(api.adminEventPreparation.updateFloorplanSeat).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    await userEvent.clear(screen.getByLabelText('Nombre del lugar'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renombrar lugar' })).not.toBeInTheDocument());
    expect(api.adminEventPreparation.updateFloorplanSeat).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    const label = screen.getByLabelText('Nombre del lugar');
    await userEvent.clear(label);
    await userEvent.type(label, 'Lugar de honor{Enter}');
    await waitFor(() =>
      expect(api.adminEventPreparation.updateFloorplanSeat).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        seat.id,
        { label: 'Lugar de honor' }
      )
    );
    expect(api.adminEventPreparation.updateFloorplanSeat).toHaveBeenCalledOnce();
  });

  it('moves a Serpentina selection as one Admin batch and renumbers it collision-safely', async () => {
    const table = shape({ id: 'table-serpentina', capacity: 3, availableCapacity: 3 });
    const seats = serpentineSeats(table.id);
    const api = preparedFloorplanApi(floorplan({ seatingMode: 'SEAT', shapes: [table], seats }));
    vi.mocked(api.adminEventPreparation.batchFloorplanSeats).mockImplementation(async (_client, _event, body) =>
      body.seats.map((update) => ({ ...seats.find((seat) => seat.id === update.seatId)!, ...update }))
    );
    vi.mocked(api.adminEventPreparation.renumberFloorplanSeats).mockImplementation(async (_client, _event, body) =>
      body.seatIds.map((seatId, index) => ({
        ...seats.find((seat) => seat.id === seatId)!,
        label: `Lugar ${index + 1}`
      }))
    );

    // This route resolves auth, Event, Client and Floorplan asynchronously.
    // Drain the React work before observing its surface or driving its callbacks.
    await act(async () => {
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    });
    await screen.findByTestId('admin-floorplan-surface');
    await chooseManual();
    await act(async () => {
      (floorplanHarness.props?.onSeatSelect as (seatId: string, options: { additive: boolean }) => void)('seat-s1', {
        additive: false
      });
      (floorplanHarness.props?.onSeatSelect as (seatId: string, options: { additive: boolean }) => void)('seat-s2', {
        additive: true
      });
    });
    expect(await screen.findByText('2 lugares seleccionados')).toBeInTheDocument();
    expect(screen.getByText('Asiento B · Mesa Principal')).toBeInTheDocument();
    expect(screen.getByText('Las acciones siguientes se aplican solo a Asiento B.')).toBeInTheDocument();
    await act(async () => {
      (floorplanHarness.props?.onSeatMove as (seatId: string, point: { x: number; y: number }) => void)('seat-s1', {
        x: 0.3,
        y: 0.3
      });
    });
    await waitFor(() => expect(api.adminEventPreparation.batchFloorplanSeats).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.adminEventPreparation.batchFloorplanSeats).mock.calls[0]![2].seats).toEqual([
      expect.objectContaining({ seatId: 'seat-s1', x: expect.closeTo(0.3), y: expect.closeTo(0.3) }),
      expect.objectContaining({ seatId: 'seat-s2', x: expect.closeTo(0.4), y: expect.closeTo(0.3) })
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Renumerar lugares' }));
    await waitFor(() => expect(api.adminEventPreparation.renumberFloorplanSeats).toHaveBeenCalledTimes(1));
    expect(api.adminEventPreparation.renumberFloorplanSeats).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
      seatIds: ['seat-s1', 'seat-s2', 'seat-s3']
    });
  });
});

function asset(id: string, fileType: 'FLYER_INITIAL_IMAGE' | 'FLYER_QR_IMAGE') {
  return {
    id,
    eventId: adminEvent.id,
    fileType,
    ownerType: 'FLYER' as const,
    ownerId: null,
    status: 'READY' as const,
    mimeType: 'image/png',
    sizeBytes: 1,
    storageProvider: 'LOCAL' as const,
    originalName: `${id}.png`,
    createdAt: adminEvent.createdAt,
    updatedAt: adminEvent.updatedAt,
    deletedAt: null
  };
}

function preparedFloorplanApi(value: AdminFloorplan = floorplan()) {
  const api = mockAdminApi();
  vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, floorplanEnabled: true });
  vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue(value);
  vi.mocked(api.adminEventPreparation.floorplanAssetContent).mockResolvedValue(new Blob(['image']));
  return api;
}

function traceFixture() {
  let current = floorplan({ seatingMode: 'SEAT', shapes: [shape({ capacity: 0, availableCapacity: 0 })] });
  const api = preparedFloorplanApi(current);
  let sequence = 0;
  vi.mocked(api.adminEventPreparation.getFloorplan).mockImplementation(async () => current);
  vi.mocked(api.adminEventPreparation.createFloorplanSeat).mockImplementation(
    async (_client, _event, parentId, input) => {
      const created: AdminFloorplanSeat = {
        ...input,
        id: `confirmed-uuid-${++sequence}`,
        floorplanShapeId: parentId,
        isBlocked: false,
        occupied: false
      };
      current = {
        ...current,
        seats: [...current.seats, created],
        shapes: current.shapes.map((table) =>
          table.id === parentId
            ? { ...table, capacity: current.seats.filter((seat) => seat.floorplanShapeId === parentId).length + 1 }
            : table
        )
      };
      return created;
    }
  );
  return {
    api,
    get state() {
      return current;
    },
    set state(value: AdminFloorplan) {
      current = value;
    }
  };
}

async function openTraceParent(api: ReturnType<typeof preparedFloorplanApi>) {
  const view = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
  await screen.findByTestId('admin-floorplan-surface');
  await userEvent.click(screen.getByRole('button', { name: 'Calcar distribución' }));
  await userEvent.click(screen.getByRole('button', { name: 'Mesa Principal' }));
  expect(screen.getByRole('button', { name: 'Trazar lugares' })).toBeEnabled();
  return view;
}

function floorplan(overrides: Partial<AdminFloorplan> = {}): AdminFloorplan {
  return {
    id: 'floorplan-1',
    eventId: adminEvent.id,
    image: { fileAssetId: 'asset-floorplan', contentPath: '/private', sourceType: 'RASTER' },
    locked: false,
    lockedAt: null,
    seatingMode: 'TABLE',
    seats: [],
    shapes: [],
    createdAt: adminEvent.createdAt,
    updatedAt: adminEvent.updatedAt,
    ...overrides
  };
}

function serpentineSeats(floorplanShapeId: string): AdminFloorplanSeat[] {
  return [
    { id: 'seat-s1', floorplanShapeId, label: 'Asiento A', x: 0.2, y: 0.2, isBlocked: false, occupied: false },
    { id: 'seat-s2', floorplanShapeId, label: 'Asiento B', x: 0.3, y: 0.2, isBlocked: false, occupied: false },
    { id: 'seat-s3', floorplanShapeId, label: 'Asiento C', x: 0.3, y: 0.3, isBlocked: false, occupied: false }
  ];
}

function shape(overrides: Partial<AdminFloorplanShape> = {}): AdminFloorplanShape {
  return {
    id: 'table-a',
    name: 'Mesa Principal',
    kind: 'TABLE',
    geometry: 'CIRCLE',
    capacity: 8,
    sourceElementId: null,
    occupancy: 0,
    availableCapacity: 8,
    x: 0.1,
    y: 0.1,
    width: 0.18,
    height: 0.18,
    rotation: 0,
    polygonPoints: null,
    ...overrides
  };
}

function scaleAdminShapes(count: number): AdminFloorplanShape[] {
  return Array.from({ length: count }, (_, index) =>
    shape({
      id: `scale-admin-table-${index + 1}`,
      name: `Mesa ${index + 1}`,
      capacity: 10,
      availableCapacity: 10,
      x: 0.005 + (index % 20) * 0.048,
      y: 0.005 + Math.floor(index / 20) * 0.09,
      width: 0.035,
      height: 0.035
    })
  );
}

function setAdminViewportWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const maxWidth = Number(/max-width:\s*([\d.]+)px/u.exec(query)?.[1]);
      return {
        matches: Number.isFinite(maxWidth) && width <= maxWidth,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      };
    })
  });
}

function floorplanAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-floorplan',
    eventId: adminEvent.id,
    fileType: 'FLOORPLAN_IMAGE' as const,
    ownerType: 'FLOORPLAN' as const,
    ownerId: null,
    status: 'READY' as const,
    mimeType: 'image/png',
    sizeBytes: 1,
    storageProvider: 'LOCAL' as const,
    originalName: 'salon.png',
    createdAt: adminEvent.createdAt,
    updatedAt: adminEvent.updatedAt,
    deletedAt: null,
    ...overrides
  };
}

function svgSource(fileAssetId: string): AdminFloorplanSvgSource {
  return {
    fileAssetId,
    aspectRatio: 1,
    viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
    selectableElements: []
  };
}

function enabledButton(name: string) {
  return screen.getAllByRole('button', { name }).find((button) => !button.hasAttribute('disabled'))!;
}

function canvasPlace() {
  return floorplanHarness.props?.onCanvasPlace as (point: { x: number; y: number }) => void;
}

function selectTraceSeat(id: string, additive = false) {
  (floorplanHarness.props?.onSeatSelect as (id: string, options: { additive: boolean }) => void)(id, { additive });
}
function moveTraceSeat(id: string, point: { x: number; y: number }) {
  return (floorplanHarness.props?.onSeatMove as (id: string, point: { x: number; y: number }) => void)(id, point);
}

async function chooseStickerAndPlace(label: string, point = { x: 0.5, y: 0.5 }) {
  await chooseManual();
  await userEvent.click((await screen.findAllByRole('button', { name: label }))[0]!);
  expect(canvasPlace()).toEqual(expect.any(Function));
  act(() => canvasPlace()(point));
}

async function chooseManual() {
  const button = await screen.findByRole('button', { name: 'Manual' });
  if (button.getAttribute('aria-pressed') !== 'true') await userEvent.click(button);
}

function expectNoSeatWrites(api: ReturnType<typeof preparedFloorplanApi>) {
  expect(api.adminEventPreparation.createFloorplanSeat).not.toHaveBeenCalled();
  expect(api.adminEventPreparation.updateFloorplanSeat).not.toHaveBeenCalled();
  expect(api.adminEventPreparation.batchFloorplanSeats).not.toHaveBeenCalled();
  expect(api.adminEventPreparation.renumberFloorplanSeats).not.toHaveBeenCalled();
  expect(api.adminEventPreparation.removeFloorplanSeat).not.toHaveBeenCalled();
}

function catalogPrice(serviceId: string, serviceCode: AdminPrice['serviceCode']): AdminPrice {
  return {
    id: 'catalog-price',
    serviceId,
    serviceCode,
    pricingVersion: 2,
    clientType: null,
    commercialChannel: 'STANDARD',
    capacityMin: 1,
    capacityMax: 150,
    venueTier: null,
    credits: 10,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function managedPlannerClient() {
  return {
    ...organization,
    id: adminEvent.clientId,
    type: 'PLANNER' as const,
    operatingProfile: 'MANAGED' as const
  };
}

function managedReadyEvent(): AdminEvent {
  return {
    ...adminEvent,
    assignedPlannerUserId: 'planner-managed',
    status: 'READY_TO_ACTIVATE',
    commercialAuthorizedAt: null,
    commercialPriceLockedAt: null,
    commercialServicePriceId: null,
    commercialBaseCostCredits: null,
    commercialPromotionDiscountCredits: null,
    commercialFinalCostCredits: null,
    commercialChannelSnapshot: null,
    commercialCapacitySnapshot: null,
    designKickoffAt: null,
    commercialTermsValid: false,
    activatedAt: null,
    activatedByUserId: null,
    activatedServiceId: null,
    activatedServicePriceId: null,
    baseCostCredits: null,
    promotionDiscountCredits: null,
    finalCostCredits: null,
    purchasedCreditsUsed: null,
    creditLineCreditsUsed: null,
    creditUnitValueMxnCentsSnapshot: null,
    activationReceiptId: null,
    activationIdempotencyKey: null
  };
}
