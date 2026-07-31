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

describe('visual wizard editors', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:${crypto.randomUUID()}`)
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders both private Flyer images, replaces JPG/PNG and performs Hotspot CRUD with all actions', async () => {
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
    await userEvent.click(screen.getByLabelText('Acción'));
    expect(await screen.findByRole('option', { name: 'Enlace adicional' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Hotspot' }));
    expect(api.design.createHotspot).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar hotspot RSVP' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Hotspot' }));
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
    expect(await screen.findByText('Portada: página 1 · 2/10 páginas')).toBeInTheDocument();
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
