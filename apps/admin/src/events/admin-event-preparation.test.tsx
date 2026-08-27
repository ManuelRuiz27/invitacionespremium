import { ApiError, type AdminFloorplan, type AdminFloorplanShape } from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminEvent, deletedEvent, mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const floorplanHarness = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
vi.mock('@invitaciones/floorplan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@invitaciones/floorplan')>();
  return {
    ...actual,
    FloorplanSurface: (props: {
      floorplan: AdminFloorplan;
      onSelect: (shape: AdminFloorplanShape) => void;
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
  beforeEach(() => {
    floorplanHarness.props = undefined;
    setAdminViewportWidth(1440);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:admin-floorplan')
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
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
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.updateEvent).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        expect.objectContaining({ name: 'Evento preparado' })
      )
    );
    expect(api.events.update).not.toHaveBeenCalled();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('renders the authoritative commercial quote and submits authorization only once on a double click', async () => {
    const api = mockAdminApi();
    const baseQuote = await api.adminEventPreparation.getCommercialQuote(adminEvent.clientId, adminEvent.id);
    const pendingQuote = { ...baseQuote, authorizedAt: null, priceLockedAt: null, designKickoffAt: null };
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
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/comercial`);
    await userEvent.click(await screen.findByRole('button', { name: 'Re-cotizar' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.requoteCommercial).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
        acceptanceConfirmed: true
      })
    );
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

  it('loads the provider Builder with the Event-derived clientId and private image', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, floorplanEnabled: true });
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue(floorplan());
    vi.mocked(api.adminEventPreparation.floorplanAssetContent).mockResolvedValue(new Blob(['image']));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByRole('heading', { name: 'Taller de Croquis' })).toBeInTheDocument();
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

  it('shows the empty onboarding and creates a Floorplan from an Admin-only upload', async () => {
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
    await userEvent.upload(upload.querySelector('input')!, new File(['plan'], 'salon.png', { type: 'image/png' }));
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
  });

  it('replaces an existing image through Admin upload plus PATCH and adopts the response', async () => {
    const api = preparedFloorplanApi();
    const replacement = floorplan({ image: { fileAssetId: 'asset-replacement', contentPath: '/private/new' } });
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
      .mockRejectedValueOnce(new Error('refresh'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    await chooseStickerAndPlace('Mesa redonda');
    const input = (await screen.findAllByLabelText('Nombre o número')).at(-1)!;
    await userEvent.clear(input);
    await userEvent.type(input, 'Mesa confirmada');
    await userEvent.click(enabledButton('Agregar mesa'));
    expect(await screen.findByText(/El cambio se guardó/)).toBeInTheDocument();
    expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar plano' }));
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
    expect(await screen.findByText(/El cambio se guardó/)).toBeInTheDocument();
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
    expect(await screen.findByText(/El cambio se guardó/)).toBeInTheDocument();
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
    expect(await screen.findByText(/El cambio se guardó/)).toBeInTheDocument();
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
    expect(await screen.findByText(/El cambio se guardó/)).toBeInTheDocument();
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

  it('keeps the 200-table canvas, catalog and contextual inspector usable at 1024x768', async () => {
    setAdminViewportWidth(1024);
    const api = preparedFloorplanApi(floorplan({ shapes: scaleAdminShapes(200) }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByTestId('admin-floorplan-surface')).toBeInTheDocument();
    expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mesa 200' }));
    expect((await screen.findAllByText('Mesa seleccionada')).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Nombre o número').at(-1)).toHaveValue('Mesa 200');
  });

  it('keeps multi-table inventory available from the provider palette', async () => {
    const api = preparedFloorplanApi();
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
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
    expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Pista' })[0]).toBeDisabled();
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
    expect(await screen.findByText(/El cambio se guardó/)).toBeInTheDocument();
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
    await userEvent.click(
      within(await screen.findByTestId('admin-floorplan-surface')).getByRole('button', { name: zone.name })
    );
    await userEvent.click((await screen.findAllByRole('button', { name: 'Duplicar' })).at(-1)!);
    await waitFor(() => expect(api.adminEventPreparation.createFloorplanShape).toHaveBeenCalledOnce());
    expect(vi.mocked(api.adminEventPreparation.createFloorplanShape).mock.calls[0]![2]).toEqual(
      expect.objectContaining({ name: 'Pista 2', kind: 'DECORATIVE_ZONE', capacity: 0 })
    );
  });

  it('rejects a non-image upload before calling the Admin asset API', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, floorplanEnabled: true });
    vi.mocked(api.adminEventPreparation.getFloorplan).mockRejectedValue(
      new ApiError(404, 'FLOORPLAN_NOT_FOUND', 'not found')
    );
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    const input = (await screen.findByRole('button', { name: 'Subir plano' })).querySelector('input')!;
    fireEvent.change(input, { target: { files: [new File(['text'], 'plano.txt', { type: 'text/plain' })] } });
    expect(await screen.findByText('Selecciona una imagen JPG o PNG.')).toBeInTheDocument();
    expect(api.adminEventPreparation.uploadFloorplanAsset).not.toHaveBeenCalled();
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
    expect((await screen.findAllByRole('button', { name: 'Mesa redonda' }))[0]).toBeDisabled();
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
      image: { fileAssetId: 'asset-replacement', contentPath: '/private/new' }
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
    expect(await screen.findByText(/El cambio se guardó/)).toBeInTheDocument();
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

function floorplan(overrides: Partial<AdminFloorplan> = {}): AdminFloorplan {
  return {
    id: 'floorplan-1',
    eventId: adminEvent.id,
    image: { fileAssetId: 'asset-floorplan', contentPath: '/private' },
    locked: false,
    lockedAt: null,
    shapes: [],
    createdAt: adminEvent.createdAt,
    updatedAt: adminEvent.updatedAt,
    ...overrides
  };
}

function shape(overrides: Partial<AdminFloorplanShape> = {}): AdminFloorplanShape {
  return {
    id: 'table-a',
    name: 'Mesa Principal',
    kind: 'TABLE',
    geometry: 'CIRCLE',
    capacity: 8,
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

function enabledButton(name: string) {
  return screen.getAllByRole('button', { name }).find((button) => !button.hasAttribute('disabled'))!;
}

function canvasPlace() {
  return floorplanHarness.props?.onCanvasPlace as (point: { x: number; y: number }) => void;
}

async function chooseStickerAndPlace(label: string, point = { x: 0.5, y: 0.5 }) {
  await userEvent.click((await screen.findAllByRole('button', { name: label }))[0]!);
  expect(canvasPlace()).toEqual(expect.any(Function));
  act(() => canvasPlace()(point));
}
