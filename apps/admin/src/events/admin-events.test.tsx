import { ApiError } from '@invitaciones/api-client';
import { screen, waitFor, within } from '@testing-library/react';
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
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restaurar' }));
    await waitFor(() => expect(api.adminEvents.restore).toHaveBeenCalledWith('event-b'));
    expect(api.adminEvents.get).toHaveBeenCalledTimes(2);
  });

  it('renders a retry state for an administrative 404', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEvents.get).mockRejectedValue(new ApiError(404, 'EVENT_NOT_FOUND', 'missing'));
    renderAdminApp(api, '/eventos/missing');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
