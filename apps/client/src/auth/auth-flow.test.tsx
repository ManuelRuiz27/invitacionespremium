import { ApiError, type AuthUser } from '@invitaciones/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { safeReturnTo } from './AuthProvider';
import { independentUser, loginResult, mockApiClient, platformAdmin } from '../test/fixtures';
import { renderApp } from '../test/render-app';

describe('Client authentication and routing', () => {
  async function submitLogin() {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Correo electrónico/), 'planner@example.com');
    await user.type(screen.getByLabelText(/Contraseña/), 'secret');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  }

  it('logs in and returns to a safe internal route', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    vi.mocked(api.auth.login).mockResolvedValue(loginResult(independentUser));
    const user = userEvent.setup();
    const { router } = renderApp(api, '/login?returnTo=%2Ffinanzas');

    await user.type(await screen.findByLabelText(/Correo electrónico/), 'planner@example.com');
    await user.type(screen.getByLabelText(/Contraseña/), 'secret');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/finanzas'));
    expect(api.auth.login).toHaveBeenCalledWith({
      email: 'planner@example.com',
      password: 'secret'
    });
  });

  it('validates fields and keeps credential errors non-enumerating', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    vi.mocked(api.auth.login).mockRejectedValue(
      new ApiError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.')
    );
    const user = userEvent.setup();
    renderApp(api, '/login');

    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Ingresa un correo electrónico válido.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Correo electrónico/), 'missing@example.com');
    await user.type(screen.getByLabelText(/Contraseña/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
  });

  it('restores the session through /auth/me', async () => {
    const api = mockApiClient();
    renderApp(api, '/eventos');
    expect(await screen.findByRole('heading', { name: 'Eventos', level: 1 })).toBeInTheDocument();
    expect(api.auth.me).toHaveBeenCalledTimes(1);
  });

  it('protects authenticated routes and keeps the requested return path', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    const { router } = renderApp(api, '/finanzas');

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toContain('returnTo=%2Ffinanzas');
  });

  it('classifies a 403 from /auth/me as forbidden', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Forbidden'));
    renderApp(api, '/login');

    expect(await screen.findByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Correo electrónico/)).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('shows session unavailability for a network error without logout or private-cache cleanup', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(new TypeError('network down'));
    const { queryClient } = renderApp(api, '/login');
    queryClient.setQueryData(['private'], { secret: true });

    const heading = await screen.findByRole('heading', {
      name: 'No pudimos verificar tu sesión',
      level: 1
    });
    expect(heading).toHaveFocus();
    expect(screen.queryByLabelText(/Correo electrónico/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['private'])).toEqual({ secret: true });
  });

  it.each([
    ['HTTP 429', new ApiError(429, 'TOO_MANY_REQUESTS', 'Slow down')],
    ['HTTP 500', new ApiError(500, 'INTERNAL_ERROR', 'Server error')],
    ['UNEXPECTED_API_RESPONSE', new ApiError(502, 'UNEXPECTED_API_RESPONSE', 'Invalid payload')]
  ])('classifies %s from /auth/me as unavailable', async (_label, error) => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(error);
    renderApp(api, '/eventos');

    expect(await screen.findByRole('heading', { name: 'No pudimos verificar tu sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Eventos' })).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('retries only /auth/me and mounts the private route after a successful retry', async () => {
    const api = mockApiClient();
    let resolveRetry!: (user: AuthUser) => void;
    vi.mocked(api.auth.me)
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockImplementationOnce(
        () =>
          new Promise<AuthUser>((resolve) => {
            resolveRetry = resolve;
          })
      );
    const user = userEvent.setup();
    renderApp(api, '/eventos');

    await user.click(
      await screen.findByRole('button', {
        name: 'Reintentar'
      })
    );

    expect(await screen.findByText('Restaurando tu sesión…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    resolveRetry(independentUser);
    expect(await screen.findByRole('heading', { name: 'Eventos', level: 1 })).toBeInTheDocument();
    expect(api.auth.me).toHaveBeenCalledTimes(2);
    expect(api.auth.login).not.toHaveBeenCalled();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('takes a retry that confirms 401 to login', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me)
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    const user = userEvent.setup();
    renderApp(api, '/eventos');

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(api.auth.me).toHaveBeenCalledTimes(2);
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('stays unavailable after a repeated error without an automatic retry loop', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(new TypeError('network down'));
    const user = userEvent.setup();
    renderApp(api, '/login');

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'No pudimos verificar tu sesión' })).toBeInTheDocument();
    expect(api.auth.me).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    expect(api.auth.me).toHaveBeenCalledTimes(2);
  });

  it('logs out, clears data and redirects to login', async () => {
    const api = mockApiClient();
    const user = userEvent.setup();
    const { router, queryClient } = renderApp(api, '/eventos');
    queryClient.setQueryData(['private'], { secret: true });

    const buttons = await screen.findAllByRole('button', { name: 'Cerrar sesión' });
    await user.click(buttons[0]!);

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
  });

  it('redirects Platform Admin externally without rendering the Client dashboard', async () => {
    const api = mockApiClient(platformAdmin);
    const navigateExternal = vi.fn();
    renderApp(api, '/eventos', navigateExternal);

    await waitFor(() => expect(navigateExternal).toHaveBeenCalledWith('http://localhost:5174'));
    expect(screen.queryByRole('heading', { name: 'Eventos', level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acceso no permitido' })).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('redirects Platform Admin returned by login without logout or a Client-page flash', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    vi.mocked(api.auth.login).mockResolvedValue(loginResult(platformAdmin));
    const navigateExternal = vi.fn();
    renderApp(api, '/login', navigateExternal);

    await submitLogin();

    await waitFor(() => expect(navigateExternal).toHaveBeenCalledWith('http://localhost:5174'));
    expect(api.auth.logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acceso no permitido' })).not.toBeInTheDocument();
  });

  it('logs out an incompatible role and shows access denied', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockResolvedValue({
      ...independentUser,
      role: 'UNSUPPORTED_ROLE'
    } as unknown as AuthUser);
    renderApp(api, '/eventos');

    expect(await screen.findByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument();
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
  });

  it('shows access denied for an incompatible role restored directly on /login', async () => {
    const api = mockApiClient();
    vi.mocked(api.auth.me).mockResolvedValue({
      ...independentUser,
      role: 'UNSUPPORTED_ROLE'
    } as unknown as AuthUser);
    renderApp(api, '/login');

    expect(await screen.findByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Correo electrónico/)).not.toBeInTheDocument();
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
  });

  it('shows access denied when login returns an incompatible role', async () => {
    const api = mockApiClient();
    const incompatibleUser = {
      ...independentUser,
      role: 'UNSUPPORTED_ROLE'
    } as unknown as AuthUser;
    vi.mocked(api.auth.me).mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Unauthorized'));
    vi.mocked(api.auth.login).mockResolvedValue(loginResult(incompatibleUser));
    const { queryClient } = renderApp(api, '/login');
    queryClient.setQueryData(['private'], { secret: true });

    await submitLogin();

    expect(await screen.findByRole('heading', { name: 'Acceso no permitido' })).toBeInTheDocument();
    expect(screen.queryByText('Correo o contraseña incorrectos.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Correo electrónico/)).not.toBeInTheDocument();
    expect(api.auth.logout).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
  });

  it('rejects external, parent and protocol-relative return targets', () => {
    expect(safeReturnTo('//evil.example')).toBe('/eventos');
    expect(safeReturnTo('https://evil.example')).toBe('/eventos');
    expect(safeReturnTo('/\\evil')).toBe('/eventos');
    expect(safeReturnTo('/login')).toBe('/eventos');
    expect(safeReturnTo('/finanzas?tab=balance')).toBe('/finanzas?tab=balance');
  });

  it('renders a neutral public 404 without restoring session and supports keyboard focus', async () => {
    const api = mockApiClient();
    const user = userEvent.setup();
    renderApp(api, '/ruta-inexistente');

    expect(await screen.findByRole('heading', { name: 'Esta página no está disponible.' })).toBeInTheDocument();
    expect(api.auth.me).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Ir al inicio' })).toHaveFocus();
  });
});
