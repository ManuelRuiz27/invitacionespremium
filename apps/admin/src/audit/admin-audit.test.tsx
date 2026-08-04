import { ApiError, type AdminAuditLog } from '@invitaciones/api-client';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const entry = (overrides: Partial<AdminAuditLog> = {}): AdminAuditLog => ({
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-08-04T18:30:00.000Z',
  actorType: 'USER',
  actorId: '22222222-2222-4222-8222-222222222222',
  actorFingerprint: null,
  resourceType: 'Client',
  resourceId: '33333333-3333-4333-8333-333333333333',
  clientId: '44444444-4444-4444-8444-444444444444',
  eventId: null,
  action: 'CLIENT_UPDATED',
  operationId: '55555555-5555-4555-8555-555555555555',
  beforeData: { status: 'ACTIVE' },
  afterData: { status: 'SUSPENDED' },
  metadata: { source: 'admin' },
  ...overrides
});

describe('consulta administrativa de auditoría', () => {
  it('expone la ruta en navegación, cabecera read-only, filtros y columnas operativas', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminAudit.listAuditLogs).mockResolvedValue({ items: [entry()], nextCursor: null });
    renderAdminApp(api, '/auditoria');

    expect(await screen.findByRole('heading', { name: 'Auditoría' })).toBeVisible();
    expect((await screen.findAllByText('CLIENT_UPDATED')).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Auditoría' })).toBeVisible();
    expect(screen.getByText(/exclusivamente de lectura/i)).toBeVisible();
    for (const label of [
      'Cliente ID',
      'Evento ID',
      'Tipo de actor',
      'Actor ID',
      'Tipo de recurso',
      'Recurso ID',
      'Acción',
      'Operación ID',
      'Desde',
      'Hasta'
    ]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
    for (const heading of ['Fecha', 'Actor', 'Acción', 'Recurso', 'Cliente', 'Evento', 'Operación']) {
      expect(screen.getByRole('columnheader', { name: heading })).toBeVisible();
    }
    expect(api.adminAudit.listAuditLogs).toHaveBeenCalledWith({ limit: 25 }, expect.any(AbortSignal));
  });

  it('convierte fechas locales a instantes, aplica filtros completos y limpia la página', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/auditoria');
    await screen.findByText('Sin registros');
    await userEvent.type(screen.getByLabelText('Cliente ID'), '44444444-4444-4444-8444-444444444444');
    await userEvent.click(screen.getByLabelText('Tipo de actor'));
    await userEvent.click(screen.getByRole('option', { name: 'Sistema' }));
    await userEvent.type(screen.getByLabelText('Acción'), 'CLIENT_UPDATED');
    await userEvent.type(screen.getByLabelText('Desde'), '2026-08-04T12:30');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() =>
      expect(api.adminAudit.listAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          clientId: '44444444-4444-4444-8444-444444444444',
          actorType: 'SYSTEM',
          action: 'CLIENT_UPDATED',
          createdFrom: expect.any(String),
          limit: 25
        }),
        expect.any(AbortSignal)
      )
    );
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(await screen.findByText('Sin registros')).toBeVisible();
    expect(screen.getByLabelText('Cliente ID')).toHaveValue('');
  });

  it('representa correctamente todos los actores y abre JSON como texto seguro bajo demanda', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminAudit.listAuditLogs).mockResolvedValue({
      items: [
        entry(),
        entry({ id: '21111111-1111-4111-8111-111111111111', actorType: 'STAFF_TOKEN' }),
        entry({
          id: '31111111-1111-4111-8111-111111111111',
          actorType: 'PUBLIC_TOKEN',
          actorId: null,
          actorFingerprint: 'a'.repeat(64)
        }),
        entry({
          id: '41111111-1111-4111-8111-111111111111',
          actorType: 'SYSTEM',
          actorId: null,
          metadata: { html: '<img src=x onerror=alert(1)>', large: 'x'.repeat(10_000) }
        })
      ],
      nextCursor: null
    });
    renderAdminApp(api, '/auditoria');
    expect((await screen.findAllByText(/Usuario · 2222/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Token staff · 2222/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Token público · aaaaaaaa…aaaaaa/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sistema').length).toBeGreaterThan(0);
    expect(screen.queryByText(/onerror/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver detalle 41111111-1111-4111-8111-111111111111' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/<img src=x onerror=alert\(1\)>/)).toBeVisible();
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeVisible();
  });

  it('pagina con cursor, vuelve atrás y bloquea navegación durante la carga', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminAudit.listAuditLogs)
      .mockResolvedValueOnce({ items: [entry()], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [entry({ action: 'PAGE_TWO' })], nextCursor: null })
      .mockResolvedValueOnce({ items: [entry()], nextCursor: 'cursor-2' });
    renderAdminApp(api, '/auditoria');
    const next = await screen.findByRole('button', { name: 'Siguiente' });
    await waitFor(() => expect(next).toBeEnabled());
    await userEvent.click(next);
    expect((await screen.findAllByText('PAGE_TWO')).length).toBeGreaterThan(0);
    expect(api.adminAudit.listAuditLogs).toHaveBeenLastCalledWith(
      { limit: 25, cursor: 'cursor-2' },
      expect.any(AbortSignal)
    );
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect((await screen.findAllByText('CLIENT_UPDATED')).length).toBeGreaterThan(0);
    expect(screen.queryByText('PAGE_TWO')).not.toBeInTheDocument();
  });

  it('aborta la consulta A y nunca muestra su respuesta en los filtros B', async () => {
    const api = mockAdminApi();
    const pendingA = deferred<{ items: AdminAuditLog[]; nextCursor: null }>();
    vi.mocked(api.adminAudit.listAuditLogs).mockImplementation((filters) => {
      if (filters?.resourceType === 'A') return pendingA.promise;
      if (filters?.resourceType === 'B')
        return Promise.resolve({ items: [entry({ action: 'RESULT_B' })], nextCursor: null });
      return Promise.resolve({ items: [], nextCursor: null });
    });
    renderAdminApp(api, '/auditoria');
    await screen.findByText('Sin registros');
    const resource = screen.getByLabelText('Tipo de recurso');
    await userEvent.type(resource, 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() =>
      expect(api.adminAudit.listAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'A' }),
        expect.any(AbortSignal)
      )
    );
    await userEvent.clear(resource);
    await userEvent.type(resource, 'B');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect((await screen.findAllByText('RESULT_B')).length).toBeGreaterThan(0);
    pendingA.resolve({ items: [entry({ action: 'RESULT_A' })], nextCursor: null });
    await waitFor(() => expect(screen.queryByText('RESULT_A')).not.toBeInTheDocument());
    const callA = vi.mocked(api.adminAudit.listAuditLogs).mock.calls.find(([filters]) => filters?.resourceType === 'A');
    expect(callA?.[1]?.aborted).toBe(true);
  });

  it('distingue 403, fallos recuperables y desmonta la vista por expiración central', async () => {
    const forbiddenApi = mockAdminApi();
    vi.mocked(forbiddenApi.adminAudit.listAuditLogs).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'forbidden'));
    const first = renderAdminApp(forbiddenApi, '/auditoria');
    expect(await screen.findByText('No tienes permiso para consultar la auditoría.')).toBeVisible();
    expect(forbiddenApi.auth.logout).not.toHaveBeenCalled();
    first.unmount();

    const retryApi = mockAdminApi();
    vi.mocked(retryApi.adminAudit.listAuditLogs)
      .mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', 'slow'))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    renderAdminApp(retryApi, '/auditoria');
    expect(await screen.findByText(/resultado no pudo confirmarse/i)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin registros')).toBeVisible();
  });

  it('desmonta por 401 central y trata AbortError como cancelación neutral', async () => {
    const api = mockAdminApi();
    const { router, unauthorizedController, unmount } = renderAdminApp(api, '/auditoria');
    expect(await screen.findByText('Sin registros')).toBeVisible();
    unauthorizedController.notify();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(screen.queryByRole('heading', { name: 'Auditoría' })).not.toBeInTheDocument();
    unmount();

    const abortedApi = mockAdminApi();
    vi.mocked(abortedApi.adminAudit.listAuditLogs).mockRejectedValue(new DOMException('cancelled', 'AbortError'));
    renderAdminApp(abortedApi, '/auditoria');
    expect(await screen.findByText('La consulta fue cancelada.')).toBeVisible();
    expect(screen.queryByText(/No pudimos|resultado no pudo/i)).not.toBeInTheDocument();
  });

  it('deduplica una doble aplicación sincrónica de los mismos filtros', async () => {
    const api = mockAdminApi();
    const pending = deferred<{ items: AdminAuditLog[]; nextCursor: null }>();
    vi.mocked(api.adminAudit.listAuditLogs).mockImplementation((filters) =>
      filters?.action === 'SAME' ? pending.promise : Promise.resolve({ items: [], nextCursor: null })
    );
    renderAdminApp(api, '/auditoria');
    await screen.findByText('Sin registros');
    await userEvent.type(screen.getByLabelText('Acción'), 'SAME');
    const form = screen.getByRole('button', { name: 'Aplicar filtros' }).closest('form');
    if (!form) throw new Error('Audit filter form is missing.');
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => {
      const matchingCalls = vi
        .mocked(api.adminAudit.listAuditLogs)
        .mock.calls.filter(([filters]) => filters?.action === 'SAME');
      expect(matchingCalls).toHaveLength(1);
    });
    pending.resolve({ items: [], nextCursor: null });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
