import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi, organization } from '../test/fixtures';
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
const service = {
  id: 'service-created',
  code: 'FLYER',
  isActive: true,
  createdAt: '2026-08-03T18:00:00.000Z',
  updatedAt: '2026-08-03T18:00:00.000Z'
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

  it('conserva un Servicio creado entre pestanas y permite su primer Precio y una Promocion', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.createService).mockResolvedValue(service);
    vi.mocked(api.adminCatalog.createPrice).mockResolvedValue({ ...price, serviceId: service.id });
    renderAdminApp(api, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');

    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.adminCatalog.createService).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    const createPrice = screen.getByRole('button', { name: 'Crear precio' });
    expect(createPrice).toBeEnabled();
    await userEvent.click(createPrice);
    await userEvent.click(screen.getByLabelText('Servicio'));
    await userEvent.click(screen.getByRole('option', { name: 'Flyer' }));
    await userEvent.type(screen.getByLabelText('Creditos'), '12');
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), { target: { value: '2026-08-03T12:00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
    await waitFor(() => expect(api.adminCatalog.createPrice).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.adminCatalog.createPrice).mock.calls[0]?.[0]).toMatchObject({
      serviceId: service.id,
      validFrom: new Date('2026-08-03T12:00:00').toISOString()
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear promocion' }));
    await userEvent.click(screen.getByLabelText('Servicio'));
    expect(screen.getByRole('option', { name: 'Flyer' })).toBeVisible();
    expect(api.services.listAvailable).not.toHaveBeenCalled();
  });

  it('respeta estado inactivo autoritativo y exige seleccion cuando el estado es desconocido', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.createService).mockResolvedValue({ ...service, isActive: false });
    const firstView = renderAdminApp(api, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByRole('button', { name: 'Actualizar estado' })[0]!);
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveTextContent('Inactivo');
    firstView.unmount();

    const priceApi = mockAdminApi();
    vi.mocked(priceApi.adminCatalog.listPrices).mockResolvedValue([price]);
    renderAdminApp(priceApi, '/catalogo');
    const unknownButton = (await screen.findAllByRole('button', { name: 'Actualizar estado' })).at(-1)!;
    await userEvent.click(unknownButton);
    expect(screen.getByText(/Estado actual no expuesto/)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Confirmar' }).at(-1)).toBeDisabled();
  });

  it('bloquea doble creacion de Servicio y aborta la operacion al desmontar', async () => {
    const pending = deferred<typeof service>();
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.createService).mockReturnValue(pending.promise);
    const { router } = renderAdminApp(api, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    confirm.click();
    confirm.click();
    await waitFor(() => expect(api.adminCatalog.createService).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(api.adminCatalog.createService).mock.calls[0]?.[1];
    await router.navigate('/eventos');
    await waitFor(() => expect(signal?.aborted).toBe(true));
    pending.resolve(service);
    await waitFor(() => expect(screen.queryByText(service.id)).not.toBeInTheDocument());
  });

  it('bloquea intervalos invalidos de Promocion y conserva el dialogo', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear promocion' }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Intervalo invalido');
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), { target: { value: '2026-08-03T12:00:00' } });
    fireEvent.change(screen.getByLabelText('Fin de vigencia (opcional)'), {
      target: { value: '2026-08-03T11:59:59' }
    });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }));
    expect(await screen.findByText('El fin de vigencia debe ser posterior al inicio.')).toBeVisible();
    expect(api.adminCatalog.createPromotion).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Intervalo invalido');
  });

  it('muestra targets legibles y deja UUID como referencia secundaria', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([
      { ...promotion, clientId: organization.id, serviceId: price.serviceId }
    ]);
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    expect((await screen.findAllByText(organization.name)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Flyer').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`Referencia: ${organization.id}`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`Referencia: ${price.serviceId}`).length).toBeGreaterThan(0);
    expect(api.adminClients.list).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('muestra loading, error con retry y empty states de las colecciones', async () => {
    const pricesPending = deferred<(typeof price)[]>();
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockReturnValueOnce(pricesPending.promise).mockResolvedValueOnce([]);
    const firstView = renderAdminApp(api, '/catalogo');
    expect(await screen.findByText('Cargando referencias de Servicios...')).toBeVisible();
    pricesPending.resolve([]);
    expect(await screen.findByText('Sin referencias de Servicios')).toBeVisible();
    firstView.unmount();

    const promotionApi = mockAdminApi();
    vi.mocked(promotionApi.adminCatalog.listPromotions)
      .mockRejectedValueOnce(new Error('fallo'))
      .mockResolvedValueOnce([]);
    renderAdminApp(promotionApi, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    const retry = await screen.findByRole('button', { name: /reintentar/i });
    await userEvent.click(retry);
    expect(await screen.findByText('Sin promociones')).toBeVisible();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
