import { ApiError } from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { adminEvent, deletedEvent, mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

describe('Admin Events', () => {
  it('uses the global administrative list and natural state labels', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/eventos');
    expect(await screen.findByText(adminEvent.name!)).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Cerrado')).toBeInTheDocument();
    expect(api.adminEvents.list).toHaveBeenCalled();
    expect(api.events.list).not.toHaveBeenCalled();
  });

  it('keeps detail read-only and tied to eventId', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/eventos/event-a');
    expect(await screen.findByRole('heading', { name: adminEvent.name!, level: 1 })).toBeInTheDocument();
    expect(api.adminEvents.get).toHaveBeenCalledWith('event-a', expect.any(AbortSignal));
    expect(screen.queryByRole('button', { name: /activar|cancelar|editar/i })).not.toBeInTheDocument();
    expect(api.events.get).not.toHaveBeenCalled();
  });

  it('restores a deleted Event only after confirmation', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockResolvedValue(deletedEvent);
    const user = userEvent.setup();
    renderAdminApp(api, '/eventos/event-b');
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));
    expect(api.adminEvents.restore).not.toHaveBeenCalled();
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Restaurar' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api.adminEvents.restore).toHaveBeenCalledWith('event-b', expect.any(AbortSignal)));
    expect(api.adminEvents.restore).toHaveBeenCalledTimes(1);
    expect(api.adminEvents.get).toHaveBeenCalledTimes(2);
  });

  it('renders a retry state for an administrative 404', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockRejectedValue(new ApiError(404, 'EVENT_NOT_FOUND', 'missing'));
    renderAdminApp(api, '/eventos/missing');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('aborts Event A restore on A-to-B navigation and discards the late response', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockImplementation((eventId) =>
      Promise.resolve(eventId === 'event-b' ? deletedEvent : adminEvent)
    );
    const pending = deferred<typeof adminEvent>();
    vi.mocked(api.adminEvents.restore).mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const { router } = renderAdminApp(api, '/eventos/event-b');
    await user.click(await screen.findByRole('button', { name: 'Restaurar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(api.adminEvents.restore).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(api.adminEvents.restore).mock.calls[0]?.[1];
    await act(() => router.navigate('/eventos/event-a'));
    expect(await screen.findByRole('heading', { name: adminEvent.name!, level: 1 })).toBeInTheDocument();
    expect(signal?.aborted).toBe(true);
    pending.resolve(adminEvent);
    await act(async () => Promise.resolve());
    expect(screen.getByRole('heading', { name: adminEvent.name!, level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/Evento eliminado/)).not.toBeInTheDocument();
  });

  it('expires session on an Event resource 401 but keeps it on 403', async () => {
    const api = mockAdminApi();
    const { queryClient, router, unauthorizedController } = renderAdminApp(api, '/eventos/event-a');
    expect(await screen.findByRole('heading', { name: adminEvent.name!, level: 1 })).toBeInTheDocument();
    vi.mocked(api.adminEvents.get).mockImplementationOnce(() => {
      unauthorizedController.notify();
      return Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'expired'));
    });
    await act(() => queryClient.invalidateQueries({ queryKey: ['admin-event', 'event-a'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.queryByText(adminEvent.name!)).not.toBeInTheDocument();

    const forbiddenApi = mockAdminApi();
    vi.mocked(forbiddenApi.adminEvents.get).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'forbidden'));
    renderAdminApp(forbiddenApi, '/eventos/event-a');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(forbiddenApi.auth.logout).not.toHaveBeenCalled();
  });

  it('expires the session when the global Event collection returns 401', async () => {
    const api = mockAdminApi();
    const view = renderAdminApp(api, '/eventos');
    vi.mocked(api.adminEvents.list).mockImplementationOnce(() => {
      view.unauthorizedController.notify();
      return Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'expired'));
    });
    await act(() => view.queryClient.invalidateQueries({ queryKey: ['admin-events'] }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe('/login'));
    expect(screen.queryByText(adminEvent.name!)).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
