import type { AdminPilotObservationJournal } from '@invitaciones/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminEvent, mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';

const journal: AdminPilotObservationJournal = {
  observations: [
    {
      id: 'audit-secret-id',
      createdAt: '2026-08-20T18:30:00.000Z',
      kind: 'INCIDENT',
      area: 'CHECKIN',
      count: 1,
      note: 'Fila detenida durante el ingreso'
    }
  ],
  summary: {
    preparationMinutesTotal: 75,
    invitationPreparationMinutes: 30,
    floorplanPreparationMinutes: 45,
    plannerSupportMinutes: 15,
    plannerSupportEntries: 1,
    incidents: 2,
    checkinIncidents: 2,
    lastMinuteChanges: 3,
    manualWorkMinutes: 20,
    manualWorkEntries: 1,
    guestCount: 120,
    tableCount: 12
  }
};

describe('Admin pilot operational log', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the authoritative Admin event before using its client-scoped journal', async () => {
    const api = mockAdminApi();
    const pending = deferred<typeof adminEvent>();
    vi.mocked(api.adminEvents.get).mockReturnValue(pending.promise);
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);

    expect(api.adminEventPreparation.listPilotObservations).not.toHaveBeenCalled();
    pending.resolve(adminEvent);
    expect(await screen.findByRole('heading', { name: 'Resumen operativo' })).toBeInTheDocument();
    expect(api.adminEventPreparation.listPilotObservations).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      expect.any(AbortSignal)
    );
    expect(screen.getByRole('link', { name: 'Registro operativo' })).toHaveAttribute(
      'href',
      `/eventos/${adminEvent.id}/preparar/registro`
    );
    expect(api.adminEventPreparation.getReadiness).not.toHaveBeenCalled();
  });

  it('shows aggregate metrics, natural history and the privacy boundary without technical identifiers', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);

    expect(await screen.findByText('75 min')).toBeInTheDocument();
    expect(screen.getByText('120 invitados')).toBeInTheDocument();
    expect(screen.getByText('12 mesas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Incidencia · Check-in' })).toBeInTheDocument();
    expect(screen.getByText('Fila detenida durante el ingreso')).toBeInTheDocument();
    expect(screen.getByText(/No incluyas nombres, teléfonos ni datos personales de invitados/)).toBeInTheDocument();
    expect(screen.queryByText('audit-secret-id')).not.toBeInTheDocument();
    expect(screen.queryByText('PILOT_OBSERVATION_RECORDED')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar|Eliminar/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('pilot-summary')).toHaveAttribute('aria-busy', 'false');
  });

  it.each([['Tiempo de preparación'], ['Soporte a Planner'], ['Trabajo manual repetitivo']] as const)(
    'requires active minutes for %s',
    async (label) => {
      const api = mockAdminApi();
      vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
      await screen.findByRole('heading', { name: 'Registrar actividad' });

      await userEvent.click(screen.getByLabelText('Tipo de actividad'));
      await userEvent.click(screen.getByRole('option', { name: label }));
      expect(screen.getByLabelText(/Tiempo invertido/)).toBeRequired();
      expect(screen.queryByLabelText('Cantidad')).not.toBeInTheDocument();
    }
  );

  it('keeps natural form choices usable at tablet width with 44px submission target', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 });
    window.dispatchEvent(new Event('resize'));
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    await screen.findByRole('heading', { name: 'Registrar actividad' });

    await userEvent.click(screen.getByLabelText('Área'));
    for (const label of ['General', 'Invitación', 'Croquis', 'Invitados', 'RSVP', 'Mesas', 'Staff', 'Check-in']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Registrar actividad' })).toHaveStyle({ minHeight: '44px' });
    expect(api.events.get).not.toHaveBeenCalled();
  });

  it('validates required duration and records incident count through the specialized Admin client', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.createPilotObservation).mockResolvedValue({
      id: 'created-id',
      createdAt: '2026-08-20T19:00:00.000Z',
      kind: 'INCIDENT',
      area: 'CHECKIN',
      count: 1,
      note: 'Acceso lento'
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    await screen.findByRole('heading', { name: 'Registrar actividad' });

    expect(screen.getByLabelText(/Tiempo invertido/)).toBeRequired();
    expect(api.adminEventPreparation.createPilotObservation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByLabelText('Tipo de actividad'));
    await userEvent.click(screen.getByRole('option', { name: 'Incidencia' }));
    await waitFor(() => expect(screen.getByLabelText('Tipo de actividad')).toHaveTextContent('Incidencia'));
    await userEvent.click(screen.getByLabelText('Área'));
    await userEvent.click(screen.getByRole('option', { name: 'Check-in' }));
    await userEvent.type(screen.getByLabelText('Nota operativa (opcional)'), '  Acceso lento  ');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Registrar actividad' }));

    await waitFor(() => expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce());
    expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
      kind: 'INCIDENT',
      area: 'CHECKIN',
      count: 1,
      note: 'Acceso lento'
    });
    expect(api.adminEventPreparation.listPilotObservations).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Actividad registrada.')).toBeInTheDocument();
  });

  it('never replays a confirmed POST when refresh fails and offers a GET-only recovery', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations)
      .mockResolvedValueOnce(journal)
      .mockRejectedValueOnce(new Error('GET unavailable'))
      .mockResolvedValueOnce(journal);
    vi.mocked(api.adminEventPreparation.createPilotObservation).mockResolvedValue({
      id: 'created-id',
      createdAt: '2026-08-20T19:00:00.000Z',
      kind: 'INCIDENT',
      area: 'GENERAL',
      count: 1
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    await screen.findByRole('heading', { name: 'Registrar actividad' });
    await userEvent.click(screen.getByLabelText('Tipo de actividad'));
    await userEvent.click(screen.getByRole('option', { name: 'Incidencia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar actividad' }));

    expect(
      await screen.findByText(/La actividad quedó registrada, pero no se pudo actualizar el resumen/)
    ).toBeInTheDocument();
    expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar registro' }));
    await waitFor(() => expect(api.adminEventPreparation.listPilotObservations).toHaveBeenCalledTimes(3));
    expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Actualizar registro' })).not.toBeInTheDocument();
  });

  it('does not show success or retry POST automatically when creation fails', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.createPilotObservation).mockRejectedValue(new Error('network'));
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    await screen.findByRole('heading', { name: 'Registrar actividad' });
    await userEvent.click(screen.getByLabelText('Tipo de actividad'));
    await userEvent.click(screen.getByRole('option', { name: 'Incidencia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar actividad' }));

    await waitFor(() => expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce());
    expect(screen.queryByText('Actividad registrada.')).not.toBeInTheDocument();
    expect(api.adminEventPreparation.listPilotObservations).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
