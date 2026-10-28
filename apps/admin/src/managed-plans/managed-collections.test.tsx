import {
  ApiError,
  type AdminManagedCollections,
  type AdminManagedCollectionHistoryEntry
} from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { mockAdminApi } from '../test/fixtures';
import { ManagedCollectionsPanel } from './ManagedCollectionsPanel';

const obligation = {
  id: 'MONTHLY:1',
  concept: 'MONTHLY' as const,
  installmentNumber: 1,
  extraordinaryChargeId: null,
  eventId: null,
  label: 'Mensualidad 1',
  dueOn: '2026-10-01',
  amountMxnCents: 790000,
  paidMxnCents: 0,
  balanceMxnCents: 790000,
  status: 'OVERDUE' as const,
  overdue: true
};
const state: AdminManagedCollections = {
  clientId: 'client',
  contractId: 'contract',
  today: '2026-10-28',
  currency: 'MXN',
  beforeTax: true,
  summary: {
    totalMxnCents: 9970000,
    paidMxnCents: 0,
    balanceMxnCents: 9970000,
    overdueMxnCents: 1280000,
    dueMxnCents: 1280000,
    futureMxnCents: 8690000
  },
  alerts: { overdueInstallments: 1, endingWithin30Days: false, expiredWithoutSuccessor: false },
  obligations: [obligation],
  extraordinaryCandidates: [
    {
      eventId: 'extra-event',
      name: 'Boda cancelada',
      eventDateTime: '2026-12-01T18:00:00Z',
      activatedAt: '2026-10-20T12:00:00Z',
      cancelled: true,
      amountMxnCents: 125000,
      confirmedChargeId: null
    }
  ],
  history: []
};
const entry: AdminManagedCollectionHistoryEntry = {
  id: 'payment:payment',
  kind: 'PAYMENT',
  paymentId: 'payment',
  extraordinaryChargeId: null,
  obligationId: 'MONTHLY:1',
  amountMxnCents: 100000,
  effectiveOn: '2026-10-27',
  occurredAt: '2026-10-28T18:00:00Z',
  actorUserId: 'actor',
  actorLabel: 'admin@example.test',
  method: 'TRANSFER',
  reference: 'Transferencia A',
  notes: 'Confirmada manualmente',
  reversalReason: null,
  reversed: false
};
async function open(initial = state) {
  const api = mockAdminApi();
  vi.mocked(api.adminManagedPlans.getCollections).mockResolvedValue(initial);
  const lock = vi.fn();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    {
      path: '/',
      element: <ManagedCollectionsPanel apiClient={api} clientId="client" contractId="contract" onLockChange={lock} />
    },
    { path: '/other', element: <p>Other client</p> }
  ]);
  render(
    <AppThemeProvider>
      <QueryClientProvider client={cache}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
  await screen.findByRole('table', { name: 'Obligaciones comerciales' });
  return { api, lock, router };
}
async function confirm() {
  await userEvent.click(screen.getByRole('checkbox', { name: 'He revisado y confirmo este movimiento comercial' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
}
describe('PR03 Managed collections administration', () => {
  it('registers exact net cents against the selected obligation and refreshes authoritative history and balances', async () => {
    const { api, lock } = await open();
    const updated: AdminManagedCollections = {
      ...state,
      obligations: [{ ...obligation, status: 'PARTIAL', paidMxnCents: 100000, balanceMxnCents: 690000 }],
      history: [entry]
    };
    vi.mocked(api.adminManagedPlans.registerPayment).mockResolvedValue(updated);
    vi.mocked(api.adminManagedPlans.getCollections).mockResolvedValue(updated);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(lock).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Importe neto MXN'), { target: { value: '1000.00' } });
    fireEvent.change(screen.getByLabelText('Fecha efectiva del pago'), { target: { value: '2026-10-27' } });
    fireEvent.change(screen.getByLabelText('Referencia (opcional)'), { target: { value: 'Transferencia A' } });
    fireEvent.change(screen.getByLabelText('Notas (opcional)'), { target: { value: 'Confirmada manualmente' } });
    await confirm();
    await screen.findByText('Movimiento comercial registrado.');
    expect(api.adminManagedPlans.registerPayment).toHaveBeenCalledWith(
      'client',
      'contract',
      {
        concept: 'MONTHLY',
        installmentNumber: 1,
        extraordinaryChargeId: null,
        amountMxnCents: 100000,
        effectiveOn: '2026-10-27',
        method: 'TRANSFER',
        reference: 'Transferencia A',
        notes: 'Confirmada manualmente'
      },
      expect.any(String),
      expect.any(AbortSignal)
    );
    expect(screen.getByText('Parcial')).toBeInTheDocument();
    expect(screen.getByText('Referencia: Transferencia A')).toBeInTheDocument();
    expect(screen.getByText(/Administrador: admin@example.test/)).toBeInTheDocument();
    expect(lock).toHaveBeenLastCalledWith(false);
    expect(api.adminManagedPlans.getCollections).toHaveBeenCalledTimes(2);
  });

  it.each([new TypeError('offline'), new ApiError(409, 'MANAGED_PLAN_CONCURRENT_UPDATE', 'Retry')])(
    'reconciles an uncertain payment with the same frozen body and key (%s)',
    async (failure) => {
      const { api, lock } = await open();
      vi.mocked(api.adminManagedPlans.registerPayment).mockRejectedValueOnce(failure).mockResolvedValueOnce(state);
      await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
      fireEvent.change(screen.getByLabelText('Importe neto MXN'), { target: { value: '1.25' } });
      await confirm();
      await screen.findByRole('button', { name: 'Reintentar misma operación' });
      expect(screen.getByLabelText('Importe neto MXN')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
      expect(lock).toHaveBeenLastCalledWith(true);
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar misma operación' }));
      await screen.findByText('Movimiento comercial registrado.');
      const calls = vi.mocked(api.adminManagedPlans.registerPayment).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]!.slice(0, 4)).toEqual(calls[1]!.slice(0, 4));
    }
  );

  it('requires a reason for a complete reversal and keeps original payment history visible', async () => {
    const { api } = await open({ ...state, history: [entry] });
    const updated: AdminManagedCollections = {
      ...state,
      history: [
        { ...entry, reversed: true },
        { ...entry, id: 'payment:reversal', kind: 'REVERSAL', reversed: true, reversalReason: 'Registro incorrecto' }
      ]
    };
    vi.mocked(api.adminManagedPlans.reversePayment).mockResolvedValue(updated);
    vi.mocked(api.adminManagedPlans.getCollections).mockResolvedValue(updated);
    await userEvent.click(screen.getByRole('button', { name: 'Revertir pago' }));
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo de reversión'), { target: { value: 'Registro incorrecto' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    await screen.findByText('Pago revertido');
    expect(api.adminManagedPlans.reversePayment).toHaveBeenCalledWith(
      'client',
      'contract',
      'payment',
      { reason: 'Registro incorrecto' },
      expect.any(String),
      expect.any(AbortSignal)
    );
    expect(screen.getByText('Motivo de reversión: Registro incorrecto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revertir pago' })).not.toBeInTheDocument();
  });

  it('shows cancelled extraordinary candidates and requires individual explicit confirmation at the API price', async () => {
    const { api } = await open();
    vi.mocked(api.adminManagedPlans.confirmExtraordinary).mockResolvedValue(state);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar extraordinario' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirmar cargo extraordinario' });
    expect(within(dialog).getByText(/Evento cancelado/)).toBeInTheDocument();
    expect(api.adminManagedPlans.confirmExtraordinary).not.toHaveBeenCalled();
    await confirm();
    await screen.findByText('Movimiento comercial registrado.');
    expect(api.adminManagedPlans.confirmExtraordinary).toHaveBeenCalledWith(
      'client',
      'contract',
      { eventId: 'extra-event' },
      expect.any(String),
      expect.any(AbortSignal)
    );
  });

  it('blocks malformed amounts and future dates before submission and preserves a server rejection for correction', async () => {
    const { api } = await open();
    vi.mocked(api.adminManagedPlans.registerPayment).mockRejectedValue(
      new ApiError(409, 'MANAGED_PAYMENT_EXCEEDS_BALANCE', 'Overpayment')
    );
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    await userEvent.click(screen.getByRole('checkbox'));
    for (const value of ['0', '-1', '1.234', '7900.01']) {
      fireEvent.change(screen.getByLabelText('Importe neto MXN'), { target: { value } });
      expect(screen.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled();
    }
    fireEvent.change(screen.getByLabelText('Importe neto MXN'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Fecha efectiva del pago'), { target: { value: '2026-10-29' } });
    expect(screen.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Fecha efectiva del pago'), { target: { value: '2026-10-28' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    await screen.findByText(/El importe supera el saldo pendiente/);
    expect(screen.getByLabelText('Importe neto MXN')).toHaveValue('1');
    expect(screen.getByLabelText('Importe neto MXN')).toBeEnabled();
  });
});
