import { ApiError, createApiClient } from '@invitaciones/api-client';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi, plannerUser, platformAdmin } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';
import { createAdminUnauthorizedController } from './admin-unauthorized-controller';
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

  it('expires an authenticated session centrally, clears private cache and deduplicates simultaneous 401s', async () => {
    const api = mockAdminApi();
    const { router, queryClient, unauthorizedController } = renderAdminApp(api, '/clientes?status=active#secret');
    expect(await screen.findByText('Clientes')).toBeInTheDocument();
    queryClient.setQueryData(['private-proof'], { email: platformAdmin.email });
    const clear = vi.spyOn(queryClient, 'clear');
    act(() => {
      unauthorizedController.notify();
      unauthorizedController.notify();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?returnTo=%2Fclientes%3Fstatus%3Dactive');
    expect(screen.queryByText(platformAdmin.email)).not.toBeInTheDocument();
    expect(screen.queryByText('Centro de administracion')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['private-proof'])).toBeUndefined();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('routes an authenticated requester 401 through the central controller', async () => {
    const unauthorizedController = createAdminUnauthorizedController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/me')) {
        return new Response(JSON.stringify(platformAdmin), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.endsWith('/admin/clients')) {
        return new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const api = createApiClient({
      baseUrl: 'https://api.example.com/api/v1',
      fetchImpl,
      onUnauthorized: () => unauthorizedController.notify()
    });
    const { router, queryClient } = renderAdminApp(api, '/clientes', { unauthorizedController });
    queryClient.setQueryData(['private-proof'], { email: platformAdmin.email });

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?returnTo=%2Fclientes');
    expect(screen.queryByText(platformAdmin.email)).not.toBeInTheDocument();
    expect(screen.queryByText('Centro de administracion')).not.toBeInTheDocument();
    expect(queryClient.getQueryData(['private-proof'])).toBeUndefined();
    expect(fetchImpl.mock.calls.some(([input]) => String(input).endsWith('/auth/logout'))).toBe(false);
  });

  it.each([
    new ApiError(403, 'FORBIDDEN', 'forbidden'),
    new ApiError(429, 'RATE_LIMITED', 'slow'),
    new ApiError(500, 'INTERNAL_ERROR', 'unavailable'),
    new TypeError('network'),
    new ApiError(502, 'UNEXPECTED_API_RESPONSE', 'malformed'),
    new DOMException('aborted', 'AbortError')
  ])('keeps an authenticated session for a recoverable resource failure %#', async (failure) => {
    const api = mockAdminApi();
    vi.mocked(api.adminClients.list).mockRejectedValue(failure);
    renderAdminApp(api, '/clientes');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByText(platformAdmin.email)).toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
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
    expect(safeAdminReturnTo('/clientes?status=active#secret')).toBe('/clientes?status=active');
  });
});
