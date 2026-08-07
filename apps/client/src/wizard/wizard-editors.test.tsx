import type { Floorplan, Hotspot, InvitationDesign } from '@invitaciones/api-client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../test/fixtures';
import { DesignStep } from './design/DesignStep';
import { FloorplanStep } from './floorplan/FloorplanStep';
import { PhysicalPassesStep } from './physical-passes/PhysicalPassesStep';

const hotspot: Hotspot = {
  id: 'hotspot-1',
  eventId: configuredEvent.id,
  visualOwnerType: 'FLYER',
  flipbookPageId: null,
  action: 'RSVP',
  url: null,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.1,
  priority: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};
const flyer: InvitationDesign = {
  id: 'design-1',
  eventId: configuredEvent.id,
  type: 'FLYER',
  flyerInitialAssetId: 'asset-initial',
  flyerQrAssetId: 'asset-qr',
  pages: [],
  hotspots: [hotspot],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};
const page = (id: string, position: number) => ({
  id,
  eventId: configuredEvent.id,
  fileAssetId: `asset-${id}`,
  position,
  hotspots: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
});
const flipbook: InvitationDesign = {
  ...flyer,
  type: 'FLIPBOOK',
  flyerInitialAssetId: null,
  flyerQrAssetId: null,
  pages: [page('page-1', 1), page('page-2', 2)],
  hotspots: []
};
const floorplan: Floorplan = {
  id: 'floorplan-1',
  eventId: configuredEvent.id,
  image: { fileAssetId: 'floorplan-image', contentPath: '/private' },
  locked: false,
  lockedAt: null,
  shapes: [
    {
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
      rotation: 0,
      polygonPoints: null
    }
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

const geometryShape = (
  geometry: Floorplan['shapes'][number]['geometry'],
  overrides: Partial<Floorplan['shapes'][number]> = {}
): Floorplan['shapes'][number] => ({
  ...floorplan.shapes[0]!,
  geometry,
  polygonPoints: null,
  ...overrides
});

function renderFloorplanEditor(shape: Floorplan['shapes'][number]) {
  const api = mockApiClient();
  vi.mocked(api.floorplan.get).mockResolvedValue({ ...floorplan, shapes: [shape] });
  vi.mocked(api.floorplan.updateShape).mockResolvedValue(shape);
  vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  render(
    <FloorplanStep
      apiClient={api}
      event={{ ...configuredEvent, floorplanEnabled: true }}
      draft={{ confirmationEnabled: false, floorplanEnabled: true }}
      disabled={false}
      onChange={vi.fn()}
    />
  );
  return api;
}

describe('visual wizard editors', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:${crypto.randomUUID()}`)
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders both private Flyer images, replaces JPG/PNG and keeps the visual action editor', async () => {
    const api = mockApiClient();
    vi.mocked(api.design.get).mockResolvedValue(flyer);
    vi.mocked(api.design.removeHotspot).mockResolvedValue(undefined);
    vi.mocked(api.design.createHotspot).mockResolvedValue(hotspot);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.fileAssets.upload).mockResolvedValue({
      id: 'asset-new',
      eventId: configuredEvent.id,
      fileType: 'FLYER_INITIAL_IMAGE',
      ownerType: 'FLYER',
      ownerId: null,
      status: 'READY',
      mimeType: 'image/png',
      sizeBytes: 5,
      storageProvider: 'LOCAL',
      originalName: 'new.png',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: null
    });
    const view = render(
      <DesignStep
        apiClient={api}
        event={{ ...configuredEvent, serviceId: 'service-flyer' }}
        service={{
          id: 'service-flyer',
          code: 'FLYER',
          credits: 5,
          validFrom: '2026-01-01T00:00:00Z',
          validUntil: null
        }}
        disabled={false}
      />
    );
    expect(await screen.findByAltText('Imagen inicial')).toBeInTheDocument();
    expect(await screen.findByAltText('Imagen QR')).toBeInTheDocument();
    await userEvent.upload(
      screen.getByLabelText('Agregar o sustituir imagen inicial'),
      new File(['x'], 'new.png', { type: 'image/png' })
    );
    await waitFor(() =>
      expect(api.design.replaceFlyerInitial).toHaveBeenCalledWith(configuredEvent.id, { assetId: 'asset-new' })
    );
    expect(screen.getByRole('heading', { name: 'Acciones de la invitación' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar acción Confirmar asistencia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar acción' }));
    expect(api.design.removeHotspot).toHaveBeenCalledWith(configuredEvent.id, 'hotspot-1');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('supports Flipbook page selection, reorder, replacement, deletion and adding through real controls', async () => {
    const api = mockApiClient();
    vi.mocked(api.design.get).mockResolvedValue(flipbook);
    vi.mocked(api.design.removePage).mockResolvedValue(undefined);
    vi.mocked(api.design.reorderPages).mockResolvedValue(flipbook);
    vi.mocked(api.design.replacePage).mockResolvedValue(flipbook);
    vi.mocked(api.design.addPage).mockResolvedValue(flipbook);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.fileAssets.upload).mockResolvedValue({
      id: 'asset-new',
      eventId: configuredEvent.id,
      fileType: 'FLIPBOOK_PAGE_IMAGE',
      ownerType: 'FLIPBOOK_PAGE',
      ownerId: null,
      status: 'READY',
      mimeType: 'image/png',
      sizeBytes: 5,
      storageProvider: 'LOCAL',
      originalName: 'page.png',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: null
    });
    render(
      <DesignStep
        apiClient={api}
        event={configuredEvent}
        service={{
          id: 'service-flipbook',
          code: 'FLIPBOOK',
          credits: 7,
          validFrom: '2026-01-01T00:00:00Z',
          validUntil: null
        }}
        disabled={false}
      />
    );
    expect(await screen.findByText(/La Página 1 es la portada/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acciones de la portada' })).toBeInTheDocument();
    const after = screen.getAllByRole('button', { name: 'Mover después' })[0]!;
    await userEvent.click(after);
    expect(api.design.reorderPages).toHaveBeenCalledWith(configuredEvent.id, { pageIds: ['page-2', 'page-1'] });
    await userEvent.upload(
      screen.getAllByLabelText('Reemplazar')[0]!,
      new File(['x'], 'replace.png', { type: 'image/png' })
    );
    expect(api.design.replacePage).toHaveBeenCalled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]!);
    expect(api.design.removePage).toHaveBeenCalled();
    await userEvent.upload(screen.getByLabelText('Agregar página'), new File(['x'], 'add.png', { type: 'image/png' }));
    expect(api.design.addPage).toHaveBeenCalled();
  });

  it('creates a Zone, edits a Table, deletes shapes and exposes lock plus canvas controls', async () => {
    const api = mockApiClient();
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.floorplan.addShape).mockResolvedValue(floorplan.shapes[0]!);
    vi.mocked(api.floorplan.updateShape).mockResolvedValue(floorplan.shapes[0]!);
    vi.mocked(api.floorplan.removeShape).mockResolvedValue(undefined);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    render(
      <FloorplanStep
        apiClient={api}
        event={{ ...configuredEvent, floorplanEnabled: true }}
        draft={{ confirmationEnabled: false, floorplanEnabled: true }}
        disabled={false}
        onChange={vi.fn()}
      />
    );
    expect(await screen.findByLabelText('Canvas del Croquis')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nueva Zona' }));
    expect(screen.getByLabelText('Capacidad')).toHaveValue(0);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));
    expect(api.floorplan.addShape).toHaveBeenCalledWith(
      configuredEvent.id,
      expect.objectContaining({ kind: 'DECORATIVE_ZONE', capacity: 0 })
    );
    await userEvent.click(screen.getByRole('button', { name: /Seleccionar Mesa Mesa principal/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mesa editada' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));
    expect(api.floorplan.updateShape).toHaveBeenCalledWith(
      configuredEvent.id,
      'table-1',
      expect.objectContaining({ name: 'Mesa editada' })
    );
    await userEvent.click(screen.getByRole('button', { name: /Seleccionar Mesa Mesa principal/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar forma' }));
    expect(api.floorplan.removeShape).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Bloquear Croquis' })).toBeInTheDocument();
  });

  it('renders geometry-specific shapes and saves a bounded square near the bottom-right corner', async () => {
    const api = mockApiClient();
    vi.mocked(api.floorplan.get).mockResolvedValue({
      ...floorplan,
      shapes: [
        floorplan.shapes[0]!,
        {
          ...floorplan.shapes[0]!,
          id: 'square-1',
          name: 'Cuadro',
          geometry: 'SQUARE',
          x: 0.4,
          width: 0.15,
          height: 0.15
        },
        {
          ...floorplan.shapes[0]!,
          id: 'polygon-1',
          name: 'Triángulo',
          geometry: 'POLYGON',
          polygonPoints: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0.5, y: 1 }
          ]
        }
      ]
    });
    vi.mocked(api.floorplan.addShape).mockResolvedValue(floorplan.shapes[0]!);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    render(
      <FloorplanStep
        apiClient={api}
        event={{ ...configuredEvent, floorplanEnabled: true }}
        draft={{ confirmationEnabled: false, floorplanEnabled: true }}
        disabled={false}
        onChange={vi.fn()}
      />
    );
    const circle = await screen.findByRole('button', { name: /Seleccionar Mesa Mesa principal/ });
    const square = screen.getByRole('button', { name: /Seleccionar Mesa Cuadro/ });
    const polygon = screen.getByRole('button', { name: /Seleccionar Mesa Triángulo/ });
    expect(circle).toHaveStyle({ borderRadius: '50%' });
    expect(square).toHaveAttribute('data-geometry', 'SQUARE');
    expect(polygon.style.clipPath).toBe('polygon(0% 0%, 100% 0%, 50% 100%)');

    const canvas = screen.getByLabelText('Canvas del Croquis');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 750,
      width: 1000,
      height: 750,
      toJSON: () => ({})
    });
    const squareHandle = screen.getByLabelText('Redimensionar Cuadro');
    fireEvent.pointerDown(squareHandle, { pointerId: 1, clientX: 400, clientY: 300 });
    fireEvent.pointerMove(squareHandle, { pointerId: 1, clientX: 500, clientY: 375 });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));
    const resized = vi.mocked(api.floorplan.updateShape).mock.calls.at(-1)?.[2];
    expect(resized?.width).toBe(resized?.height);

    await userEvent.click(screen.getByRole('button', { name: 'Nueva Zona' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Geometría' }));
    await userEvent.click(screen.getByRole('option', { name: 'SQUARE' }));
    fireEvent.change(screen.getByLabelText('x'), { target: { value: '0.9' } });
    fireEvent.change(screen.getByLabelText('y'), { target: { value: '0.85' } });
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '0.3' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));
    const payload = vi.mocked(api.floorplan.addShape).mock.calls.at(-1)?.[1];
    expect(payload?.width).toBe(payload?.height);
    expect((payload?.x ?? 0) + (payload?.width ?? 0)).toBeLessThanOrEqual(1);
    expect((payload?.y ?? 0) + (payload?.height ?? 0)).toBeLessThanOrEqual(1);
  });

  it.each([
    ['SQUARE', 0.1],
    ['CIRCLE', 0.08]
  ] as const)('reduces an existing %s through its authoritative side field', async (geometry, side) => {
    const source = geometryShape(geometry, { name: geometry, width: 0.2, height: 0.2 });
    const api = renderFloorplanEditor(source);
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`Seleccionar Mesa ${geometry}`) }));
    await waitFor(() => expect(screen.getByLabelText('width')).toHaveValue(0.2));

    fireEvent.change(screen.getByLabelText('width'), { target: { value: String(side) } });
    expect(screen.getByLabelText('width')).toHaveValue(side);
    expect(screen.getByLabelText('height')).toHaveValue(side);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));

    expect(api.floorplan.updateShape).toHaveBeenCalledWith(
      configuredEvent.id,
      source.id,
      expect.objectContaining({ geometry, width: side, height: side })
    );
  });

  it('initializes equal visible sides when converting Rectangle to Circle and persists later edits exactly', async () => {
    const source = geometryShape('RECTANGLE', { name: 'Rectángulo', width: 0.2, height: 0.15 });
    const api = renderFloorplanEditor(source);
    await userEvent.click(await screen.findByRole('button', { name: /Seleccionar Mesa Rectángulo/ }));
    await waitFor(() => expect(screen.getByLabelText('height')).toHaveValue(0.15));

    await userEvent.click(screen.getByRole('combobox', { name: 'Geometría' }));
    await userEvent.click(screen.getByRole('option', { name: 'CIRCLE' }));
    expect(screen.getByLabelText('width')).toHaveValue(0.2);
    expect(screen.getByLabelText('height')).toHaveValue(0.2);
    fireEvent.change(screen.getByLabelText('width'), { target: { value: '0.1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));

    expect(api.floorplan.updateShape).toHaveBeenCalledWith(
      configuredEvent.id,
      source.id,
      expect.objectContaining({ geometry: 'CIRCLE', width: 0.1, height: 0.1 })
    );
  });

  it.each([
    ['SQUARE', 'reduce', 400, 300, 300, 225, 0.1],
    ['SQUARE', 'expand', 400, 300, 500, 375, 0.3],
    ['CIRCLE', 'reduce', 400, 300, 300, 225, 0.1],
    ['CIRCLE', 'expand', 400, 300, 500, 375, 0.3]
  ] as const)(
    '%s pointer resize can %s while keeping equal positive sides inside the canvas',
    async (geometry, _, x1, y1, x2, y2, side) => {
      const source = geometryShape(geometry, {
        name: 'Pointer shape',
        x: 0.4,
        y: 0.4,
        width: 0.2,
        height: 0.2
      });
      const api = renderFloorplanEditor(source);
      const canvas = await screen.findByLabelText('Canvas del Croquis');
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1000,
        bottom: 750,
        width: 1000,
        height: 750,
        toJSON: () => ({})
      });
      const handle = screen.getByLabelText('Redimensionar Pointer shape');
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: x1, clientY: y1 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: x2, clientY: y2 });
      await waitFor(() => expect(screen.getByLabelText('width')).toHaveValue(side));
      expect(screen.getByLabelText('height')).toHaveValue(side);
      await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));
      const payload = vi.mocked(api.floorplan.updateShape).mock.calls.at(-1)?.[2];
      expect(payload?.width).toBe(payload?.height);
      expect(payload?.width).toBeGreaterThan(0);
      expect((payload?.x ?? 0) + (payload?.width ?? 0)).toBeLessThanOrEqual(1);
      expect((payload?.y ?? 0) + (payload?.height ?? 0)).toBeLessThanOrEqual(1);
    }
  );

  it('shows invalid polygon geometry before making an API request', async () => {
    const api = mockApiClient();
    vi.mocked(api.floorplan.get).mockResolvedValue(floorplan);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    render(
      <FloorplanStep
        apiClient={api}
        event={{ ...configuredEvent, floorplanEnabled: true }}
        draft={{ confirmationEnabled: false, floorplanEnabled: true }}
        disabled={false}
        onChange={vi.fn()}
      />
    );
    await screen.findByLabelText('Canvas del Croquis');
    await userEvent.click(screen.getByRole('button', { name: 'Nueva Zona' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Geometría' }));
    await userEvent.click(screen.getByRole('option', { name: 'POLYGON' }));
    fireEvent.change(screen.getByLabelText(/Puntos del polígono/), { target: { value: '0,0; 0.5,0.5; 1,1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar forma' }));
    expect(await screen.findByText(/degenerado/i)).toBeInTheDocument();
    expect(api.floorplan.addShape).not.toHaveBeenCalled();
  });

  it('downloads a pass SVG with the pass number filename', async () => {
    const api = mockApiClient();
    vi.mocked(api.physicalPasses.list).mockResolvedValue([
      {
        id: 'pass-1',
        eventId: configuredEvent.id,
        passNumber: 1,
        status: 'UNUSED',
        table: null,
        usedAt: null,
        createdAt: '2026-01-01T00:00:00Z'
      }
    ]);
    vi.mocked(api.physicalPasses.svg).mockResolvedValue('<svg/>');
    let filename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
    });
    render(<PhysicalPassesStep apiClient={api} event={configuredEvent} disabled={false} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar SVG' }));
    await waitFor(() => expect(filename).toBe('pase-0001.svg'));
  });
});
