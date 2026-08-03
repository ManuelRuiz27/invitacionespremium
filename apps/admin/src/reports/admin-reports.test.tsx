import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminReport } from '@invitaciones/api-client';
import { mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const report = (eventId: string): AdminReport => ({
  id: `report-${eventId}`,
  clientId: 'client-a',
  eventId,
  requestedByUserId: 'admin-1',
  type: 'ATTENDANCE',
  status: 'READY',
  privacyMode: 'AGGREGATE',
  templateVersion: 1,
  generatedAtSnapshot: '2026-08-01T00:00:00.000Z',
  detailedUntil: '2026-08-10T00:00:00.000Z',
  retentionUntil: '2027-02-01T00:00:00.000Z'
});

describe('reportes administrativos', () => {
  it('muestra solo metadata y los cortes exactos sin parametros', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminReports.list).mockResolvedValue([{ ...report('event-a'), downloadPath: '/forbidden' }]);
    renderAdminApp(api, '/reportes');
    expect((await screen.findAllByText('Asistencia')).length).toBeGreaterThan(0);
    expect(screen.queryByText('/forbidden')).not.toBeInTheDocument();
    expect(screen.getByText(/No se exponen dataset, nombres, PDF, descarga, hashes/i)).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'Cortes financieros' }));
    expect(await screen.findByText('Corte diario')).toBeVisible();
    expect(screen.getByText('Corte mensual')).toBeVisible();
    expect(api.adminFinance.dailyCut).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(api.adminFinance.monthlyCut).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('aborta A y nunca muestra su respuesta bajo el Evento B', async () => {
    const api = mockAdminApi();
    let resolveA!: (value: AdminReport[]) => void;
    vi.mocked(api.adminReports.listEvent).mockImplementation((eventId) =>
      eventId === 'event-a'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([report('event-b')])
    );
    const { router } = renderAdminApp(api, '/reportes/eventos/event-a');
    await waitFor(() => expect(api.adminReports.listEvent).toHaveBeenCalledWith('event-a', expect.any(AbortSignal)));
    await router.navigate('/reportes/eventos/event-b');
    expect(await screen.findByText(/Evento event-b/)).toBeVisible();
    resolveA([report('event-a')]);
    await waitFor(() => expect(screen.queryByText(/Evento event-a/)).not.toBeInTheDocument());
    const firstSignal = vi.mocked(api.adminReports.listEvent).mock.calls[0]?.[1];
    expect(firstSignal?.aborted).toBe(true);
  });
});
