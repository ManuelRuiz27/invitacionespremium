import type { Hotspot, InvitationDesign } from '@invitaciones/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../test/fixtures';
import { DesignStep } from './design/DesignStep';
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

const uploadedAsset = {
  id: 'asset-new',
  eventId: configuredEvent.id,
  fileType: 'FLYER_INITIAL_IMAGE' as const,
  ownerType: 'FLYER' as const,
  ownerId: null,
  status: 'READY' as const,
  mimeType: 'image/png',
  sizeBytes: 5,
  storageProvider: 'LOCAL' as const,
  originalName: 'new.png',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null
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

  it('renders both private Flyer images, replaces JPG/PNG and keeps the visual action editor', async () => {
    const api = mockApiClient();
    vi.mocked(api.design.get).mockResolvedValue(flyer);
    vi.mocked(api.design.removeHotspot).mockResolvedValue(undefined);
    vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.mocked(api.fileAssets.upload).mockResolvedValue(uploadedAsset);
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
      ...uploadedAsset,
      fileType: 'FLIPBOOK_PAGE_IMAGE',
      ownerType: 'FLIPBOOK_PAGE'
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
    await userEvent.click(screen.getAllByRole('button', { name: 'Mover después' })[0]!);
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
