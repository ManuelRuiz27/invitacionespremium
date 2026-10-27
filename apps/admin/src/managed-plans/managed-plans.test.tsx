import {
  ApiError,
  type AdminManagedContract,
  type AdminManagedConsumption,
  type AdminManagedPlan,
  type AdminManagedPlanVersion
} from '@invitaciones/api-client';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi, organization, suspendedPlanner } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';
import { managedMoney } from './managed-plan-format';

const at = '2026-10-01T06:00:00.000Z';
const version = {
  id: 'version-standard-essential',
  planId: 'plan-standard-essential',
  commercialName: 'Esencial',
  monthlyAmountMxnCents: 790000,
  initialFeeMxnCents: 490000,
  extraEventAmountMxnCents: 125000,
  contractMonths: 12,
  includedEventsPerMonth: 4,
  monthlyEventLimit: 4,
  includedEventsPerYear: null,
  eventCapacity: 150,
  validFrom: at,
  validUntil: null,
  createdAt: at,
  createdByUserId: null,
  status: 'CURRENT'
} satisfies AdminManagedPlanVersion;
const plans = (['STANDARD', 'PRIVATE'] as const).flatMap((modality) =>
  (['ESSENTIAL', 'FREQUENT', 'INTENSIVE'] as const).map((tier, index) => {
    const id = `plan-${modality}-${tier}`;
    const current = {
      ...version,
      id: `version-${modality}-${tier}`,
      planId: id,
      commercialName: ['Esencial', 'Frecuente', 'Intensivo'][index]!,
      monthlyAmountMxnCents: (modality === 'STANDARD' ? [790000, 990000, 1290000] : [890000, 1090000, 1390000])[index]!,
      initialFeeMxnCents: modality === 'STANDARD' ? 490000 : 3990000,
      includedEventsPerMonth: [4, 8, 12][index]!,
      monthlyEventLimit: tier === 'ESSENTIAL' ? 4 : 12,
      includedEventsPerYear: tier === 'FREQUENT' ? 96 : null
    } satisfies AdminManagedPlanVersion;
    return {
      id,
      modality,
      tier,
      isAvailable: true,
      currentVersionId: current.id,
      versions: [current],
      createdAt: at,
      updatedAt: at
    } satisfies AdminManagedPlan;
  })
);
const managed = { ...organization, operatingProfile: 'MANAGED' as const };
const frequent = plans.find((plan) => plan.modality === 'STANDARD' && plan.tier === 'FREQUENT')!;
const accepted = frequent.versions[0]!;
const contract = {
  id: 'contract-a',
  clientId: organization.id,
  planVersionId: accepted.id,
  startsOn: '2026-10-01',
  endsOn: '2027-10-01',
  acceptedAt: at,
  createdAt: at,
  createdByUserId: 'admin-1',
  status: 'CURRENT',
  terms: {
    planId: frequent.id,
    planVersionId: accepted.id,
    modality: frequent.modality,
    tier: frequent.tier,
    commercialName: accepted.commercialName,
    currency: 'MXN',
    beforeTax: true,
    monthlyAmountMxnCents: accepted.monthlyAmountMxnCents,
    initialFeeMxnCents: accepted.initialFeeMxnCents,
    extraEventAmountMxnCents: accepted.extraEventAmountMxnCents,
    contractMonths: accepted.contractMonths,
    includedEventsPerMonth: accepted.includedEventsPerMonth,
    monthlyEventLimit: accepted.monthlyEventLimit,
    includedEventsPerYear: accepted.includedEventsPerYear,
    eventCapacity: accepted.eventCapacity,
    validFrom: accepted.validFrom,
    validUntil: accepted.validUntil
  }
} satisfies AdminManagedContract;
const usage = {
  contractId: contract.id,
  clientId: managed.id,
  asOf: '2026-10-27T12:00:00.000Z',
  currentPeriodIndex: 1,
  usedEvents: 13,
  includedUsedEvents: 12,
  extraordinaryEvents: 1,
  cancelledEvents: 1,
  availableEvents: 0,
  annualAvailableEvents: 84,
  periods: [
    {
      index: 1,
      startsOn: '2026-10-01',
      endsOn: '2026-11-01',
      usedEvents: 13,
      includedUsedEvents: 12,
      extraordinaryEvents: 1,
      cancelledEvents: 1,
      availableEvents: 0
    }
  ],
  events: Array.from({ length: 13 }, (_, index) => ({
    eventId: `event-${index}`,
    name: `Evento ${index + 1}`,
    activatedAt: at,
    status: index === 12 ? ('CANCELLED' as const) : ('ACTIVE' as const),
    periodIndex: 1,
    extraordinary: index === 12,
    cancelled: index === 12
  }))
} satisfies AdminManagedConsumption;

function setup() {
  const api = mockAdminApi();
  vi.mocked(api.adminClients.get).mockResolvedValue(managed);
  vi.mocked(api.adminManagedPlans.list).mockResolvedValue(plans);
  vi.mocked(api.adminManagedPlans.listContracts).mockResolvedValue([contract]);
  vi.mocked(api.adminManagedPlans.getConsumption).mockResolvedValue(usage);
  return api;
}

async function openPlans(api = setup()) {
  const rendered = renderAdminApp(api, '/catalogo');
  await userEvent.click(await screen.findByRole('tab', { name: 'Planes Gestionados' }));
  await screen.findByRole('article', { name: 'Estándar Gestionado · Esencial' });
  return { api, ...rendered };
}

describe('PR02 managed commercial administration', () => {
  it('renders six server-provided plans and separates MXN prices from event credit tariffs', async () => {
    await openPlans();
    expect(screen.getAllByRole('article')).toHaveLength(6);
    const standard = screen.getByRole('article', { name: 'Estándar Gestionado · Esencial' });
    const privatePlan = screen.getByRole('article', { name: 'Licencia Privada · Intensivo' });
    expect(standard).toHaveTextContent(managedMoney(790000));
    expect(standard).toHaveTextContent(managedMoney(490000));
    expect(privatePlan).toHaveTextContent(managedMoney(1390000));
    expect(privatePlan).toHaveTextContent(managedMoney(3990000));
    expect(standard).not.toHaveTextContent('créditos');
    expect(screen.getByText(/frontend exclusivo requiere un proyecto/)).toBeInTheDocument();
  });

  it('shows incomplete configuration and server-classified future and historical versions', async () => {
    const api = setup();
    const current = plans[0]!;
    vi.mocked(api.adminManagedPlans.list).mockResolvedValue([
      {
        ...current,
        currentVersionId: null,
        versions: [
          { ...current.versions[0]!, id: 'future', status: 'FUTURE', validFrom: '2030-01-01T00:00:00.000Z' },
          { ...current.versions[0]!, id: 'old', status: 'EXPIRED', validUntil: at }
        ]
      },
      ...plans.slice(1)
    ]);
    await openPlans(api);
    expect(screen.getByText(/Configuración incompleta:/)).toHaveTextContent('Estándar Gestionado / Esencial');
    await userEvent.click(
      within(screen.getByRole('article', { name: 'Estándar Gestionado · Esencial' })).getByRole('button', {
        name: 'Historial de Esencial'
      })
    );
    const history = screen.getByRole('dialog');
    expect(within(history).getByRole('heading', { name: 'Futura · Esencial' })).toBeInTheDocument();
    expect(within(history).getByRole('heading', { name: 'Histórica · Esencial' })).toBeInTheDocument();
  });

  it('creates a new price version once in exact MXN cents, using immediate server time', async () => {
    const api = setup();
    vi.mocked(api.adminManagedPlans.createVersion).mockResolvedValue({
      ...plans[0]!.versions[0]!,
      id: 'new-version',
      monthlyAmountMxnCents: 800050
    });
    await openPlans(api);
    await userEvent.click(
      within(screen.getByRole('article', { name: 'Estándar Gestionado · Esencial' })).getByRole('button', {
        name: 'Nueva versión de Esencial'
      })
    );
    fireEvent.change(screen.getByLabelText('Mensualidad MXN'), { target: { value: '8000.50' } });
    const save = screen.getByRole('button', { name: 'Guardar nueva versión' });
    fireEvent.click(save);
    fireEvent.click(save);
    await screen.findByText(/Nueva versión comercial guardada/);
    expect(api.adminManagedPlans.createVersion).toHaveBeenCalledTimes(1);
    const [id, payload, key] = vi.mocked(api.adminManagedPlans.createVersion).mock.calls[0]!;
    expect(id).toBe(plans[0]!.id);
    expect(payload).toMatchObject({
      monthlyAmountMxnCents: 800050,
      initialFeeMxnCents: 490000,
      extraEventAmountMxnCents: 125000
    });
    expect(payload).not.toHaveProperty('validFrom');
    expect(key).toEqual(expect.any(String));
    expect(api.adminCatalog.createPrice).not.toHaveBeenCalled();
  });

  it.each([new TypeError('offline'), new ApiError(409, 'MANAGED_PLAN_CONCURRENT_UPDATE', 'Retry the same operation.')])(
    'preserves input and key for an uncertain version (%s), blocking editing and navigation',
    async (failure) => {
      const api = setup();
      vi.mocked(api.adminManagedPlans.createVersion)
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(plans[0]!.versions[0]!);
      const { router } = await openPlans(api);
      await userEvent.click(
        within(screen.getByRole('article', { name: 'Estándar Gestionado · Esencial' })).getByRole('button', {
          name: 'Nueva versión de Esencial'
        })
      );
      fireEvent.change(screen.getByLabelText('Mensualidad MXN'), { target: { value: '8123.45' } });
      await userEvent.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));
      expect(await screen.findByRole('button', { name: 'Reintentar misma versión' })).toBeEnabled();
      expect(screen.getByLabelText('Mensualidad MXN')).toBeDisabled();
      await act(() => router.navigate('/clientes'));
      expect(await screen.findByRole('dialog', { name: 'Conserva la operación comercial' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Permanecer' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Reintentar misma versión' }));
      await screen.findByText(/Nueva versión comercial guardada/);
      const calls = vi.mocked(api.adminManagedPlans.createVersion).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]!.slice(0, 3)).toEqual(calls[1]!.slice(0, 3));
    }
  );

  it('validates malformed currency without a request and preserves deterministic API errors', async () => {
    const api = setup();
    vi.mocked(api.adminManagedPlans.createVersion).mockRejectedValue(
      new ApiError(409, 'MANAGED_PLAN_VERSION_OVERLAP', 'overlap')
    );
    await openPlans(api);
    await userEvent.click(
      within(screen.getByRole('article', { name: 'Estándar Gestionado · Esencial' })).getByRole('button', {
        name: 'Nueva versión de Esencial'
      })
    );
    fireEvent.change(screen.getByLabelText('Mensualidad MXN'), { target: { value: '8123.456' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));
    expect(screen.getByText(/Revisa importes en MXN/)).toBeInTheDocument();
    expect(api.adminManagedPlans.createVersion).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Mensualidad MXN'), { target: { value: '8123.45' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nueva versión' }));
    expect(await screen.findByText(/vigencia se solapa con otra versión comercial/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mensualidad MXN')).toHaveValue('8123.45');
    expect(screen.queryByText(/Nueva versión comercial guardada/)).not.toBeInTheDocument();
  });

  it('changes availability through the dedicated idempotent endpoint after confirmation', async () => {
    const api = setup();
    vi.mocked(api.adminManagedPlans.setAvailability).mockResolvedValue({ ...plans[0]!, isAvailable: false });
    await openPlans(api);
    await userEvent.click(
      within(screen.getByRole('article', { name: 'Estándar Gestionado · Esencial' })).getByRole('button', {
        name: 'Desactivar disponibilidad'
      })
    );
    expect(api.adminManagedPlans.setAvailability).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Confirmar disponibilidad' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await screen.findByText(/Disponibilidad comercial guardada/);
    expect(api.adminManagedPlans.setAvailability).toHaveBeenCalledExactlyOnceWith(
      plans[0]!.id,
      { isAvailable: false },
      expect.any(String),
      expect.any(AbortSignal)
    );
  });

  it('shows contract snapshot and authoritative monthly/annual consumption, including cancelled usage', async () => {
    const api = setup();
    renderAdminApp(api, `/clientes/${managed.id}`);
    const panel = await screen.findByRole('region', { name: 'Plan comercial' });
    expect(await within(panel).findByText(/Eventos incluidos disponibles del año contractual: 84/)).toBeInTheDocument();
    const currentAvailable = within(panel).getByText('Disponibles del período actual').parentElement!;
    expect(within(currentAvailable).getByText('0')).toBeInTheDocument();
    expect(within(panel).getByText(/cancelación no devuelve cupo/)).toBeInTheDocument();
    expect(within(panel).getByText(`${managedMoney(990000)} MXN / mes`)).toBeInTheDocument();
    expect(api.adminManagedPlans.list).not.toHaveBeenCalled();
    expect(api.adminFinance.balance).not.toHaveBeenCalled();
  });

  it.each([organization, { ...suspendedPlanner, status: 'ACTIVE' as const }])(
    'keeps the commercial panel absent for ineligible %s clients',
    async (client) => {
      const api = setup();
      vi.mocked(api.adminClients.get).mockResolvedValue(client);
      renderAdminApp(api, `/clientes/${client.id}`);
      await screen.findByRole('heading', { name: client.name, level: 1 });
      expect(screen.queryByRole('region', { name: 'Plan comercial' })).not.toBeInTheDocument();
      expect(api.adminManagedPlans.listContracts).not.toHaveBeenCalled();
    }
  );

  it('assigns an explicit current accepted version without changing profile, channel or Finance', async () => {
    const api = setup();
    vi.mocked(api.adminManagedPlans.listContracts).mockResolvedValue([]);
    vi.mocked(api.adminManagedPlans.assignContract).mockImplementation(async () => {
      vi.mocked(api.adminManagedPlans.listContracts).mockResolvedValue([contract]);
      return contract;
    });
    renderAdminApp(api, `/clientes/${managed.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar plan comercial' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Modalidad comercial' }));
    await userEvent.click(screen.getByRole('option', { name: 'Estándar Gestionado' }));
    await userEvent.click(screen.getByRole('combobox', { name: /^Plan$/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Frecuente' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Versión comercial aceptada' }));
    await userEvent.click(screen.getByRole('option', { name: /Frecuente · desde/ }));
    fireEvent.change(screen.getByLabelText('Inicio contractual'), { target: { value: '2026-10-01' } });
    const save = screen.getByRole('button', { name: 'Registrar contrato aceptado' });
    fireEvent.click(save);
    fireEvent.click(save);
    await screen.findByText(/Contrato comercial registrado/);
    expect(api.adminManagedPlans.assignContract).toHaveBeenCalledExactlyOnceWith(
      managed.id,
      { planVersionId: accepted.id, startsOn: '2026-10-01' },
      expect.any(String),
      expect.any(AbortSignal)
    );
    expect(api.adminClients.update).not.toHaveBeenCalled();
    expect(api.adminEvents.createManagedForClient).not.toHaveBeenCalled();
    expect(api.adminFinance.balance).not.toHaveBeenCalled();
  });
});
