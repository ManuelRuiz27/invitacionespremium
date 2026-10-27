import { ApiError } from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { adminEvent, clientUser, mockAdminApi, organization } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const managed = { ...organization, operatingProfile: 'MANAGED' as const };
const planner = {
  ...clientUser,
  id: 'assigned-planner',
  role: 'ORGANIZATION_PLANNER' as const,
  email: 'planner@aurora.mx'
};
function venueApi() {
  const api = mockAdminApi();
  vi.mocked(api.adminClients.get).mockResolvedValue(managed);
  vi.mocked(api.adminClients.list).mockResolvedValue([managed]);
  vi.mocked(api.adminClients.listUsers).mockResolvedValue([clientUser, planner]);
  return api;
}

describe('UX01 Admin onboarding', () => {
  it.each(['MANAGED', 'SELF_SERVICE'] as const)(
    'creates an Organization as %s once and navigates to the returned Client',
    async (profile) => {
      const api = venueApi();
      vi.mocked(api.adminClients.createOrganization).mockResolvedValue({
        client: { ...managed, id: 'new-client', operatingProfile: profile },
        user: clientUser
      });
      const { router } = renderAdminApp(api, '/clientes');
      await userEvent.click(await screen.findByRole('button', { name: 'Crear organizacion' }));
      expect(screen.getByRole('combobox', { name: 'Perfil operativo' })).toHaveTextContent(
        'Gestionado por InvitacionesPremium'
      );
      if (profile === 'SELF_SERVICE') {
        await userEvent.click(screen.getByRole('combobox', { name: 'Perfil operativo' }));
        await userEvent.click(screen.getByRole('option', { name: 'Autoservicio' }));
      }
      fireEvent.change(screen.getByLabelText(/Nombre de la organizacion/), { target: { value: 'Nuevo salon' } });
      fireEvent.change(screen.getByLabelText(/Correo del Administrador de organizacion/), {
        target: { value: 'admin@salon.mx' }
      });
      fireEvent.change(screen.getByLabelText(/Contrase\u00f1a inicial/), { target: { value: 'safe-password-123' } });
      const create = screen.getByRole('button', { name: 'Crear organizacion' });
      fireEvent.click(create);
      fireEvent.click(create);
      await waitFor(() => expect(router.state.location.pathname).toBe('/clientes/new-client'));
      expect(api.adminClients.createOrganization).toHaveBeenCalledExactlyOnceWith({
        name: 'Nuevo salon',
        adminEmail: 'admin@salon.mx',
        adminPassword: 'safe-password-123',
        operatingProfile: profile
      });
    }
  );

  it('keeps server errors and captured Organization data without navigating', async () => {
    const api = venueApi();
    vi.mocked(api.adminClients.createOrganization).mockRejectedValue(
      new ApiError(409, 'USER_EMAIL_ALREADY_EXISTS', 'email exists')
    );
    const { router } = renderAdminApp(api, '/clientes');
    await userEvent.click(await screen.findByRole('button', { name: 'Crear organizacion' }));
    fireEvent.change(screen.getByLabelText(/Nombre de la organizacion/), { target: { value: 'Nuevo salon' } });
    fireEvent.change(screen.getByLabelText(/Correo del Administrador de organizacion/), {
      target: { value: 'admin@salon.mx' }
    });
    fireEvent.change(screen.getByLabelText(/Contrase\u00f1a inicial/), { target: { value: 'safe-password-123' } });
    await userEvent.click(screen.getByRole('button', { name: 'Crear organizacion' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre de la organizacion/)).toHaveValue('Nuevo salon');
    expect(router.state.location.pathname).toBe('/clientes');
  });

  it('uses actual Planner data, hides B01 Finance and opens the existing contextual intake', async () => {
    const api = venueApi();
    vi.mocked(api.adminClients.listUsers).mockResolvedValueOnce([clientUser]);
    const { queryClient, router } = renderAdminApp(api, `/clientes/${managed.id}`);
    expect(
      await screen.findByRole('heading', { name: 'Preparar sal\u00f3n para control de acceso' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear evento' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Agregar planner' })).toBeEnabled();
    expect(api.adminFinance.balance).not.toHaveBeenCalled();
    await act(() => queryClient.invalidateQueries({ queryKey: ['admin-client-users', managed.id] }));
    expect(await screen.findByText(/Planner responsable disponible:/)).toHaveTextContent(planner.email);
    await userEvent.click(screen.getByRole('link', { name: 'Crear evento' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/eventos'));
    expect(await screen.findByRole('combobox', { name: 'Cliente' })).toHaveTextContent(managed.name);
    expect(screen.getByRole('combobox', { name: 'Servicio' })).toHaveTextContent('Control de acceso');
    expect(api.adminEvents.quoteIntake).not.toHaveBeenCalled();
  });

  it('shows retry after a Planner lookup fails and never treats it as a completed step', async () => {
    const api = venueApi();
    vi.mocked(api.adminClients.listUsers).mockRejectedValueOnce(new TypeError('offline'));
    renderAdminApp(api, `/clientes/${managed.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar Planners' }));
    expect(await screen.findByText(/Planner responsable disponible:/)).toHaveTextContent(planner.email);
  });

  it.each(['unknown', 'suspended'])('rejects unavailable URL Client %s without selecting it', async (id) => {
    const api = venueApi();
    if (id === 'suspended')
      vi.mocked(api.adminClients.list).mockResolvedValue([{ ...managed, id, status: 'SUSPENDED' }]);
    renderAdminApp(api, `/eventos?clientId=${id}`);
    expect(await screen.findByText(/El Cliente solicitado/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.adminClients.listUsers).not.toHaveBeenCalled();
  });

  it('links a missing Planner directly to the existing creation action', async () => {
    const api = venueApi();
    vi.mocked(api.adminClients.listUsers).mockResolvedValue([clientUser]);
    renderAdminApp(api, `/eventos?clientId=${managed.id}`);
    const link = await screen.findByRole('link', { name: 'Agregar planner' });
    expect(link).toHaveAttribute('href', `/clientes/${managed.id}?agregarPlanner=1`);
    await userEvent.click(link);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Crear planner');
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'shows service and %s mode without primary UUID labels or N+1 list calls',
    async (mode) => {
      const api = venueApi();
      const event = {
        ...adminEvent,
        serviceCode: 'ACCESS_CONTROL' as const,
        accessMode: mode,
        assignedPlannerUserId: planner.id
      };
      vi.mocked(api.adminEvents.list).mockResolvedValue([event, { ...event, id: 'event-b' }]);
      renderAdminApp(api, '/eventos');
      expect(
        await screen.findAllByText(`Control de acceso \u00b7 ${mode === 'NOMINAL' ? 'Nominal' : 'An\u00f3nimo'}`)
      ).toHaveLength(2);
      expect(screen.queryByText(planner.id)).not.toBeInTheDocument();
      expect(screen.queryByText(clientUser.id)).not.toBeInTheDocument();
      expect(api.adminClients.listUsers).not.toHaveBeenCalled();
      expect(api.adminEvents.get).not.toHaveBeenCalled();
    }
  );

  it('groups backend readiness blockers by responsible party, keeping nominal work outside Provider actions', async () => {
    const api = venueApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue({
      ...adminEvent,
      serviceCode: 'ACCESS_CONTROL',
      accessMode: 'NOMINAL',
      status: 'CONFIGURED',
      activatedAt: null,
      floorplanEnabled: true
    });
    vi.mocked(api.adminEventPreparation.getAccessReadiness).mockResolvedValue({
      complete: false,
      accessMode: 'NOMINAL',
      capacity: 120,
      activeMaterialCount: 0,
      blockers: [
        'EVENT_BASIC_DATA_INCOMPLETE',
        'EVENT_FLOORPLAN_MISSING',
        'EVENT_ACCESS_CREDENTIAL_MISSING',
        'EVENT_ACCESS_SEATING_INCOMPLETE'
      ]
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/accesos`);
    const provider = await screen.findByRole('region', { name: 'Pendiente de InvitacionesPremium' });
    const venue = screen.getByRole('region', { name: 'Pendiente del sal\u00f3n' });
    expect(within(provider).getAllByRole('link', { name: 'Revisar' })).toHaveLength(2);
    expect(within(venue).queryByRole('link')).not.toBeInTheDocument();
    expect(venue).toHaveTextContent('EVENT_ACCESS_CREDENTIAL_MISSING');
    expect(venue).toHaveTextContent('EVENT_ACCESS_SEATING_INCOMPLETE');
    expect(api.nominalAccessCredentials.issue).not.toHaveBeenCalled();
  });
});
