import { type AdminEvent, type AdminFloorplan, type AdminGeneratePhysicalPassesResult } from '@invitaciones/api-client';
import { act, configure, fireEvent, getConfig, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminEvent, clientUser, mockAdminApi, organization } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const managedOrganization = { ...organization, operatingProfile: 'MANAGED' as const };
const responsible = {
  ...clientUser,
  id: 'organization-planner',
  email: 'planner@aurora.mx',
  role: 'ORGANIZATION_PLANNER' as const
};
function accessEvent(overrides: Partial<AdminEvent> = {}): AdminEvent {
  return {
    ...adminEvent,
    serviceCode: 'ACCESS_CONTROL',
    accessMode: 'ANONYMOUS',
    status: 'CONFIGURED',
    assignedPlannerUserId: responsible.id,
    confirmationEnabled: false,
    activatedAt: null,
    activationIdempotencyKey: null,
    hasAccessMaterial: false,
    ...overrides
  };
}
function accessApi(event = accessEvent()) {
  const api = mockAdminApi();
  vi.mocked(api.adminClients.get).mockResolvedValue(managedOrganization);
  vi.mocked(api.adminClients.list).mockResolvedValue([managedOrganization]);
  vi.mocked(api.adminClients.listUsers).mockResolvedValue([clientUser, responsible]);
  vi.mocked(api.adminEvents.get).mockResolvedValue(event);
  vi.mocked(api.adminEvents.createManagedForClient).mockResolvedValue(event);
  vi.mocked(api.adminEventPreparation.updateEvent).mockResolvedValue(event);
  vi.mocked(api.adminEventPreparation.getAccessReadiness).mockResolvedValue({
    complete: false,
    accessMode: event.accessMode ?? null,
    activeMaterialCount: 0,
    capacity: 120,
    blockers: ['EVENT_ACCESS_MATERIAL_MISSING']
  });
  return api;
}
function expectNoCommercial(api: ReturnType<typeof mockAdminApi>) {
  expect(api.adminEvents.quoteIntake).not.toHaveBeenCalled();
  expect(api.adminEvents.createForClient).not.toHaveBeenCalled();
  expect(api.adminEventPreparation.getCommercialQuote).not.toHaveBeenCalled();
  expect(api.adminEventPreparation.authorizeCommercial).not.toHaveBeenCalled();
  expect(api.adminEventPreparation.getUnitEconomics).not.toHaveBeenCalled();
  for (const method of Object.values(api.adminFinance)) expect(method).not.toHaveBeenCalled();
  expect(api.finance.balance).not.toHaveBeenCalled();
}
const batch: AdminGeneratePhysicalPassesResult = {
  eventId: adminEvent.id,
  generationOperationId: 'batch-a',
  firstPassNumber: 11,
  lastPassNumber: 12,
  quantity: 2,
  table: null,
  passes: []
};

describe('Provider ACCESS_CONTROL', () => {
  const previousAsyncTimeout = getConfig().asyncUtilTimeout;
  beforeAll(() => configure({ asyncUtilTimeout: 5_000 }));
  afterAll(() => configure({ asyncUtilTimeout: previousAsyncTimeout }));
  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'creates a Managed Organization %s event with a valid assigned Planner and no commercial requests',
    async (mode) => {
      const api = accessApi(accessEvent({ accessMode: mode }));
      const { router } = renderAdminApp(api, '/eventos');
      await userEvent.click(await screen.findByRole('button', { name: 'Nuevo evento' }));
      await userEvent.click(screen.getByLabelText('Cliente'));
      await userEvent.click(await screen.findByRole('option', { name: /Casa Aurora/ }));
      fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '120' } });
      expect(screen.getByRole('button', { name: 'Crear evento' })).toBeDisabled();
      await userEvent.click(screen.getByLabelText(/Modalidad de acceso/));
      await userEvent.click(screen.getByRole('option', { name: mode === 'NOMINAL' ? /Nominal/ : /Anónimo/ }));
      await userEvent.click(screen.getByLabelText('Planner responsable'));
      expect(screen.queryByRole('option', { name: clientUser.email })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Sin asignar' })).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole('option', { name: responsible.email }));
      fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));
      fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));
      await waitFor(() =>
        expect(api.adminEvents.createManagedForClient).toHaveBeenCalledExactlyOnceWith(organization.id, {
          name: null,
          capacity: 120,
          serviceCode: 'ACCESS_CONTROL',
          accessMode: mode,
          assignedPlannerUserId: responsible.id
        })
      );
      await waitFor(() => expect(router.state.location.pathname).toBe(`/eventos/${adminEvent.id}/preparar/datos`));
      expectNoCommercial(api);
    }
  );

  it('resets modality and Planner on client changes, and Self-Service and Planner clients never offer ACCESS_CONTROL', async () => {
    const api = accessApi();
    const selfService = { ...organization, id: 'self-service', name: 'Self Service' };
    const planner = {
      ...managedOrganization,
      id: 'planner-client',
      type: 'PLANNER' as const,
      name: 'Planner independiente'
    };
    vi.mocked(api.adminClients.list).mockResolvedValue([managedOrganization, selfService, planner]);
    renderAdminApp(api, '/eventos');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo evento' }));
    await userEvent.click(screen.getByLabelText('Cliente'));
    await userEvent.click(await screen.findByRole('option', { name: /Casa Aurora/ }));
    await userEvent.click(screen.getByLabelText(/Modalidad de acceso/));
    await userEvent.click(screen.getByRole('option', { name: /Anónimo/ }));
    await userEvent.click(screen.getByLabelText('Planner responsable'));
    await userEvent.click(await screen.findByRole('option', { name: responsible.email }));
    for (const name of [/Self Service/, /Planner independiente/]) {
      await userEvent.click(screen.getByLabelText('Cliente'));
      await userEvent.click(screen.getByRole('option', { name }));
      expect(screen.queryByLabelText(/Modalidad de acceso/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByLabelText('Servicio'));
      expect(screen.queryByRole('option', { name: 'Control de acceso' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('option', { name: 'QR / EventOps' }));
    }
    await userEvent.click(screen.getByLabelText('Cliente'));
    await userEvent.click(screen.getByRole('option', { name: /Casa Aurora/ }));
    expect(screen.getByLabelText(/Modalidad de acceso/)).not.toHaveTextContent(/Nominal|Anónimo/);
    expect(screen.getByLabelText('Planner responsable')).not.toHaveTextContent(responsible.email);
    expect(api.adminEvents.createManagedForClient).not.toHaveBeenCalled();
  });

  it.each(['invitacion', 'registro', 'comercial'])(
    'redirects an inapplicable direct %s route without requesting its resources',
    async (section) => {
      const api = accessApi();
      const { router } = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/${section}`);
      expect(await screen.findByRole('heading', { name: 'Datos del Evento' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(`/eventos/${adminEvent.id}/preparar/datos`);
      for (const name of ['Invitación', 'Comercial', 'Registro operativo'])
        expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Accesos' })).toBeInTheDocument();
      expect(api.adminEventPreparation.getDesign).not.toHaveBeenCalled();
      expect(api.adminEventPreparation.listPilotObservations).not.toHaveBeenCalled();
      expectNoCommercial(api);
    }
  );

  it('edits modality only before historical material and saves access data without RSVP or gifts requirements', async () => {
    const api = accessApi();
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);
    expect(await screen.findByLabelText('Modalidad de acceso')).toBeEnabled();
    expect(screen.queryByLabelText('Confirmación habilitada')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('URL de mesa de regalos')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Modalidad de acceso'));
    await userEvent.click(screen.getByRole('option', { name: /Nominal/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.updateEvent).toHaveBeenCalledWith(
        adminEvent.clientId,
        adminEvent.id,
        expect.objectContaining({ accessMode: 'NOMINAL', confirmationEnabled: false })
      )
    );
    expect(vi.mocked(api.adminEventPreparation.updateEvent).mock.calls[0]?.[2]).not.toHaveProperty('giftRegistryUrl');
    expectNoCommercial(api);
  });

  it('keeps modality immutable with revoked historical material even when active count is zero', async () => {
    const api = accessApi(accessEvent({ hasAccessMaterial: true }));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/datos`);
    expect(await screen.findByLabelText('Modalidad de acceso')).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByText(/La modalidad no admite cambios/)).toBeInTheDocument();
  });

  it('blocks activation despite a forced READY status when authoritative readiness is incomplete', async () => {
    const api = accessApi(accessEvent({ status: 'READY_TO_ACTIVATE' }));
    vi.mocked(api.adminEventPreparation.getAccessReadiness).mockResolvedValue({
      complete: false,
      accessMode: 'ANONYMOUS',
      capacity: 120,
      activeMaterialCount: 0,
      blockers: ['EVENT_BASIC_DATA_INCOMPLETE', 'EVENT_ACCESS_MATERIAL_MISSING']
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/accesos`);
    expect(await screen.findByText('Completa los datos del Evento.')).toBeInTheDocument();
    expect(screen.getByText('Accesos vigentes: 0 · Capacidad: 120')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar evento' })).not.toBeInTheDocument();
    expect(api.adminEvents.activateManagedForClient).not.toHaveBeenCalled();
    expectNoCommercial(api);
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'activates a genuinely READY %s Organization through the Provider route',
    async (mode) => {
      const ready = accessEvent({ status: 'READY_TO_ACTIVATE', accessMode: mode, hasAccessMaterial: true });
      const active = { ...ready, status: 'ACTIVE' as const, activatedAt: '2026-10-22T12:00:00Z' };
      const api = accessApi(ready);
      vi.mocked(api.adminEventPreparation.getAccessReadiness).mockResolvedValue({
        complete: true,
        accessMode: mode,
        activeMaterialCount: 2,
        capacity: 120,
        blockers: []
      });
      vi.mocked(api.adminEvents.activateManagedForClient).mockImplementation(async () => {
        vi.mocked(api.adminEvents.get).mockResolvedValue(active);
        return active;
      });
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/accesos`);
      await userEvent.click(await screen.findByRole('button', { name: 'Activar evento' }));
      await waitFor(() =>
        expect(api.adminEvents.activateManagedForClient).toHaveBeenCalledWith(
          organization.id,
          adminEvent.id,
          expect.any(String)
        )
      );
      expect(await screen.findByText('El Evento quedó activo.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Activar evento' })).not.toBeInTheDocument();
      expect(api.events.activate).not.toHaveBeenCalled();
      expectNoCommercial(api);
      confirm.mockRestore();
    }
  );

  it('generates a Provider batch once and refreshes authoritative readiness and Event', async () => {
    const api = accessApi();
    vi.mocked(api.adminEventPreparation.generatePhysicalPasses).mockResolvedValue(batch);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/accesos`);
    fireEvent.change(await screen.findByLabelText('Cantidad de pases'), { target: { value: '2' } });
    const generateButton = screen.getByRole('button', { name: 'Generar lote' });
    fireEvent.click(generateButton);
    fireEvent.click(generateButton);
    expect(await screen.findByText('Lote confirmado: 2 pases · folios 11–12.')).toBeInTheDocument();
    expect(api.adminEventPreparation.generatePhysicalPasses).toHaveBeenCalledExactlyOnceWith(
      organization.id,
      adminEvent.id,
      { quantity: 2, tableShapeId: null },
      expect.any(String)
    );
    await waitFor(() => expect(api.adminEventPreparation.getAccessReadiness).toHaveBeenCalledTimes(2));
    expect(api.adminEvents.get).toHaveBeenCalledTimes(2);
    expect(api.physicalPasses.generate).not.toHaveBeenCalled();
    expectNoCommercial(api);
  });

  it('preserves the exact batch body and key after an uncertain result, blocks navigation, and never infers success from counts', async () => {
    const api = accessApi();
    vi.mocked(api.adminEventPreparation.generatePhysicalPasses)
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(batch);
    const { router } = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/accesos`);
    fireEvent.change(await screen.findByLabelText('Cantidad de pases'), { target: { value: '2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Generar lote' }));
    expect(await screen.findByRole('button', { name: 'Reintentar mismo lote' })).toBeEnabled();
    expect(screen.getByLabelText('Cantidad de pases')).toBeDisabled();
    vi.mocked(api.adminEventPreparation.getAccessReadiness).mockResolvedValue({
      complete: true,
      accessMode: 'ANONYMOUS',
      activeMaterialCount: 100,
      capacity: 120,
      blockers: []
    });
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar requisitos' }));
    expect(await screen.findByText('Accesos vigentes: 100 · Capacidad: 120')).toBeInTheDocument();
    expect(screen.queryByText(/Lote confirmado/)).not.toBeInTheDocument();
    await act(() => router.navigate(`/eventos/${adminEvent.id}/preparar/datos`));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Conserva la operación de pases');
    await userEvent.click(screen.getByRole('button', { name: 'Permanecer en Accesos' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar mismo lote' }));
    expect(await screen.findByText('Lote confirmado: 2 pases · folios 11–12.')).toBeInTheDocument();
    const calls = vi.mocked(api.adminEventPreparation.generatePhysicalPasses).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('requires the authoritative Croquis table and sends its UUID in the batch', async () => {
    const api = accessApi(accessEvent({ floorplanEnabled: true }));
    vi.mocked(api.adminEventPreparation.getFloorplan).mockResolvedValue({
      shapes: [{ id: 'table-a', kind: 'TABLE', name: 'Mesa Norte', availableCapacity: 8 }]
    } as AdminFloorplan);
    vi.mocked(api.adminEventPreparation.generatePhysicalPasses).mockResolvedValue({
      ...batch,
      table: { id: 'table-a', name: 'Mesa Norte' }
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/accesos`);
    fireEvent.change(await screen.findByLabelText('Cantidad de pases'), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'Generar lote' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Mesa del lote'));
    await userEvent.click(await screen.findByRole('option', { name: /Mesa Norte/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Generar lote' }));
    await waitFor(() =>
      expect(api.adminEventPreparation.generatePhysicalPasses).toHaveBeenCalledWith(
        organization.id,
        adminEvent.id,
        { quantity: 2, tableShapeId: 'table-a' },
        expect.any(String)
      )
    );
  });

  it('never offers Provider nominal issuance and keeps terminal access Events read-only', async () => {
    const api = accessApi(accessEvent({ accessMode: 'NOMINAL', status: 'CLOSED' }));
    const { router } = renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/accesos`);
    expect(await screen.findByText(/La Organización registra invitados/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Emitir|Generar lote|Activar evento/ })).not.toBeInTheDocument();
    expect(api.nominalAccessCredentials.issue).not.toHaveBeenCalled();
    await act(() => router.navigate(`/eventos/${adminEvent.id}/preparar/datos`));
    expect(await screen.findByRole('button', { name: 'Guardar datos' })).toBeDisabled();
  });
});
