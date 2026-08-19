import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { adminEvent, deletedEvent, mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

describe('Admin Event preparation surfaces', () => {
  it('offers preparation only for non-deleted Events', async () => {
    const api = mockAdminApi();
    const view = renderAdminApp(api, `/eventos/${adminEvent.id}`);
    expect(await screen.findByRole('link', { name: 'Preparar evento' })).toHaveAttribute(
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

  it('shows Croquis status with the Admin GET and exposes no builder mutations', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue({ ...adminEvent, floorplanEnabled: true });
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue({
      id: 'floorplan-1',
      eventId: adminEvent.id,
      image: { fileAssetId: 'asset-floorplan', contentPath: '/private' },
      locked: true,
      lockedAt: adminEvent.updatedAt,
      shapes: [],
      createdAt: adminEvent.createdAt,
      updatedAt: adminEvent.updatedAt
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/croquis`);
    expect(await screen.findByText('Bloqueo: Bloqueado')).toBeInTheDocument();
    expect(api.adminEventPreparation.getFloorplan).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      expect.any(AbortSignal)
    );
    expect(api.floorplan.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /agregar|bloquear|desbloquear|guardar/i })).not.toBeInTheDocument();
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
