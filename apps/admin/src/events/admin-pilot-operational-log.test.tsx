import type { AdminPilotObservationJournal, AdminUnitEconomics } from '@invitaciones/api-client';
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

const economics: AdminUnitEconomics = {
  eventId: adminEvent.id,
  clientId: adminEvent.clientId,
  eventName: adminEvent.name,
  eventStatus: adminEvent.status,
  serviceCode: 'FLYER',
  commercialChannel: 'PARTNER',
  commercialChannelSource: 'SNAPSHOT',
  capacity: 120,
  capacityMin: 101,
  capacityMax: 150,
  venueTier: null,
  activatedAt: adminEvent.activatedAt,
  grossRevenueCredits: 10,
  refundCredits: 1,
  netRevenueCredits: 9,
  creditUnitValueMxnCents: 2000,
  grossRevenueMxnCents: 20000,
  refundMxnCents: 2000,
  netRevenueMxnCents: 18000,
  designerCostMxnCents: 5000,
  externalCostMxnCents: 1500,
  technologyCostMxnCents: 500,
  directCostMxnCents: 7000,
  designRounds: 2,
  operatorMinutesTotal: 75,
  operatorMinutesByArea: {
    GENERAL: 0,
    INVITATION: 30,
    FLOORPLAN: 45,
    GUESTS: 0,
    RSVP: 0,
    SEATING: 0,
    STAFF: 0,
    CHECKIN: 0,
    CLOSE_REPORT: 0
  },
  operatorHourlyRateMxnCents: null,
  operatorShadowCostMxnCents: null,
  contributionMarginMxnCents: 11000,
  contributionMarginPct: 61.11,
  contributionAfterOperatorShadowMxnCents: null,
  contributionAfterOperatorShadowPct: null
};

describe('Admin pilot operational log', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the authoritative event and both event-scoped operational sources in parallel', async () => {
    const api = mockAdminApi();
    const pending = deferred<typeof adminEvent>();
    vi.mocked(api.adminEvents.get).mockReturnValue(pending.promise);
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);

    expect(api.adminEventPreparation.listPilotObservations).not.toHaveBeenCalled();
    pending.resolve(adminEvent);
    expect(await screen.findByRole('heading', { name: 'Rentabilidad estimada' })).toBeInTheDocument();
    expect(api.adminEventPreparation.listPilotObservations).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      expect.any(AbortSignal)
    );
    expect(api.adminEventPreparation.getUnitEconomics).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      expect.any(AbortSignal)
    );
    expect(api.adminEventPreparation.getReadiness).not.toHaveBeenCalled();
  });

  it('shows economics, operational aggregates, natural history and the privacy boundary', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);

    expect((await screen.findAllByText('75 min')).length).toBeGreaterThan(0);
    expect(screen.getByText('120 invitados')).toBeInTheDocument();
    expect(screen.getByText('$180.00')).toBeInTheDocument();
    expect(screen.getByText('61.11%')).toBeInTheDocument();
    expect(screen.getByText('Planner / agencia')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Incidencia · Check-in' })).toBeInTheDocument();
    expect(screen.getByText(/No incluyas nombres, teléfonos ni datos personales/)).toBeInTheDocument();
    expect(screen.queryByText('audit-secret-id')).not.toBeInTheDocument();
    expect(screen.queryByText('PILOT_OBSERVATION_RECORDED')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar|Eliminar/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('unit-economics-summary')).toHaveAttribute('aria-busy', 'false');
  });

  it.each([['Tiempo de preparación'], ['Soporte a Planner'], ['Trabajo manual repetitivo']] as const)(
    'requires active minutes for %s',
    async (label) => {
      const api = mockAdminApi();
      vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
      vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
      renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
      await screen.findByRole('heading', { name: 'Registrar actividad' });
      await userEvent.click(screen.getByLabelText('Tipo de actividad'));
      await userEvent.click(screen.getByRole('option', { name: label }));
      expect(screen.getByLabelText(/Tiempo invertido/)).toBeRequired();
      expect(screen.queryByLabelText('Cantidad')).not.toBeInTheDocument();
    }
  );

  it('records an incident once on double click and refreshes both summaries', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
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
    await userEvent.click(screen.getByLabelText('Tipo de actividad'));
    await userEvent.click(screen.getByRole('option', { name: 'Incidencia' }));
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
    expect(api.adminEventPreparation.getUnitEconomics).toHaveBeenCalledTimes(2);
  });

  it('converts $1,250.50 to integer cents and keeps one POST on double click', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
    vi.mocked(api.adminEventPreparation.createPilotObservation).mockResolvedValue({
      id: 'cost-id',
      createdAt: '2026-08-20T19:00:00.000Z',
      kind: 'DESIGNER_COST',
      area: 'INVITATION',
      amountMxnCents: 125050,
      count: 1
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    await screen.findByRole('heading', { name: 'Registrar costo directo' });
    await userEvent.type(screen.getByLabelText('Monto MXN'), '$1,250.50');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Registrar costo' }));

    await waitFor(() => expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce());
    expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
      kind: 'DESIGNER_COST',
      area: 'INVITATION',
      amountMxnCents: 125050,
      count: 1
    });
    expect(api.adminEventPreparation.getUnitEconomics).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Costo registrado.')).toBeInTheDocument();
  });

  it('records a design round through the same mutation boundary', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
    vi.mocked(api.adminEventPreparation.createPilotObservation).mockResolvedValue({
      id: 'round-id',
      createdAt: '2026-08-20T19:00:00.000Z',
      kind: 'DESIGN_ROUND',
      area: 'INVITATION',
      count: 1,
      note: 'Segunda propuesta'
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    await screen.findByRole('heading', { name: 'Rondas de diseño' });
    await userEvent.type(screen.getByLabelText('Nota de ronda (opcional)'), 'Segunda propuesta');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar ronda de diseño' }));
    await waitFor(() => expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce());
    expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledWith(adminEvent.clientId, adminEvent.id, {
      kind: 'DESIGN_ROUND',
      area: 'INVITATION',
      count: 1,
      note: 'Segunda propuesta'
    });
  });

  it('corrects append-only, preserves the original in history and refreshes economics', async () => {
    const corrected = {
      ...journal.observations[0]!,
      correctedAt: '2026-08-21T10:00:00.000Z',
      correctionReason: 'Duplicado operativo'
    };
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations)
      .mockResolvedValueOnce(journal)
      .mockResolvedValue({ ...journal, observations: [corrected] });
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
    vi.mocked(api.adminEventPreparation.correctPilotObservation).mockResolvedValue(corrected);
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    await screen.findByText('Fila detenida durante el ingreso');
    await userEvent.click(screen.getByRole('button', { name: 'Corregir registro' }));
    await userEvent.type(screen.getByLabelText('Motivo de corrección'), 'Duplicado operativo');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Confirmar corrección' }));

    await waitFor(() => expect(api.adminEventPreparation.correctPilotObservation).toHaveBeenCalledOnce());
    expect(api.adminEventPreparation.correctPilotObservation).toHaveBeenCalledWith(
      adminEvent.clientId,
      adminEvent.id,
      'audit-secret-id',
      { reason: 'Duplicado operativo' }
    );
    expect(await screen.findByText(/Motivo: Duplicado operativo/)).toBeInTheDocument();
    expect(screen.getByText('Fila detenida durante el ingreso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir registro' })).not.toBeInTheDocument();
    expect(api.adminEventPreparation.getUnitEconomics).toHaveBeenCalledTimes(2);
  });

  it('renders negative margin and unavailable shadow cost without finance-accounting labels or overflow', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations).mockResolvedValue(journal);
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue({
      ...economics,
      directCostMxnCents: 23000,
      contributionMarginMxnCents: -5000,
      contributionMarginPct: -27.78,
      operatorHourlyRateMxnCents: null,
      operatorShadowCostMxnCents: null
    });
    renderAdminApp(api, `/eventos/${adminEvent.id}/preparar/registro`);
    expect(await screen.findByText('-$50.00')).toBeInTheDocument();
    expect(screen.getByText('-27.78%')).toBeInTheDocument();
    expect(screen.getByText(/Costo sombra no disponible/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Utilidad|Saldo|Deuda|Línea de crédito/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('unit-economics-summary')).toHaveStyle({ overflow: 'hidden' });
    expect(screen.getByRole('button', { name: 'Registrar costo' })).toHaveStyle({ minHeight: '44px' });
  });

  it('never replays a confirmed POST when the GET-only refresh fails', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminEventPreparation.listPilotObservations)
      .mockResolvedValueOnce(journal)
      .mockRejectedValueOnce(new Error('GET unavailable'))
      .mockResolvedValueOnce(journal);
    vi.mocked(api.adminEventPreparation.getUnitEconomics).mockResolvedValue(economics);
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
    expect(await screen.findByText(/quedó guardado, pero no se pudo actualizar/)).toBeInTheDocument();
    expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar registro' }));
    await waitFor(() => expect(api.adminEventPreparation.listPilotObservations).toHaveBeenCalledTimes(3));
    expect(api.adminEventPreparation.createPilotObservation).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
