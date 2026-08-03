import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const price = {
  id: 'price-1',
  serviceId: 'service-1',
  serviceCode: 'FLYER',
  clientType: 'PLANNER',
  credits: 20,
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
  createdAt: '2026-01-01T00:00:00.000Z'
} as const;
const promotion = {
  id: 'promotion-1',
  name: 'Elegibilidad anual',
  scope: 'EVENT_ACTIVATION',
  clientId: null,
  clientType: 'PLANNER',
  serviceId: 'service-1',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
  isActive: true,
  allowsStacking: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
} as const;

describe('catalogo administrativo', () => {
  it('identifica Servicios como referencias, conserva historia y no usa la ruta Cliente', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([promotion]);
    renderAdminApp(api, '/catalogo');
    expect(await screen.findByRole('heading', { name: 'Catalogo' })).toBeVisible();
    expect(await screen.findByText(/no publica un listado administrativo completo/i)).toBeVisible();
    expect(screen.getAllByText('Flyer').length).toBeGreaterThan(0);
    expect(api.services.listAvailable).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    expect(screen.getByText('20 creditos')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Cerrar vigencia' }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    expect(screen.getByText(/No calculan descuentos ni bonos/i)).toBeVisible();
    expect(screen.getAllByText('Elegibilidad anual').length).toBeGreaterThan(0);
  });

  it('bloquea doble submit sincronico al desactivar una promocion', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([promotion]);
    vi.mocked(api.adminCatalog.deactivatePromotion).mockReturnValue(new Promise(() => undefined));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]!);
    const buttons = screen.getAllByRole('button', { name: 'Desactivar' });
    const confirm = buttons.at(-1)!;
    confirm.click();
    confirm.click();
    await waitFor(() => expect(api.adminCatalog.deactivatePromotion).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.adminCatalog.deactivatePromotion).mock.calls[0]?.[1]).toEqual(expect.any(AbortSignal));
  });
});
