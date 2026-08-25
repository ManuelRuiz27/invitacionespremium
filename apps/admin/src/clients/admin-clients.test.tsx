import { ApiError } from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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

  it('shows the implicit Standard channel and lets Platform Admin select Venue without changing ClientType', async () => {
    const api = mockAdminApi();
    const user = userEvent.setup();
    renderAdminApp(api, '/clientes/client-a');
    expect(await screen.findByText(/Canal comercial: Est.ndar \/ PVP/)).toBeVisible();
    expect(screen.getByText(/Organizacion/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Configurar canal comercial' }));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Venue recurrente' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(api.adminClients.update).toHaveBeenCalledWith(
        'client-a',
        { commercialChannel: 'VENUE' },
        expect.any(AbortSignal)
      )
    );
    expect(organization.type).toBe('ORGANIZATION');
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
      expect(api.adminClients.suspend).toHaveBeenCalledWith(
        'client-a',
        { reason: 'Revision contractual' },
        expect.any(AbortSignal)
      )
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

  it.each([
    ['rename', 'Editar nombre', 'Guardar', 'update'],
    ['suspend', 'Suspender Cliente', 'Suspender', 'suspend'],
    ['planner', 'Agregar planner', 'Guardar', 'createPlanner'],
    ['user', 'Editar acceso', 'Guardar', 'updateUser']
  ] as const)('blocks synchronous double submit for %s', async (kind, openLabel, confirmLabel, method) => {
    const api = mockAdminApi();
    const pending = deferred<never>();
    vi.mocked(api.adminClients[method]).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const view = renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: openLabel }));
    if (kind === 'planner') {
      await user.type(screen.getByLabelText('Correo'), 'planner@aurora.mx');
      await user.type(screen.getByLabelText('Contrasena temporal'), 'secret123');
    }
    const confirm = screen.getByRole('button', { name: confirmLabel });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api.adminClients[method]).toHaveBeenCalledTimes(1));
    view.unmount();
  });

  it('blocks synchronous double restore', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminClients.get).mockResolvedValue(suspendedPlanner);
    const pending = deferred<never>();
    vi.mocked(api.adminClients.restore).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const view = renderAdminApp(api, '/clientes/client-b');
    await user.click(await screen.findByRole('button', { name: 'Restaurar Cliente' }));
    const confirm = screen.getByRole('button', { name: 'Restaurar' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api.adminClients.restore).toHaveBeenCalledTimes(1));
    view.unmount();
  });

  it('aborts a Client A mutation on A-to-B navigation and discards its late response', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminClients.get).mockImplementation((clientId) =>
      Promise.resolve(clientId === 'client-b' ? suspendedPlanner : organization)
    );
    const pending = deferred<typeof organization>();
    vi.mocked(api.adminClients.update).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const { router } = renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: 'Editar nombre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.adminClients.update).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(api.adminClients.update).mock.calls[0]?.[2];
    await act(() => router.navigate('/clientes/client-b'));
    expect(await screen.findByRole('heading', { name: suspendedPlanner.name, level: 1 })).toBeInTheDocument();
    expect(signal?.aborted).toBe(true);
    pending.resolve(organization);
    await act(async () => Promise.resolve());
    expect(screen.getByRole('heading', { name: suspendedPlanner.name, level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: organization.name, level: 1 })).not.toBeInTheDocument();
  });

  it('clears an already loaded Client immediately when its refetch returns 401', async () => {
    const api = mockAdminApi();
    const { queryClient, router, unauthorizedController } = renderAdminApp(api, '/clientes/client-a');
    expect(await screen.findByRole('heading', { name: organization.name, level: 1 })).toBeInTheDocument();
    vi.mocked(api.adminClients.get).mockImplementationOnce(() => {
      unauthorizedController.notify();
      return Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'expired'));
    });
    await act(() => queryClient.invalidateQueries({ queryKey: ['admin-client', 'client-a'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.queryByText(organization.name)).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
