import { ApiError, type AuthUser } from '@invitaciones/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { safeReturnTo } from './AuthProvider';
import { independentUser, loginResult, mockApiClient, platformAdmin } from '../test/fixtures';
import { renderApp } from '../test/render-app';

describe('Client authentication and routing', () => {
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

  it('rejects external, parent and protocol-relative return targets', () => {
    expect(safeReturnTo('//evil.example')).toBe('/eventos');
    expect(safeReturnTo('https://evil.example')).toBe('/eventos');
    expect(safeReturnTo('/\\evil')).toBe('/eventos');
    expect(safeReturnTo('/login')).toBe('/eventos');
    expect(safeReturnTo('/finanzas?tab=balance')).toBe('/finanzas?tab=balance');
  });

  it('renders a 404 route and supports keyboard focus on its action', async () => {
    const api = mockApiClient();
    const user = userEvent.setup();
    renderApp(api, '/ruta-inexistente');

    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Ir a Eventos' })).toHaveFocus();
  });
});
