import { ApiError } from '@invitaciones/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi, organization, suspendedPlanner } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

describe('Admin Clients', () => {
  it('renders the complete contracted collection with natural labels', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/clientes');
    expect(await screen.findByText(organization.name)).toBeInTheDocument();
    expect(screen.getByText(suspendedPlanner.name)).toBeInTheDocument();
    expect(screen.getByText('Organizacion')).toBeInTheDocument();
    expect(screen.getByText('Suspendido')).toBeInTheDocument();
    expect(screen.getByText(/no ofrece filtros ni paginacion/)).toBeInTheDocument();
  });

  it('renders loading, retry and empty states', async () => {
    const api = mockAdminApi();
    let reject!: (reason: unknown) => void;
    const pending = new Promise<never>((_resolve, nextReject) => {
      reject = nextReject;
    });
    void pending.catch(() => undefined);
    vi.mocked(api.adminClients.list).mockReturnValueOnce(pending);
    renderAdminApp(api, '/clientes');
    expect(await screen.findByText('Cargando Clientes...')).toBeInTheDocument();
    reject(new ApiError(500, 'INTERNAL_ERROR', 'fail'));
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('creates an Organization with only the generated DTO fields', async () => {
    const api = mockAdminApi();
    const user = userEvent.setup();
    renderAdminApp(api, '/clientes');
    await user.click(await screen.findByRole('button', { name: 'Crear organizacion' }));
    await user.type(screen.getByLabelText(/Nombre de la organizacion/), 'Salon Nube');
    await user.type(screen.getByLabelText(/Correo del Administrador/), 'admin@nube.mx');
    await user.type(screen.getByLabelText(/Contrasena inicial/), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Crear organizacion' }));
    await waitFor(() =>
      expect(api.adminClients.createOrganization).toHaveBeenCalledWith({
        name: 'Salon Nube',
        adminEmail: 'admin@nube.mx',
        adminPassword: 'secret123'
      })
    );
  });

  it('binds detail and users to clientId and exposes planner creation only for Organizations', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/clientes/client-a');
    expect(await screen.findByRole('heading', { name: organization.name, level: 1 })).toBeInTheDocument();
    expect(api.adminClients.get).toHaveBeenCalledWith('client-a', expect.any(AbortSignal));
    expect(api.adminClients.listUsers).toHaveBeenCalledWith('client-a', expect.any(AbortSignal));
    expect(screen.getByRole('button', { name: 'Agregar planner' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /imperson/i })).not.toBeInTheDocument();
  });

  it('suspends only after explicit confirmation and reloads authoritative data', async () => {
    const api = mockAdminApi();
    const user = userEvent.setup();
    renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: 'Suspender Cliente' }));
    expect(api.adminClients.suspend).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Motivo'), 'Revision contractual');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    await waitFor(() =>
      expect(api.adminClients.suspend).toHaveBeenCalledWith('client-a', { reason: 'Revision contractual' })
    );
    expect(api.adminClients.get).toHaveBeenCalledTimes(2);
  });

  it('keeps local state unchanged on a sensitive conflict', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminClients.suspend).mockRejectedValue(new ApiError(409, 'CLIENT_SUSPENDED', 'conflict'));
    const user = userEvent.setup();
    renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: 'Suspender Cliente' }));
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    expect(await screen.findByText('El Cliente esta suspendido.')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });
});
