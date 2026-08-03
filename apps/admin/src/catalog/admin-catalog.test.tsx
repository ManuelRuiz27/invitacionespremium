import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@invitaciones/api-client';
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
    vi.mocked(api.adminCatalog.updateService).mockResolvedValue({ ...service, isActive: true });
    const firstView = renderAdminApp(api, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByRole('button', { name: 'Actualizar estado' })[0]!);
    expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveTextContent('Inactivo');
    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(screen.getByRole('option', { name: 'Activo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(api.adminCatalog.updateService).toHaveBeenCalledWith(
        service.id,
        { isActive: true },
        expect.any(AbortSignal)
      )
    );
    firstView.unmount();

    const priceApi = mockAdminApi();
    vi.mocked(priceApi.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(priceApi.adminCatalog.updateService).mockResolvedValue({
      ...service,
      id: price.serviceId,
      isActive: false
    });
    renderAdminApp(priceApi, '/catalogo');
    const unknownButton = (await screen.findAllByRole('button', { name: 'Actualizar estado' })).at(-1)!;
    await userEvent.click(unknownButton);
    expect(screen.getByText(/Estado actual no expuesto/)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Confirmar' }).at(-1)).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Estado'));
    await userEvent.click(screen.getByRole('option', { name: 'Inactivo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(priceApi.adminCatalog.updateService).toHaveBeenCalledTimes(1));
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

  it('distingue 403 determinista de un resultado incierto de Servicio y exige retry explicito', async () => {
    const forbiddenApi = mockAdminApi();
    vi.mocked(forbiddenApi.adminCatalog.createService).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'sin permiso'));
    const forbiddenView = renderAdminApp(forbiddenApi, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('No tienes permiso para ejecutar esta accion.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Actualizar información' })).not.toBeInTheDocument();
    forbiddenView.unmount();

    const uncertainApi = mockAdminApi();
    vi.mocked(uncertainApi.adminCatalog.createService)
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce(service);
    renderAdminApp(uncertainApi, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Habilitar reintento explicito' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(uncertainApi.adminCatalog.createService).toHaveBeenCalledTimes(2));
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

  it('bloquea precio DEMO distinto de cero y solapamiento aparente antes del POST', async () => {
    const demoApi = mockAdminApi();
    const demoService = { ...service, id: 'service-demo', code: 'DEMO' as const };
    vi.mocked(demoApi.adminCatalog.createService).mockResolvedValue(demoService);
    const demoView = renderAdminApp(demoApi, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    await userEvent.click(screen.getByLabelText('Codigo'));
    await userEvent.click(screen.getByRole('option', { name: 'Demo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear precio' }));
    await userEvent.click(screen.getByLabelText('Servicio'));
    await userEvent.click(screen.getByRole('option', { name: 'Demo' }));
    await userEvent.type(screen.getByLabelText('Creditos'), '1');
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), { target: { value: '2027-08-03T12:00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
    expect(await screen.findByText('Demo debe conservar precio de cero creditos.')).toBeVisible();
    expect(demoApi.adminCatalog.createPrice).not.toHaveBeenCalled();
    demoView.unmount();

    const overlapApi = mockAdminApi();
    vi.mocked(overlapApi.adminCatalog.listPrices).mockResolvedValue([price]);
    renderAdminApp(overlapApi, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear precio' }));
    await userEvent.click(screen.getByLabelText('Servicio'));
    await userEvent.click(screen.getByRole('option', { name: 'Flyer' }));
    await userEvent.type(screen.getByLabelText('Creditos'), '12');
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), { target: { value: '2027-08-03T12:00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
    expect(await screen.findByText(/vigencia aparente se solapa/i)).toBeVisible();
    expect(overlapApi.adminCatalog.createPrice).not.toHaveBeenCalled();
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

  it('reconcilia una desactivacion aplicada sin repetir el POST', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(api.adminCatalog.listPromotions)
      .mockResolvedValueOnce([promotion])
      .mockResolvedValueOnce([{ ...promotion, isActive: false }]);
    vi.mocked(api.adminCatalog.deactivatePromotion).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'incierto'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)!);
    expect(await screen.findByText(CATALOG_UNCERTAIN_TEXT)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    await waitFor(() => expect(api.adminCatalog.deactivatePromotion).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText(/Inactiva/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reconcilia una activacion aplicada y deriva la accion de la proyeccion vigente', async () => {
    const api = mockAdminApi();
    const inactive = { ...promotion, isActive: false };
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([inactive]);
    vi.mocked(api.adminCatalog.activatePromotion).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'incierto'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Activar' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'Activar' }).at(-1)!);
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([{ ...inactive, isActive: true }]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    await waitFor(() => expect(api.adminCatalog.activatePromotion).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Activa/).length).toBeGreaterThan(0);
  });

  it('permite un retry explicito cuando la transicion no aparece aplicada', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([promotion]);
    vi.mocked(api.adminCatalog.deactivatePromotion)
      .mockRejectedValueOnce(new TypeError('red'))
      .mockResolvedValueOnce({ ...promotion, isActive: false });
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Desactivar' })[0]!);
    await userEvent.click(screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)!);
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    expect(await screen.findByText(/no muestra el cambio/i)).toBeVisible();
    const retry = screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)!;
    expect(retry).toBeEnabled();
    await userEvent.click(retry);
    await waitFor(() => expect(api.adminCatalog.deactivatePromotion).toHaveBeenCalledTimes(2));
  });

  it('reconcilia la creacion de Precio por coincidencia exacta sin segundo POST', async () => {
    const api = mockAdminApi();
    const validFrom = new Date('2026-08-03T12:00:00').toISOString();
    const createdPrice = { ...price, serviceId: service.id, credits: 12, validFrom };
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([]);
    vi.mocked(api.adminCatalog.createService).mockResolvedValue(service);
    vi.mocked(api.adminCatalog.createPrice).mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'incierto'));
    renderAdminApp(api, '/catalogo');
    await screen.findByText('Sin referencias de Servicios');
    await userEvent.click(screen.getByRole('button', { name: 'Crear Servicio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear precio' }));
    await userEvent.click(screen.getByLabelText('Servicio'));
    await userEvent.click(screen.getByRole('option', { name: 'Flyer' }));
    await userEvent.type(screen.getByLabelText('Creditos'), '12');
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), { target: { value: '2026-08-03T12:00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
    await waitFor(() => expect(api.adminCatalog.createPrice).toHaveBeenCalledTimes(1));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([createdPrice]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    await waitFor(() => expect(api.adminCatalog.createPrice).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('habilita un solo retry explicito cuando el Precio no aparece tras el resultado incierto', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([{ ...price, validUntil: '2026-02-01T00:00:00.000Z' }]);
    vi.mocked(api.adminCatalog.createPrice)
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce({ ...price, id: 'price-2', credits: 12, validFrom: '2027-08-03T18:00:00.000Z' });
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear precio' }));
    await userEvent.click(screen.getByLabelText('Servicio'));
    await userEvent.click(screen.getByRole('option', { name: 'Flyer' }));
    await userEvent.type(screen.getByLabelText('Creditos'), '12');
    fireEvent.change(screen.getByLabelText('Inicio de vigencia'), { target: { value: '2027-08-03T12:00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar precio' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    const confirm = screen.getByRole('button', { name: 'Confirmar precio' });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    await screen.findByText(/no muestra el cambio/i);
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(api.adminCatalog.createPrice).toHaveBeenCalledTimes(2));
  });

  it('sincroniza la edicion de Promocion con la proyeccion autoritativa no aplicada', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([promotion]);
    vi.mocked(api.adminCatalog.updatePromotion).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'incierto'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    await userEvent.clear(screen.getByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nombre solicitado');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    const authoritative = { ...promotion, name: 'Nombre autoritativo' };
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([authoritative]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    await screen.findByText(/no muestra el cambio/i);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Nombre autoritativo');
    expect(screen.getByRole('button', { name: 'Confirmar promocion' })).toBeEnabled();
    expect(api.adminCatalog.updatePromotion).toHaveBeenCalledTimes(1);
  });

  it('cierra la edicion de Promocion cuando el refetch confirma los campos enviados', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([promotion]);
    vi.mocked(api.adminCatalog.updatePromotion).mockRejectedValue(new ApiError(429, 'RATE_LIMITED', 'incierto'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    await userEvent.clear(screen.getByLabelText('Nombre'));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nombre confirmado');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([{ ...promotion, name: 'Nombre confirmado' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    expect(await screen.findByText(/consulta autoritativa confirma/i)).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.adminCatalog.updatePromotion).toHaveBeenCalledTimes(1);
  });

  it('mantiene incierta una creacion de Promocion con coincidencias ambiguas', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([]);
    vi.mocked(api.adminCatalog.createPromotion).mockRejectedValue(new Error('red'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear promocion' }));
    await fillPromotionForm('Promocion incierta');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    const exact = promotionFromForm('promotion-new', 'Promocion incierta');
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([exact, { ...exact, id: 'promotion-duplicate' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    expect(await screen.findByText(/autoritativa es ambigua/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar promocion' })).toBeDisabled();
    expect(api.adminCatalog.createPromotion).toHaveBeenCalledTimes(1);
  });

  it('reconcilia una creacion de Promocion exacta sin POST adicional', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([]);
    vi.mocked(api.adminCatalog.createPromotion).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'incierto'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear promocion' }));
    await fillPromotionForm('Promocion confirmada');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([
      promotionFromForm('promotion-new', 'Promocion confirmada')
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    expect(await screen.findByText(/consulta autoritativa confirma/i)).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.adminCatalog.createPromotion).toHaveBeenCalledTimes(1);
  });

  it('habilita un retry explicito cuando la Promocion creada no aparece', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([]);
    vi.mocked(api.adminCatalog.createPromotion)
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce(promotionFromForm('promotion-new', 'Promocion ausente'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear promocion' }));
    await fillPromotionForm('Promocion ausente');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    await screen.findByText(/no muestra el cambio/i);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar promocion' }));
    await waitFor(() => expect(api.adminCatalog.createPromotion).toHaveBeenCalledTimes(2));
  });

  it('permite retry explicito al cerrar un Precio que sigue abierto', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(api.adminCatalog.closePrice)
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce({ ...price, validUntil: '2026-08-04T18:00:00.000Z' });
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar vigencia' })[0]!);
    fireEvent.change(screen.getByLabelText('Fin de vigencia'), { target: { value: '2026-08-04T12:00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar precio' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    await screen.findByText(/no muestra el cambio/i);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar precio' }));
    await waitFor(() => expect(api.adminCatalog.closePrice).toHaveBeenCalledTimes(2));
  });

  it('cierra el dialogo sin segundo PATCH cuando el refetch confirma el cierre del Precio', async () => {
    const api = mockAdminApi();
    const requestedUntil = new Date('2026-08-04T12:00:00').toISOString();
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([price]);
    vi.mocked(api.adminCatalog.closePrice).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'incierto'));
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Precios' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar vigencia' })[0]!);
    fireEvent.change(screen.getByLabelText('Fin de vigencia'), { target: { value: '2026-08-04T12:00:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar precio' }));
    await screen.findByText(CATALOG_UNCERTAIN_TEXT);
    vi.mocked(api.adminCatalog.listPrices).mockResolvedValue([{ ...price, validUntil: requestedUntil }]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar información' }));
    expect(await screen.findByText(/consulta autoritativa confirma/i)).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.adminCatalog.closePrice).toHaveBeenCalledTimes(1);
  });

  it('distingue resolucion pending, success y 403 sin ocultar promociones', async () => {
    const api = mockAdminApi();
    let resolveClients!: (value: (typeof organization)[]) => void;
    vi.mocked(api.adminClients.list).mockReturnValue(
      new Promise((resolve) => {
        resolveClients = resolve;
      })
    );
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([{ ...promotion, clientId: organization.id }]);
    const view = renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    expect((await screen.findAllByText('Resolviendo Cliente…')).length).toBeGreaterThan(0);
    resolveClients([organization]);
    expect((await screen.findAllByText(organization.name)).length).toBeGreaterThan(0);
    view.unmount();

    const unresolvedApi = mockAdminApi();
    vi.mocked(unresolvedApi.adminClients.list).mockResolvedValue([]);
    vi.mocked(unresolvedApi.adminCatalog.listPromotions).mockResolvedValue([
      { ...promotion, clientId: organization.id }
    ]);
    const unresolvedView = renderAdminApp(unresolvedApi, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    expect((await screen.findAllByText('Cliente no resuelto')).length).toBeGreaterThan(0);
    unresolvedView.unmount();

    const forbiddenApi = mockAdminApi();
    vi.mocked(forbiddenApi.adminClients.list).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'sin permiso'));
    vi.mocked(forbiddenApi.adminCatalog.listPromotions).mockResolvedValue([
      { ...promotion, clientId: organization.id }
    ]);
    renderAdminApp(forbiddenApi, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    expect(await screen.findByText(/falta de permiso/i)).toBeVisible();
    expect(screen.getAllByText(promotion.name).length).toBeGreaterThan(0);
  });

  it('permite reintentar la resolucion de Clientes tras un 500 sin ocultar promociones', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminClients.list)
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'indisponible'))
      .mockResolvedValueOnce([organization]);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([{ ...promotion, clientId: organization.id }]);
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    expect(await screen.findByText('No fue posible resolver los Clientes.')).toBeVisible();
    expect(screen.getAllByText(promotion.name).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar resolución' }));
    expect((await screen.findAllByText(organization.name)).length).toBeGreaterThan(0);
  });

  it.each([
    ['429', new ApiError(429, 'RATE_LIMITED', 'lento')],
    ['red', new TypeError('network')]
  ])('permite retry de resolucion de Clientes tras %s', async (_label, failure) => {
    const api = mockAdminApi();
    vi.mocked(api.adminClients.list).mockRejectedValueOnce(failure).mockResolvedValueOnce([organization]);
    vi.mocked(api.adminCatalog.listPromotions).mockResolvedValue([{ ...promotion, clientId: organization.id }]);
    renderAdminApp(api, '/catalogo');
    await screen.findByRole('heading', { name: 'Catalogo' });
    await userEvent.click(screen.getByRole('tab', { name: 'Promociones' }));
    expect(await screen.findByText('No fue posible resolver los Clientes.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar resolución' }));
    expect((await screen.findAllByText(organization.name)).length).toBeGreaterThan(0);
  });
});

const CATALOG_UNCERTAIN_TEXT = 'El resultado no pudo confirmarse. Actualiza la información antes de repetir la acción.';

async function fillPromotionForm(name: string) {
  await userEvent.type(screen.getByLabelText('Nombre'), name);
  fireEvent.change(screen.getByLabelText('Inicio de vigencia'), { target: { value: '2027-08-03T12:00:00' } });
}

function promotionFromForm(id: string, name: string) {
  return {
    ...promotion,
    id,
    name,
    scope: 'CREDIT_PURCHASE' as const,
    clientId: null,
    clientType: null,
    serviceId: null,
    validFrom: new Date('2027-08-03T12:00:00').toISOString(),
    allowsStacking: false
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
