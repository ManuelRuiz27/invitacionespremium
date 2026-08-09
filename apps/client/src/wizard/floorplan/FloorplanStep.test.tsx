import type { Floorplan, FloorplanShape } from '@invitaciones/api-client';
import { ApiError } from '@invitaciones/api-client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../../test/fixtures';
import { blockerMessage } from '../wizard-utils';
import { FloorplanStep } from './FloorplanStep';

const table: FloorplanShape = {
  id: 'table-1',
  name: 'Mesa principal',
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 8,
  occupancy: 1,
  availableCapacity: 7,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.2,
  rotation: 30,
  polygonPoints: null
};

const zone: FloorplanShape = {
  ...table,
  id: 'zone-1',
  name: 'Pista',
  kind: 'DECORATIVE_ZONE',
  geometry: 'RECTANGLE',
  capacity: 0,
  occupancy: 0,
  availableCapacity: 0,
  x: 0.4,
  y: 0.35,
  width: 0.3,
  height: 0.18,
  rotation: 0
};

const floorplan: Floorplan = {
  id: 'floorplan-1',
  eventId: configuredEvent.id,
  image: { fileAssetId: 'floorplan-image', contentPath: '/private' },
  locked: false,
  lockedAt: null,
  shapes: [table, zone],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

function renderEditor(options: { current?: Floorplan; disabled?: boolean } = {}) {
  const api = mockApiClient();
  const onChange = vi.fn();
  const current = options.current ?? floorplan;
  vi.mocked(api.floorplan.get).mockResolvedValue(current);
  vi.mocked(api.floorplan.addShape).mockResolvedValue(table);
  vi.mocked(api.floorplan.updateShape).mockResolvedValue(table);
  vi.mocked(api.floorplan.removeShape).mockResolvedValue(undefined);
  vi.mocked(api.floorplan.lock).mockResolvedValue({ ...current, locked: true, lockedAt: '2026-01-01T00:00:00Z' });
  vi.mocked(api.floorplan.unlock).mockResolvedValue({ ...current, locked: false, lockedAt: null });
  vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  const view = render(
    <FloorplanStep
      apiClient={api}
      event={{ ...configuredEvent, floorplanEnabled: true }}
      draft={{ confirmationEnabled: false, floorplanEnabled: true }}
      disabled={options.disabled ?? false}
      onChange={onChange}
    />
  );
  return { api, onChange, ...view };
}

function mockObservedOwner(initialWidth: number, initialHeight: number) {
  let callback: ResizeObserverCallback | undefined;
  let target: Element | undefined;
  let observer: ResizeObserver | undefined;
  const emit = (width: number, height: number) => {
    if (!callback || !target || !observer) return;
    callback([{ target, contentRect: { width, height } } as ResizeObserverEntry], observer);
  };
  class ResizeObserverStub {
    constructor(nextCallback: ResizeObserverCallback) {
      callback = nextCallback;
      observer = this as unknown as ResizeObserver;
    }
    observe(nextTarget: Element) {
      target = nextTarget;
      emit(initialWidth, initialHeight);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  return (width: number, height: number) => act(() => emit(width, height));
}

describe('FloorplanStep', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:floorplan') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses natural copy and never renders the technical inspector', async () => {
    const { container } = renderEditor();
    expect(await screen.findByRole('heading', { name: 'Mesas y distribución' })).toBeInTheDocument();
    expect(screen.getByText('Organiza las mesas y áreas de tu evento sobre el plano del lugar.')).toBeInTheDocument();
    expect(screen.getByText('Lugares distribuidos: 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar mesa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar zona' })).toBeInTheDocument();
    const visible = container.textContent ?? '';
    for (const forbidden of [
      'TABLE',
      'DECORATIVE_ZONE',
      'RECTANGLE',
      'SQUARE',
      'CIRCLE',
      'POLYGON',
      'Puntos del polígono',
      'Guardar forma',
      'Bloquear Croquis'
    ]) {
      expect(visible).not.toContain(forbidden);
    }
    for (const technicalField of ['x', 'y', 'width', 'height', 'rotation']) {
      expect(screen.queryByLabelText(technicalField)).not.toBeInTheDocument();
    }
    expect(blockerMessage('EVENT_FLOORPLAN_INCOMPLETE')).toBe('Agrega el plano del lugar y al menos una mesa.');
  });

  it.each([
    ['Redonda', 'CIRCLE'],
    ['Cuadrada', 'SQUARE'],
    ['Rectangular', 'RECTANGLE']
  ] as const)('creates a table using the visible %s shape and the existing %s payload', async (label, geometry) => {
    const { api } = renderEditor();
    await screen.findByAltText('Plano del lugar');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    await userEvent.type(screen.getByLabelText('Nombre o número de mesa'), `Mesa ${label}`);
    if (label !== 'Redonda') {
      await userEvent.click(screen.getByRole('combobox', { name: 'Forma' }));
      await userEvent.click(screen.getByRole('option', { name: label }));
    }
    await userEvent.clear(screen.getByLabelText('Número de lugares'));
    await userEvent.type(screen.getByLabelText('Número de lugares'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar mesa' }));
    await waitFor(() =>
      expect(api.floorplan.addShape).toHaveBeenCalledWith(
        configuredEvent.id,
        expect.objectContaining({ name: `Mesa ${label}`, kind: 'TABLE', geometry, capacity: 10 })
      )
    );
    const payload = vi.mocked(api.floorplan.addShape).mock.calls.at(-1)?.[1];
    if (geometry === 'CIRCLE' || geometry === 'SQUARE') expect(payload?.width).toBe(payload?.height);
  });

  it('creates a zone with internal capacity zero and offers a visual custom shape', async () => {
    const { api } = renderEditor();
    await screen.findByAltText('Plano del lugar');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar zona' }));
    expect(screen.queryByLabelText('Número de lugares')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre de la zona'), 'Barra');
    await userEvent.click(screen.getByRole('combobox', { name: 'Forma' }));
    await userEvent.click(screen.getByRole('option', { name: 'Forma personalizada' }));
    const vertices = screen.getAllByRole('button', { name: /Mover punto \d de la forma personalizada/ });
    expect(vertices).toHaveLength(4);
    expect(vertices[0]).toHaveStyle({ width: '44px', height: '44px', touchAction: 'none' });
    expect(screen.queryByLabelText(/Puntos/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar zona' }));
    expect(api.floorplan.addShape).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ kind: 'DECORATIVE_ZONE', geometry: 'POLYGON', capacity: 0 })
    );
    expect(vi.mocked(api.floorplan.addShape).mock.calls[0]?.[1].polygonPoints).toHaveLength(4);
  });

  it('edits without changing kind and supports keyboard move, resize and rotation controls', async () => {
    const { api } = renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover a la derecha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Hacer más ancho' }));
    await userEvent.click(screen.getByRole('button', { name: 'Girar a la derecha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(api.floorplan.updateShape).toHaveBeenCalledWith(
      configuredEvent.id,
      table.id,
      expect.objectContaining({ kind: 'TABLE', x: 0.11, width: 0.21, height: 0.21, rotation: 45 })
    );
    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument();
  });

  it('protects the active draft from every external floorplan action until cancel', async () => {
    const tableB = { ...table, id: 'table-2', name: 'Mesa secundaria', x: 0.7 };
    const { api, onChange } = renderEditor({ current: { ...floorplan, shapes: [table, tableB, zone] } });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    const name = screen.getByLabelText('Nombre o número de mesa');
    await userEvent.clear(name);
    await userEvent.type(name, 'Mesa A en edición');

    const otherShape = screen.getByRole('button', { name: 'Editar mesa Mesa secundaria', hidden: true });
    const addTable = screen.getByRole('button', { name: 'Agregar mesa' });
    const addZone = screen.getByRole('button', { name: 'Agregar zona' });
    const finalize = screen.getByRole('button', { name: 'Finalizar distribución' });
    const enabled = screen.getByRole('checkbox', { name: 'Usar distribución de mesas' });

    expect(otherShape).toBeDisabled();
    expect(addTable).toBeDisabled();
    expect(addZone).toBeDisabled();
    expect(finalize).toBeDisabled();
    expect(enabled).toBeDisabled();
    fireEvent.click(otherShape);
    fireEvent.click(addTable);
    fireEvent.click(addZone);
    fireEvent.click(finalize);
    fireEvent.click(enabled);

    expect(name).toHaveValue('Mesa A en edición');
    expect(screen.getByRole('heading', { name: 'Editar mesa' })).toBeInTheDocument();
    expect(api.floorplan.lock).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Editar zona Pista' }));
    const zoneName = screen.getByLabelText('Nombre de la zona');
    await userEvent.clear(zoneName);
    await userEvent.type(zoneName, 'Zona en edición');
    const changeImage = screen.getByLabelText('Seleccionar imagen del plano');
    expect(changeImage).toBeDisabled();
    fireEvent.change(changeImage, {
      target: { files: [new File(['image'], 'otro-plano.png', { type: 'image/png' })] }
    });
    expect(zoneName).toHaveValue('Zona en edición');
    expect(api.fileAssets.upload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Agregar mesa' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Agregar zona' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Editar mesa Mesa secundaria' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Editar zona Pista' })).toBeEnabled();
    expect(screen.getByLabelText('Seleccionar imagen del plano')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Finalizar distribución' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Usar distribución de mesas' })).toBeEnabled();
  });

  it('moves and resizes relative to the rendered image surface with pointer and touch-safe targets', async () => {
    const { api } = renderEditor({
      current: { ...floorplan, shapes: [{ ...table, rotation: 0 }, zone] }
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    const canvas = screen.getByLabelText('Plano interactivo de mesas y zonas');
    expect(canvas.querySelector('img')).toBe(screen.getByAltText('Plano del lugar'));
    expect(canvas).not.toHaveStyle({ aspectRatio: '4/3' });
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 500,
      width: 1000,
      height: 500,
      toJSON: () => ({})
    });
    const mover = screen.getByLabelText('Mover mesa seleccionada');
    expect(mover).toHaveStyle({ touchAction: 'none' });
    fireEvent.pointerDown(mover, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 50 });
    fireEvent.pointerMove(mover, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });
    const resize = screen.getByRole('button', { name: 'Cambiar tamaño de Mesa principal' });
    expect(resize).toHaveStyle({ width: '44px', height: '44px', touchAction: 'none' });
    fireEvent.pointerDown(resize, { pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 100 });
    fireEvent.pointerMove(resize, { pointerId: 3, pointerType: 'touch', clientX: 250, clientY: 150 });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const payload = vi.mocked(api.floorplan.updateShape).mock.calls.at(-1)?.[2];
    expect(payload?.x).toBe(0.2);
    expect(payload?.y).toBe(0.2);
    expect(payload?.width).toBe(payload?.height);
    expect(payload?.width).toBeCloseTo(0.3);
  });

  it.each([
    ['Redonda', 'CIRCLE', 800, 800, 160],
    ['Redonda', 'CIRCLE', 1000, 500, 100],
    ['Redonda', 'CIRCLE', 500, 1000, 100],
    ['Cuadrada', 'SQUARE', 800, 800, 160],
    ['Cuadrada', 'SQUARE', 1000, 500, 100],
    ['Cuadrada', 'SQUARE', 500, 1000, 100]
  ] as const)(
    'projects a %s (%s) table to equal physical sides on a %d × %d owner',
    async (_label, geometry, ownerWidth, ownerHeight, physicalSide) => {
      mockObservedOwner(ownerWidth, ownerHeight);
      renderEditor({ current: { ...floorplan, shapes: [{ ...table, geometry, rotation: 0 }] } });
      const overlay = await screen.findByRole('button', { name: 'Editar mesa Mesa principal' });
      const styles = getComputedStyle(overlay);
      expect((Number.parseFloat(styles.width) / 100) * ownerWidth).toBeCloseTo(physicalSide, 8);
      expect((Number.parseFloat(styles.height) / 100) * ownerHeight).toBeCloseTo(physicalSide, 8);
      expect(styles.left).toBe('10%');
      expect(styles.top).toBe('10%');
    }
  );

  it('keeps equal-sided projection and center rotation at 45 degrees', async () => {
    mockObservedOwner(1000, 500);
    renderEditor({ current: { ...floorplan, shapes: [{ ...table, geometry: 'SQUARE', rotation: 45 }] } });
    const overlay = await screen.findByRole('button', { name: 'Editar mesa Mesa principal' });
    expect(overlay).toHaveStyle({ width: '10%', height: '20%', transform: 'rotate(45deg)', transformOrigin: 'center' });
  });

  it.each(['CIRCLE', 'SQUARE'] as const)('keeps the editable %s physically equal-sided', async (geometry) => {
    mockObservedOwner(1000, 500);
    renderEditor({ current: { ...floorplan, shapes: [{ ...table, geometry, rotation: 0 }] } });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    expect(screen.getByRole('group', { name: /Mesa seleccionada/ })).toHaveStyle({ width: '10%', height: '20%' });
  });

  it('reprojects equal-sided shapes when the visual owner changes responsively', async () => {
    const resizeOwner = mockObservedOwner(1000, 500);
    renderEditor({ current: { ...floorplan, shapes: [{ ...table, geometry: 'CIRCLE', rotation: 0 }] } });
    const overlay = await screen.findByRole('button', { name: 'Editar mesa Mesa principal' });
    expect(overlay).toHaveStyle({ width: '10%', height: '20%' });
    resizeOwner(500, 1000);
    await waitFor(() => expect(overlay).toHaveStyle({ width: '20%', height: '10%' }));
  });

  it.each(['RECTANGLE', 'POLYGON'] as const)('keeps direct relative projection for %s', async (geometry) => {
    mockObservedOwner(1000, 500);
    const directShape: FloorplanShape = {
      ...zone,
      geometry,
      polygonPoints:
        geometry === 'POLYGON'
          ? [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 0.5, y: 1 }
            ]
          : null
    };
    renderEditor({ current: { ...floorplan, shapes: [directShape] } });
    expect(await screen.findByRole('button', { name: 'Editar zona Pista' })).toHaveStyle({
      left: '40%',
      top: '35%',
      width: '30%',
      height: '18%'
    });
  });

  it('resizes a rectangle rotated 45 degrees along its local axes', async () => {
    const rotatedZone = { ...zone, rotation: 45 };
    const { api } = renderEditor({ current: { ...floorplan, shapes: [rotatedZone] } });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar zona Pista' }));
    const canvas = screen.getByLabelText('Plano interactivo de mesas y zonas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 500,
      width: 1000,
      height: 500,
      toJSON: () => ({})
    });
    const resize = screen.getByRole('button', { name: 'Cambiar tamaño de Pista' });
    fireEvent.pointerDown(resize, { pointerId: 8, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(resize, {
      pointerId: 8,
      clientX: 170.710678,
      clientY: 170.710678
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const payload = vi.mocked(api.floorplan.updateShape).mock.calls[0]?.[2];
    expect(payload?.width).toBeCloseTo(0.4, 5);
    expect(payload?.height).toBeCloseTo(0.18, 5);
  });

  it.each([
    ['vertical', 600, 1000],
    ['horizontal', 1200, 600],
    ['square', 800, 800]
  ])('keeps %s image bounds as the only relative owner', async (_label, width, height) => {
    renderEditor({ current: { ...floorplan, shapes: [{ ...table, geometry: 'RECTANGLE' }] } });
    const image = await screen.findByAltText('Plano del lugar');
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: width },
      naturalHeight: { configurable: true, value: height }
    });
    fireEvent.load(image);
    const owner = screen.getByLabelText('Plano interactivo de mesas y zonas');
    expect(image.parentElement).toBe(owner);
    expect(image).toHaveStyle({ display: 'block', width: '100%', height: 'auto' });
    const tableButton = screen.getByRole('button', { name: 'Editar mesa Mesa principal' });
    expect(tableButton).toHaveStyle({ left: '10%', top: '10%', width: '20%', height: '20%' });
    expect(owner).not.toHaveStyle({ aspectRatio: '4/3' });
  });

  it('moves a custom-shape vertex visually and preserves polygonPoints in the payload', async () => {
    const polygonZone: FloorplanShape = {
      ...zone,
      geometry: 'POLYGON',
      polygonPoints: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.5, y: 0.9 }
      ]
    };
    const { api } = renderEditor({ current: { ...floorplan, shapes: [polygonZone] } });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar zona Pista' }));
    const canvas = screen.getByLabelText('Plano interactivo de mesas y zonas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      width: 1000,
      height: 600,
      toJSON: () => ({})
    });
    const vertex = screen.getByRole('button', { name: 'Mover punto 1 de la forma personalizada' });
    fireEvent.pointerDown(vertex, { pointerId: 4, pointerType: 'touch', clientX: 30, clientY: 18 });
    fireEvent.pointerMove(vertex, { pointerId: 4, pointerType: 'touch', clientX: 60, clientY: 28.8 });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(vi.mocked(api.floorplan.updateShape).mock.calls[0]?.[2].polygonPoints?.[0]).toEqual({ x: 0.2, y: 0.2 });
  });

  it('moves a rotated custom-shape vertex in the polygon local coordinate system', async () => {
    const polygonZone: FloorplanShape = {
      ...zone,
      rotation: 90,
      geometry: 'POLYGON',
      polygonPoints: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.5, y: 0.9 }
      ]
    };
    const { api } = renderEditor({ current: { ...floorplan, shapes: [polygonZone] } });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar zona Pista' }));
    const canvas = screen.getByLabelText('Plano interactivo de mesas y zonas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      width: 1000,
      height: 600,
      toJSON: () => ({})
    });
    const vertex = screen.getByRole('button', { name: 'Mover punto 1 de la forma personalizada' });
    fireEvent.pointerDown(vertex, { pointerId: 9, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(vertex, { pointerId: 9, clientX: 100, clientY: 130 });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const point = vi.mocked(api.floorplan.updateShape).mock.calls[0]?.[2].polygonPoints?.[0];
    expect(point?.x).toBeCloseTo(0.2, 5);
    expect(point?.y).toBeCloseTo(0.1, 5);
  });

  it('projects lock and unlock as finalizing and editing while keeping the plan readable', async () => {
    const { api, rerender } = renderEditor();
    await screen.findByAltText('Plano del lugar');
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar distribución' }));
    expect(api.floorplan.lock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Editar distribución' })).toBeInTheDocument();
    expect(screen.getByText('Mesa principal')).toBeInTheDocument();
    rerender(
      <FloorplanStep
        apiClient={api}
        event={{ ...configuredEvent, floorplanEnabled: true }}
        draft={{ confirmationEnabled: false, floorplanEnabled: true }}
        disabled={false}
        onChange={vi.fn()}
      />
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar distribución' }));
    expect(api.floorplan.unlock).toHaveBeenCalledTimes(1);
  });

  it('preserves the draft after save failure, blocks duplicate submit and allows retry', async () => {
    const { api } = renderEditor();
    await screen.findByAltText('Plano del lugar');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    await userEvent.type(screen.getByLabelText('Nombre o número de mesa'), 'Mesa 12');
    let reject!: (reason: unknown) => void;
    vi.mocked(api.floorplan.addShape).mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    const save = screen.getByRole('button', { name: 'Guardar mesa' });
    await userEvent.click(save);
    fireEvent.click(save);
    expect(api.floorplan.addShape).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error('network')));
    expect(await screen.findByText(/No pudimos guardar los cambios/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre o número de mesa')).toHaveValue('Mesa 12');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar mesa' }));
    await waitFor(() => expect(api.floorplan.addShape).toHaveBeenCalledTimes(2));
  });

  it('preserves selection on delete failure and keeps locked or disabled layouts read-only', async () => {
    const { api } = renderEditor();
    vi.mocked(api.floorplan.removeShape).mockRejectedValueOnce(new Error('network'));
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mesa' }));
    await waitFor(() => expect(api.floorplan.removeShape).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/No pudimos eliminar este elemento/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editar mesa' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre o número de mesa')).toHaveValue('Mesa principal');
  });

  it('translates an occupied-table API error without exposing its code', async () => {
    const { api } = renderEditor();
    vi.mocked(api.floorplan.removeShape).mockRejectedValueOnce(
      new ApiError(409, 'FLOORPLAN_TABLE_OCCUPIED', 'technical detail')
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mesa' }));
    expect(
      await screen.findByText(
        'Esta mesa tiene lugares ocupados. No puede eliminarse ni reducirse por debajo de su ocupación actual.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('FLOORPLAN_TABLE_OCCUPIED')).not.toBeInTheDocument();
  });

  it('preserves an edited draft after update failure', async () => {
    const { api } = renderEditor();
    vi.mocked(api.floorplan.updateShape).mockRejectedValueOnce(new Error('network'));
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    const name = screen.getByLabelText('Nombre o número de mesa');
    await userEvent.clear(name);
    await userEvent.type(name, 'Mesa novios');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/No pudimos guardar los cambios/)).toBeInTheDocument();
    expect(name).toHaveValue('Mesa novios');
    expect(api.floorplan.updateShape).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a confirmed create when the following refresh fails', async () => {
    const { api } = renderEditor();
    const created = { ...table, id: 'table-created', name: 'Mesa nueva' };
    vi.mocked(api.floorplan.addShape).mockResolvedValueOnce(created);
    await screen.findByAltText('Plano del lugar');
    vi.mocked(api.floorplan.get)
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce({ ...floorplan, shapes: [...floorplan.shapes, created] });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar mesa' }));
    await userEvent.type(screen.getByLabelText('Nombre o número de mesa'), 'Mesa nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar mesa' }));

    expect(await screen.findByText(/Los cambios se guardaron/)).toBeInTheDocument();
    expect(screen.queryByText(/No pudimos guardar los cambios/)).not.toBeInTheDocument();
    expect(api.floorplan.addShape).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Mesa nueva')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    await waitFor(() => expect(screen.queryByText(/Los cambios se guardaron/)).not.toBeInTheDocument());
    expect(api.floorplan.addShape).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a confirmed update when the following refresh fails', async () => {
    const { api } = renderEditor();
    const updated = { ...table, name: 'Mesa actualizada' };
    vi.mocked(api.floorplan.updateShape).mockResolvedValueOnce(updated);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    vi.mocked(api.floorplan.get)
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce({ ...floorplan, shapes: [updated, zone] });
    const name = screen.getByLabelText('Nombre o número de mesa');
    await userEvent.clear(name);
    await userEvent.type(name, 'Mesa actualizada');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/Los cambios se guardaron/)).toBeInTheDocument();
    expect(screen.queryByText(/No pudimos guardar los cambios/)).not.toBeInTheDocument();
    expect(api.floorplan.updateShape).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Mesa actualizada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    await waitFor(() => expect(screen.queryByText(/Los cambios se guardaron/)).not.toBeInTheDocument());
    expect(api.floorplan.updateShape).toHaveBeenCalledTimes(1);
  });

  it('does not repeat a confirmed delete when the following refresh fails', async () => {
    const { api } = renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar mesa Mesa principal' }));
    vi.mocked(api.floorplan.get)
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValueOnce({ ...floorplan, shapes: [zone] });
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mesa' }));

    expect(await screen.findByText(/Los cambios se guardaron/)).toBeInTheDocument();
    expect(screen.queryByText(/No pudimos eliminar este elemento/)).not.toBeInTheDocument();
    expect(api.floorplan.removeShape).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Mesa principal')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
    await waitFor(() => expect(screen.queryByText(/Los cambios se guardaron/)).not.toBeInTheDocument());
    expect(api.floorplan.removeShape).toHaveBeenCalledTimes(1);
  });

  it('keeps lock and unlock state coherent after failure and permits retry', async () => {
    const { api } = renderEditor();
    vi.mocked(api.floorplan.lock).mockRejectedValueOnce(new Error('network'));
    await userEvent.click(await screen.findByRole('button', { name: 'Finalizar distribución' }));
    expect(await screen.findByText(/No pudimos finalizar la distribución/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar distribución' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Finalizar distribución' }));
    expect(await screen.findByRole('button', { name: 'Editar distribución' })).toBeInTheDocument();

    vi.mocked(api.floorplan.unlock).mockRejectedValueOnce(new Error('network'));
    await userEvent.click(screen.getByRole('button', { name: 'Editar distribución' }));
    expect(await screen.findByText(/No pudimos habilitar la edición/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar distribución' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar distribución' }));
    expect(await screen.findByRole('button', { name: 'Finalizar distribución' })).toBeInTheDocument();
  });

  it('requires positive places and respects disabled and finalized read-only states', async () => {
    const { api, unmount } = renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar mesa' }));
    await userEvent.type(screen.getByLabelText('Nombre o número de mesa'), 'Mesa cero');
    await userEvent.clear(screen.getByLabelText('Número de lugares'));
    await userEvent.type(screen.getByLabelText('Número de lugares'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar mesa' }));
    expect(await screen.findByText(/número de lugares mayor a cero/)).toBeInTheDocument();
    expect(api.floorplan.addShape).not.toHaveBeenCalled();
    unmount();

    renderEditor({ disabled: true });
    expect(await screen.findByRole('button', { name: 'Agregar mesa' })).toBeDisabled();
    await screen.findByAltText('Plano del lugar');
    expect(screen.getByRole('button', { name: 'Editar mesa Mesa principal', hidden: true })).toBeDisabled();
  });

  it('replaces the private JPG/PNG asset and revokes its Object URL without changing FileAssets', async () => {
    const { api, unmount } = renderEditor();
    vi.mocked(api.fileAssets.upload).mockResolvedValue({
      id: 'asset-new',
      eventId: configuredEvent.id,
      fileType: 'FLOORPLAN_IMAGE',
      ownerType: 'FLOORPLAN',
      ownerId: null,
      status: 'READY',
      mimeType: 'image/png',
      sizeBytes: 5,
      storageProvider: 'LOCAL',
      originalName: 'plano.png',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: null
    });
    vi.mocked(api.floorplan.replaceImage).mockResolvedValue(floorplan);
    await screen.findByAltText('Plano del lugar');
    await userEvent.upload(
      screen.getByLabelText('Seleccionar imagen del plano'),
      new File(['image'], 'plano.png', { type: 'image/png' })
    );
    expect(api.fileAssets.upload).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.any(File),
      'FLOORPLAN_IMAGE',
      'FLOORPLAN'
    );
    expect(api.floorplan.replaceImage).toHaveBeenCalledWith(configuredEvent.id, 'asset-new');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:floorplan');
  });

  it('keeps the current plan after replacement failure and allows an explicit retry', async () => {
    const { api } = renderEditor();
    const asset = {
      id: 'asset-retry',
      eventId: configuredEvent.id,
      fileType: 'FLOORPLAN_IMAGE' as const,
      ownerType: 'FLOORPLAN' as const,
      ownerId: null,
      status: 'READY' as const,
      mimeType: 'image/jpeg',
      sizeBytes: 5,
      storageProvider: 'LOCAL' as const,
      originalName: 'plano.jpg',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: null
    };
    vi.mocked(api.fileAssets.upload).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(asset);
    vi.mocked(api.floorplan.replaceImage).mockResolvedValue(floorplan);
    const input = await screen.findByLabelText('Seleccionar imagen del plano');
    await userEvent.upload(input, new File(['image'], 'plano.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByText(/No pudimos guardar el plano/)).toBeInTheDocument();
    expect(screen.getByAltText('Plano del lugar')).toBeInTheDocument();
    await userEvent.upload(input, new File(['image'], 'plano.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(api.fileAssets.upload).toHaveBeenCalledTimes(2));
    expect(api.floorplan.replaceImage).toHaveBeenCalledWith(configuredEvent.id, 'asset-retry');
  });

  it('keeps bulk inventory local until a pending table is placed on the plan', async () => {
    const { api } = renderEditor();
    await screen.findByAltText('Plano del lugar');

    await userEvent.clear(screen.getByLabelText('Cantidad'));
    await userEvent.type(screen.getByLabelText('Cantidad'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Crear inventario de 2 mesas' }));

    expect(screen.getByRole('heading', { name: 'Mesas sin colocar (2)' })).toBeInTheDocument();
    expect(api.floorplan.addShape).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Plano interactivo de mesas y zonas'), { clientX: 10, clientY: 10 });
    await waitFor(() => expect(api.floorplan.addShape).toHaveBeenCalledOnce());
    expect(vi.mocked(api.floorplan.addShape).mock.calls[0]?.[1]).toMatchObject({
      name: 'Mesa 1',
      kind: 'TABLE',
      geometry: 'CIRCLE',
      capacity: 10
    });
    expect(screen.getByRole('heading', { name: 'Mesas sin colocar (1)' })).toBeInTheDocument();
  });
});
