import { ApiError } from '@invitaciones/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi, plannerUser, platformAdmin } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';
import { safeAdminReturnTo } from './admin-session';

describe('Platform Admin authentication', () => {
  it('restores a Platform Admin session and mounts the shell', async () => {
    const api = mockAdminApi();
    renderAdminApp(api);
    expect(await screen.findByText('Centro de administracion')).toBeInTheDocument();
    expect(api.auth.me).toHaveBeenCalledTimes(1);
  });

  it('sends only a 401 to login preserving the internal return path', async () => {
    const api = mockAdminApi();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    const { router } = renderAdminApp(api, '/clientes/client-a');
    expect(await screen.findByRole('heading', { name: 'Administracion' })).toBeInTheDocument();
    expect(router.state.location.search).toContain('returnTo=%2Fclientes%2Fclient-a');
  });

  it.each([
    new ApiError(500, 'INTERNAL_ERROR', 'fail'),
    new ApiError(429, 'RATE_LIMITED', 'slow'),
    new TypeError('network')
  ])('keeps temporary verification failures unavailable without logout', async (failure) => {
    const api = mockAdminApi();
    vi.mocked(api.auth.me).mockRejectedValue(failure);
    renderAdminApp(api, '/clientes');
    expect(
      await screen.findByRole('heading', { name: 'No pudimos verificar la sesion administrativa' })
    ).toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('treats 403 as forbidden and does not request admin resources', async () => {
    const api = mockAdminApi();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Forbidden'));
    renderAdminApp(api);
    expect(
      await screen.findByText('Este acceso es exclusivo para la administracion de la plataforma.')
    ).toBeInTheDocument();
    expect(api.adminClients.list).not.toHaveBeenCalled();
    expect(api.adminEvents.list).not.toHaveBeenCalled();
  });

  it('rejects every Client role without mounting the shell or calling admin APIs', async () => {
    const api = mockAdminApi(plannerUser);
    renderAdminApp(api);
    expect(
      await screen.findByText('Este acceso es exclusivo para la administracion de la plataforma.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Centro de administracion')).not.toBeInTheDocument();
    expect(api.adminClients.list).not.toHaveBeenCalled();
  });

  it('logs out explicitly and clears the protected view', async () => {
    const api = mockAdminApi();
    const user = userEvent.setup();
    renderAdminApp(api);
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesion' }));
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('heading', { name: 'Administracion' })).toBeInTheDocument();
  });

  it('logs in once and follows a safe return path', async () => {
    const api = mockAdminApi();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    vi.mocked(api.auth.login).mockResolvedValue({ user: platformAdmin, expiresAt: '2026-08-03T00:00:00.000Z' });
    const user = userEvent.setup();
    const { router } = renderAdminApp(api, '/login?returnTo=%2Feventos');
    await user.type(await screen.findByLabelText(/Correo electronico/), 'platform@example.com');
    await user.type(screen.getByLabelText(/Contrasena/), 'secret');
    const button = screen.getByRole('button', { name: 'Entrar al panel' });
    await Promise.all([user.click(button), user.click(button)]);
    await waitFor(() => expect(router.state.location.pathname).toBe('/eventos'));
    expect(api.auth.login).toHaveBeenCalledTimes(1);
  });

  it('rejects external, protocol-relative and backslash return paths', () => {
    expect(safeAdminReturnTo('https://evil.test')).toBe('/');
    expect(safeAdminReturnTo('//evil.test')).toBe('/');
    expect(safeAdminReturnTo('/\\evil')).toBe('/');
    expect(safeAdminReturnTo('/clientes')).toBe('/clientes');
  });
});
