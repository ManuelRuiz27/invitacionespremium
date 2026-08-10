import { ApiError, type AvailableService, type InvitationDesign } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredEvent, mockApiClient } from '../../test/fixtures';
import { DesignStep } from './DesignStep';

const service: AvailableService = {
  id: 'service-flipbook',
  code: 'FLIPBOOK' as const,
  credits: 7,
  validFrom: '2026-01-01T00:00:00Z',
  validUntil: null
};
const flyerService: AvailableService = { ...service, id: 'service-flyer', code: 'FLYER' };
const event = { ...configuredEvent, serviceId: service.id, serviceCode: service.code };
const page = (id: string, position: number, fileAssetId = `asset-${id}`) => ({
  id,
  eventId: event.id,
  fileAssetId,
  position,
  hotspots: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
});
const flipbook = (
  pages: ReturnType<typeof page>[] = [],
  hotspots: InvitationDesign['hotspots'] = []
): InvitationDesign => ({
  id: 'design-1',
  eventId: event.id,
  type: 'FLIPBOOK',
  flyerInitialAssetId: null,
  flyerQrAssetId: null,
  pages,
  hotspots,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
});
const flyer = (initialAssetId = 'asset-initial', qrAssetId = 'asset-qr'): InvitationDesign => ({
  ...flipbook(),
  type: 'FLYER',
  flyerInitialAssetId: initialAssetId,
  flyerQrAssetId: qrAssetId
});
const asset = (id = 'asset-new') => ({
  id,
  eventId: event.id,
  fileType: 'FLIPBOOK_PAGE_IMAGE' as const,
  ownerType: 'FLIPBOOK_PAGE' as const,
  ownerId: null,
  status: 'READY' as const,
  storageProvider: 'LOCAL' as const,
  originalName: 'page.png',
  mimeType: 'image/png',
  sizeBytes: 4,
  width: 100,
  height: 140,
  associatedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null
});
const missing = () => new ApiError(404, 'INVITATION_DESIGN_NOT_FOUND', 'missing');

function setup(initial: InvitationDesign | undefined, selectedService = service) {
  const api = mockApiClient();
  if (initial) vi.mocked(api.design.get).mockResolvedValue(initial);
  else vi.mocked(api.design.get).mockRejectedValue(missing());
  vi.mocked(api.fileAssets.content).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  vi.mocked(api.fileAssets.upload).mockResolvedValue(asset());
  const view = render(
    <AppThemeProvider>
      <DesignStep
        apiClient={api}
        event={{ ...event, serviceId: selectedService.id, serviceCode: selectedService.code }}
        service={selectedService}
        disabled={false}
      />
    </AppThemeProvider>
  );
  return { api, view };
}

async function upload(files = [new File(['x'], 'page.png', { type: 'image/png' })]) {
  const button = await screen.findByRole('button', {
    name: files.length > 1 ? 'Seleccionar imágenes' : /Seleccionar imágenes|Agregar páginas/
  });
  const input = button.querySelector('input');
  if (!input) throw new Error('Upload input missing.');
  await userEvent.upload(input, files);
}

describe('DesignStep authoritative Flipbook flow', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('starts a Flipbook from zero and adds the first uploaded page as cover', async () => {
    const { api } = setup(undefined);
    const empty = flipbook();
    const first = flipbook([page('page-1', 1, 'asset-new')]);
    vi.mocked(api.design.createFlipbook).mockResolvedValue(empty);
    vi.mocked(api.design.addPage).mockResolvedValue(first);
    vi.mocked(api.design.get).mockResolvedValue(first);
    await upload();
    await waitFor(() => expect(api.design.createFlipbook).toHaveBeenCalledTimes(1));
    expect(api.design.addPage).toHaveBeenCalledWith(event.id, { fileAssetId: 'asset-new' });
    expect(await screen.findByRole('button', { name: /Portada/ })).toBeInTheDocument();
  });

  it('treats one Flyer image as progress instead of an error', async () => {
    const { api } = setup(undefined, flyerService);
    vi.mocked(api.fileAssets.upload).mockResolvedValue(asset('asset-initial'));
    const button = await screen.findByRole('button', { name: 'Subir imagen principal' });
    const input = button.querySelector('input');
    if (!input) throw new Error('Upload input missing.');
    await userEvent.upload(input, new File(['x'], 'principal.png', { type: 'image/png' }));
    const notice = await screen.findByText('Agrega la segunda imagen para crear el Flyer.');
    expect(notice.closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorInfo');
    expect(api.design.createFlyer).not.toHaveBeenCalled();
  });

  it('reports a later invalid Flyer file as an error instead of inheriting info severity', async () => {
    const { api } = setup(undefined, flyerService);
    vi.mocked(api.fileAssets.upload).mockResolvedValue(asset('asset-initial'));
    const initialInput = (await screen.findByRole('button', { name: 'Subir imagen principal' })).querySelector('input');
    if (!initialInput) throw new Error('Upload input missing.');
    await userEvent.upload(initialInput, new File(['x'], 'principal.png', { type: 'image/png' }));
    await screen.findByText('Agrega la segunda imagen para crear el Flyer.');

    const qrInput = screen.getByRole('button', { name: 'Subir imagen con QR' }).querySelector('input');
    if (!qrInput) throw new Error('Upload input missing.');
    fireEvent.change(qrInput, { target: { files: [new File(['x'], 'not-image.txt', { type: 'text/plain' })] } });

    const notice = await screen.findByText('Usa únicamente una imagen JPG o PNG.');
    expect(notice.closest('.MuiAlert-root')).toHaveClass('MuiAlert-colorError');
    expect(api.fileAssets.upload).toHaveBeenCalledTimes(1);
  });

  it('adopts a Flyer committed behind an uncertain response without repeating create', async () => {
    const { api } = setup(undefined, flyerService);
    vi.mocked(api.fileAssets.upload)
      .mockResolvedValueOnce(asset('asset-initial'))
      .mockResolvedValueOnce(asset('asset-qr'));
    const initialInput = (await screen.findByRole('button', { name: 'Subir imagen principal' })).querySelector('input');
    if (!initialInput) throw new Error('Upload input missing.');
    await userEvent.upload(initialInput, new File(['1'], 'principal.png', { type: 'image/png' }));
    await screen.findByText('Agrega la segunda imagen para crear el Flyer.');
    const committed = flyer();
    vi.mocked(api.design.createFlyer).mockRejectedValueOnce(new Error('timeout after commit'));
    vi.mocked(api.design.get).mockResolvedValue(committed);
    const qrInput = screen.getByRole('button', { name: 'Subir imagen con QR' }).querySelector('input');
    if (!qrInput) throw new Error('Upload input missing.');
    await userEvent.upload(qrInput, new File(['2'], 'qr.png', { type: 'image/png' }));
    await waitFor(() => expect(api.design.createFlyer).toHaveBeenCalledTimes(1));
    expect(api.design.createFlyer).toHaveBeenCalledWith(event.id, {
      initialAssetId: 'asset-initial',
      qrAssetId: 'asset-qr'
    });
    expect(screen.queryByText(/conflicto/i)).not.toBeInTheDocument();
  });

  it('blocks a synchronous double submit while creating a Flyer', async () => {
    const { api } = setup(undefined, flyerService);
    vi.mocked(api.fileAssets.upload).mockResolvedValueOnce(asset('asset-initial'));
    const initialInput = (await screen.findByRole('button', { name: 'Subir imagen principal' })).querySelector('input');
    if (!initialInput) throw new Error('Upload input missing.');
    await userEvent.upload(initialInput, new File(['1'], 'principal.png', { type: 'image/png' }));
    await screen.findByText('Agrega la segunda imagen para crear el Flyer.');
    let release!: (value: ReturnType<typeof asset>) => void;
    vi.mocked(api.fileAssets.upload).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    vi.mocked(api.design.createFlyer).mockResolvedValue(flyer());
    vi.mocked(api.design.get).mockResolvedValue(flyer());
    const qrInput = screen.getByRole('button', { name: 'Subir imagen con QR' }).querySelector('input');
    if (!qrInput) throw new Error('Upload input missing.');
    const qrFile = new File(['2'], 'qr.png', { type: 'image/png' });
    fireEvent.change(qrInput, { target: { files: [qrFile] } });
    await waitFor(() => expect(api.fileAssets.upload).toHaveBeenCalledTimes(2));
    fireEvent.change(qrInput, { target: { files: [qrFile] } });
    expect(api.fileAssets.upload).toHaveBeenCalledTimes(2);
    await act(async () => release(asset('asset-qr')));
    await waitFor(() => expect(api.design.createFlyer).toHaveBeenCalledTimes(1));
  });

  it('reconciles a confirmed createFlipbook timeout and never creates a second design', async () => {
    const { api } = setup(undefined);
    const empty = flipbook();
    const first = flipbook([page('page-1', 1, 'asset-new')]);
    vi.mocked(api.design.get).mockResolvedValueOnce(empty).mockResolvedValue(first);
    vi.mocked(api.design.createFlipbook).mockRejectedValueOnce(new Error('timeout after commit'));
    vi.mocked(api.design.addPage).mockResolvedValue(first);
    await upload();
    await waitFor(() => expect(api.design.addPage).toHaveBeenCalledTimes(1));
    expect(api.design.createFlipbook).toHaveBeenCalledTimes(1);
  });

  it('blocks double submit synchronously while the first page intention is pending', async () => {
    const { api } = setup(undefined);
    let release!: (value: ReturnType<typeof asset>) => void;
    vi.mocked(api.fileAssets.upload).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    vi.mocked(api.design.createFlipbook).mockResolvedValue(flipbook());
    vi.mocked(api.design.addPage).mockResolvedValue(flipbook([page('page-1', 1, 'asset-new')]));
    const input = (await screen.findByRole('button', { name: 'Seleccionar imágenes' })).querySelector('input');
    if (!input) throw new Error('Upload input missing.');
    const file = new File(['x'], 'page.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(api.fileAssets.upload).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { files: [file] } });
    expect(api.fileAssets.upload).toHaveBeenCalledTimes(1);
    await act(async () => release(asset()));
  });

  it('keeps a confirmed add local when refresh fails and refreshes without repeating add', async () => {
    const { api } = setup(undefined);
    const first = flipbook([page('page-1', 1, 'asset-new')]);
    vi.mocked(api.design.get).mockRejectedValueOnce(new Error('refresh failed')).mockResolvedValue(first);
    vi.mocked(api.design.createFlipbook).mockResolvedValue(flipbook());
    vi.mocked(api.design.addPage).mockResolvedValue(first);
    await upload();
    expect(await screen.findByText(/El cambio sí se guardó/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar vista' }));
    await waitFor(() => expect(screen.queryByText(/El cambio sí se guardó/)).not.toBeInTheDocument());
    expect(api.design.addPage).toHaveBeenCalledTimes(1);
  });

  it('blocks creation on a non-404 initial read error and allows retry', async () => {
    const api = mockApiClient();
    vi.mocked(api.design.get)
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'))
      .mockRejectedValueOnce(missing());
    render(
      <AppThemeProvider>
        <DesignStep apiClient={api} event={event} service={service} disabled={false} />
      </AppThemeProvider>
    );
    expect(await screen.findByText(/Ningún cambio está habilitado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Seleccionar imágenes' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Seleccionar imágenes' })).toBeInTheDocument();
    expect(api.design.createFlipbook).not.toHaveBeenCalled();
  });

  it('warns before a reorder that would invalidate cover actions and translates the backend rejection', async () => {
    const hotspot: InvitationDesign['hotspots'][number] = {
      id: 'hotspot-1',
      eventId: event.id,
      visualOwnerType: 'FLIPBOOK_PAGE',
      flipbookPageId: 'page-1',
      action: 'RSVP',
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.1,
      priority: 0,
      url: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    };
    const current = flipbook([page('page-1', 1), page('page-2', 2)], [hotspot]);
    const { api } = setup(current);
    vi.mocked(api.design.reorderPages).mockRejectedValue(
      new ApiError(409, 'HOTSPOT_VISUAL_OWNER_NOT_OPERATIONAL', 'technical')
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Mover Página 1 después' }));
    expect(screen.getByRole('dialog', { name: 'Revisar acciones antes de ordenar' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Esta página tiene acciones que dependen de ser Portada o página QR. Ajusta esas acciones antes de cambiar su posición.'
      )
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(api.design.reorderPages).not.toHaveBeenCalled();
  });

  it.each([
    [
      'reorder',
      'No pudimos cambiar el orden',
      async () => screen.getByRole('button', { name: 'Mover Página 1 después' }).click()
    ],
    [
      'delete',
      'El diseño cambió al mismo tiempo',
      async () => screen.getByRole('button', { name: 'Eliminar Página 1' }).click()
    ]
  ])('keeps the UI recoverable after %s failure', async (kind, expected, trigger) => {
    const current = flipbook([page('page-1', 1), page('page-2', 2)]);
    const { api } = setup(current);
    vi.mocked(api.design.reorderPages).mockRejectedValue(new Error('network'));
    vi.mocked(api.design.removePage).mockRejectedValue(new ApiError(409, 'INVITATION_DESIGN_CONFLICT', 'conflict'));
    await screen.findByRole('button', { name: 'Portada' });
    await trigger();
    expect(await screen.findByText(new RegExp(expected))).toBeInTheDocument();
    expect(kind === 'delete' ? api.design.removePage : api.design.reorderPages).toHaveBeenCalledTimes(1);
  });

  it('uploads several pages in one selection and preserves their submitted order', async () => {
    const { api } = setup(undefined);
    vi.mocked(api.design.get).mockResolvedValue(flipbook([page('p1', 1), page('p2', 2)]));
    vi.mocked(api.design.createFlipbook).mockResolvedValue(flipbook());
    vi.mocked(api.fileAssets.upload).mockResolvedValueOnce(asset('a1')).mockResolvedValueOnce(asset('a2'));
    vi.mocked(api.design.addPage)
      .mockResolvedValueOnce(flipbook([page('p1', 1, 'a1')]))
      .mockResolvedValueOnce(flipbook([page('p1', 1, 'a1'), page('p2', 2, 'a2')]));
    await upload([
      new File(['1'], 'one.png', { type: 'image/png' }),
      new File(['2'], 'two.png', { type: 'image/png' })
    ]);
    await waitFor(() => expect(api.design.addPage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.design.addPage).mock.calls.map((call) => call[1].fileAssetId)).toEqual(['a1', 'a2']);
  });

  it('keeps confirmed pages after a partial multi-upload and retries only pending work', async () => {
    const { api } = setup(undefined);
    await screen.findByRole('button', { name: 'Seleccionar imágenes' });
    const first = flipbook([page('p1', 1, 'a1')]);
    const complete = flipbook([page('p1', 1, 'a1'), page('p2', 2, 'a2')]);
    vi.mocked(api.design.createFlipbook).mockResolvedValue(flipbook());
    vi.mocked(api.fileAssets.upload).mockResolvedValueOnce(asset('a1')).mockResolvedValueOnce(asset('a2'));
    vi.mocked(api.design.addPage)
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'failed page'))
      .mockResolvedValueOnce(complete);
    await upload([
      new File(['1'], 'one.png', { type: 'image/png' }),
      new File(['2'], 'two.png', { type: 'image/png' })
    ]);
    expect(await screen.findByText(/Se agregaron 1 de 2 páginas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Portada/ })).toBeInTheDocument();
    expect(api.fileAssets.upload).toHaveBeenCalledTimes(2);
    vi.mocked(api.design.get).mockResolvedValue(complete);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar pendientes' }));
    await waitFor(() => expect(api.design.addPage).toHaveBeenCalledTimes(3));
    expect(api.fileAssets.upload).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Se agregó 1 página.')).toBeInTheDocument();
  });

  it.each(['reorder', 'replace', 'delete', 'another upload'])(
    'removes partial-upload retry when a later %s error replaces its feedback',
    async (kind) => {
      const current = flipbook([page('p1', 1), page('p2', 2)]);
      const { api, view } = setup(current);
      const afterFirst = flipbook([page('p1', 1), page('p2', 2), page('p3', 3, 'a1')]);
      vi.mocked(api.fileAssets.upload).mockResolvedValueOnce(asset('a1')).mockResolvedValueOnce(asset('a2'));
      vi.mocked(api.design.addPage)
        .mockResolvedValueOnce(afterFirst)
        .mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'failed page'));
      const addInput = (await screen.findByRole('button', { name: 'Agregar páginas' })).querySelector('input');
      if (!addInput) throw new Error('Add pages input missing.');
      await userEvent.upload(addInput, [
        new File(['1'], 'one.png', { type: 'image/png' }),
        new File(['2'], 'two.png', { type: 'image/png' })
      ]);
      expect(await screen.findByRole('button', { name: 'Reintentar pendientes' })).toBeInTheDocument();

      if (kind === 'reorder') {
        vi.mocked(api.design.reorderPages).mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'failed'));
        await userEvent.click(screen.getByRole('button', { name: 'Mover Página 1 después' }));
      } else if (kind === 'replace') {
        vi.mocked(api.design.replacePage).mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'failed'));
        const replaceInput = screen.getByRole('button', { name: 'Reemplazar Página 1' }).querySelector('input');
        if (!replaceInput) throw new Error('Replace input missing.');
        await userEvent.upload(replaceInput, new File(['3'], 'replacement.png', { type: 'image/png' }));
      } else if (kind === 'delete') {
        vi.mocked(api.design.removePage).mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'failed'));
        await userEvent.click(screen.getByRole('button', { name: 'Eliminar Página 1' }));
      } else {
        fireEvent.change(addInput, {
          target: { files: [new File(['3'], 'not-image.txt', { type: 'text/plain' })] }
        });
      }

      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Reintentar pendientes' })).not.toBeInTheDocument()
      );
      expect(view.container.querySelector('.MuiAlert-colorError')).not.toBeNull();
    }
  );
});
