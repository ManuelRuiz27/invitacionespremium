import { ApiError } from '@invitaciones/api-client';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { adminBalance, mockAdminApi, organization, suspendedPlanner } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';
import { formatMxn, parseMxnToCents } from './finance-format';

describe('Admin Client finance', () => {
  it('shows only authoritative balance values with credits and MXN formatting', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/clientes/client-a');
    expect(await screen.findByText(formatMxn(adminBalance.debtMxnCents))).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Verificada')).toBeInTheDocument();
    expect(api.adminFinance.balance).toHaveBeenCalledWith('client-a', expect.any(AbortSignal));
  });

  it('expires the session and hides loaded finance when balance refetch returns 401', async () => {
    const api = mockAdminApi();
    const view = renderAdminApp(api, '/clientes/client-a');
    expect(await screen.findByText(formatMxn(adminBalance.debtMxnCents))).toBeInTheDocument();
    vi.mocked(api.adminFinance.balance).mockImplementationOnce(() => {
      view.unauthorizedController.notify();
      return Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'expired'));
    });
    await act(() => view.queryClient.invalidateQueries({ queryKey: ['admin-client-finance', 'client-a'] }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe('/login'));
    expect(screen.queryByText(formatMxn(adminBalance.debtMxnCents))).not.toBeInTheDocument();
    expect(screen.queryByText(organization.name)).not.toBeInTheDocument();
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('parses MXN into integer cents without accepting excess decimals', () => {
    expect(parseMxnToCents('120.50')).toBe(12050);
    expect(parseMxnToCents('120,5')).toBe(12050);
    expect(parseMxnToCents('1.001')).toBeNull();
  });

  it('assigns credits only after confirmation and reloads the balance', async () => {
    const api = mockAdminApi();
    const user = userEvent.setup();
    renderAdminApp(api, '/clientes/client-a');
    expect(await screen.findByText(formatMxn(adminBalance.debtMxnCents))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Asignar creditos gratuitos' }));
    await user.type(screen.getByLabelText('Creditos'), '5');
    await user.type(screen.getByLabelText('Motivo'), 'Cortesia contractual');
    expect(api.adminFinance.assignCredits).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api.adminFinance.assignCredits).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[0]?.[1]).toEqual({
      credits: 5,
      reason: 'Cortesia contractual'
    });
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[0]?.[2]).toEqual(expect.any(String));
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[0]?.[3]).toEqual(expect.any(AbortSignal));
    expect(api.adminFinance.balance).toHaveBeenCalledTimes(2);
  });

  it('blocks a synchronous double submit', async () => {
    const api = mockAdminApi();
    let resolve!: (value: Awaited<ReturnType<typeof api.adminFinance.rebuildBalance>>) => void;
    vi.mocked(api.adminFinance.rebuildBalance).mockReturnValue(
      new Promise((nextResolve) => {
        resolve = nextResolve;
      })
    );
    const user = userEvent.setup();
    renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: 'Reconstruir balance' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(api.adminFinance.rebuildBalance).toHaveBeenCalledTimes(1));
    resolve({
      balance: adminBalance,
      movement: null,
      payment: null,
      receipt: {
        id: 'r',
        folio: '1',
        clientId: 'client-a',
        operationType: 'BALANCE_REBUILD',
        operationReference: 'r',
        createdAt: adminBalance.updatedAt
      }
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reuses an in-memory key after uncertain failure and changes it for the next intention', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminFinance.assignCredits).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'uncertain'));
    const user = userEvent.setup();
    renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: 'Asignar creditos gratuitos' }));
    await user.type(screen.getByLabelText('Creditos'), '2');
    await user.type(screen.getByLabelText('Motivo'), 'Ajuste');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/resultado no pudo confirmarse/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.adminFinance.assignCredits).toHaveBeenCalledTimes(2));
    const firstKey = vi.mocked(api.adminFinance.assignCredits).mock.calls[0]?.[2];
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[1]?.[2]).toBe(firstKey);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Asignar creditos gratuitos' }));
    await user.type(screen.getByLabelText('Creditos'), '3');
    await user.type(screen.getByLabelText('Motivo'), 'Nuevo');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.adminFinance.assignCredits).toHaveBeenCalledTimes(3));
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[2]?.[2]).not.toBe(firstKey);
  });

  it('offers no refund or ledger reversal controls', async () => {
    renderAdminApp(mockAdminApi(), '/clientes/client-a');
    await screen.findByText('Finanzas');
    expect(screen.queryByRole('button', { name: /refund|revers/i })).not.toBeInTheDocument();
  });

  it('passes AbortSignal and synchronously locks credit-line and manual-payment operations', async () => {
    const lineApi = mockAdminApi();
    vi.mocked(lineApi.adminFinance.configureCreditLine).mockReturnValue(new Promise(() => undefined));
    const lineUser = userEvent.setup();
    const lineView = renderAdminApp(lineApi, '/clientes/client-a');
    await lineUser.click(await screen.findByRole('button', { name: 'Configurar linea' }));
    const lineConfirm = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(lineConfirm);
    fireEvent.click(lineConfirm);
    await waitFor(() => expect(lineApi.adminFinance.configureCreditLine).toHaveBeenCalledTimes(1));
    expect(vi.mocked(lineApi.adminFinance.configureCreditLine).mock.calls[0]?.[3]).toEqual(expect.any(AbortSignal));
    lineView.unmount();

    const paymentApi = mockAdminApi();
    vi.mocked(paymentApi.adminFinance.manualPayment).mockReturnValue(new Promise(() => undefined));
    const paymentUser = userEvent.setup();
    const paymentView = renderAdminApp(paymentApi, '/clientes/client-a');
    await paymentUser.click(await screen.findByRole('button', { name: 'Registrar pago manual' }));
    await paymentUser.type(screen.getByLabelText('Monto MXN'), '100.00');
    await paymentUser.type(screen.getByLabelText('Referencia externa'), 'manual-1');
    await paymentUser.type(screen.getByLabelText('Creditos'), '5');
    await paymentUser.type(screen.getByLabelText('Valor unitario MXN'), '20.00');
    const paymentConfirm = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(paymentConfirm);
    fireEvent.click(paymentConfirm);
    await waitFor(() => expect(paymentApi.adminFinance.manualPayment).toHaveBeenCalledTimes(1));
    expect(vi.mocked(paymentApi.adminFinance.manualPayment).mock.calls[0]?.[3]).toEqual(expect.any(AbortSignal));
    paymentView.unmount();
  });

  it('aborts an A operation, keeps its uncertain intent isolated and retries with the same key on return', async () => {
    const api = mockAdminApi();
    vi.mocked(api.adminClients.get).mockImplementation((clientId) =>
      Promise.resolve(clientId === 'client-b' ? suspendedPlanner : organization)
    );
    vi.mocked(api.adminFinance.assignCredits).mockImplementationOnce(
      (_clientId, _input, _key, signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        })
    );
    const user = userEvent.setup();
    const { router, financeIntentRegistry } = renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: 'Asignar creditos gratuitos' }));
    await user.type(screen.getByLabelText('Creditos'), '2');
    await user.type(screen.getByLabelText('Motivo'), 'Ajuste incierto');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.adminFinance.assignCredits).toHaveBeenCalledTimes(1));
    const firstCall = vi.mocked(api.adminFinance.assignCredits).mock.calls[0]!;
    await router.navigate('/clientes/client-b');
    expect(await screen.findByRole('heading', { name: suspendedPlanner.name, level: 1 })).toBeInTheDocument();
    expect(firstCall[3]?.aborted).toBe(true);
    await waitFor(() => expect(financeIntentRegistry.list('client-a')).toHaveLength(1));
    expect(financeIntentRegistry.list('client-b')).toHaveLength(0);
    expect(screen.queryByText(/resultado no confirmado para este Cliente/i)).not.toBeInTheDocument();

    await router.navigate('/clientes/client-a');
    expect(await screen.findByText(/resultado no confirmado para este Cliente/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Consultar balance' }));
    await waitFor(() =>
      expect(
        vi.mocked(api.adminFinance.balance).mock.calls.filter(([clientId]) => clientId === 'client-a').length
      ).toBeGreaterThanOrEqual(2)
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.adminFinance.assignCredits).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[1]?.[2]).toBe(firstCall[2]);
    await waitFor(() => expect(financeIntentRegistry.list('client-a')).toHaveLength(0));
  });

  it('discards uncertain intents only through the explicit action', async () => {
    const api = mockAdminApi();
    const view = renderAdminApp(api, '/clientes/client-a');
    view.financeIntentRegistry.record({
      clientId: 'client-a',
      action: 'rebuild',
      body: undefined,
      fingerprint: 'rebuild-intent',
      key: 'hidden-key',
      status: 'uncertain'
    });
    expect(await screen.findByText(/resultado no confirmado para este Cliente/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Descartar' }));
    expect(view.financeIntentRegistry.list('client-a')).toHaveLength(0);
  });

  it.each([
    new ApiError(429, 'RATE_LIMITED', 'slow'),
    new ApiError(500, 'INTERNAL_ERROR', 'unavailable'),
    new TypeError('network')
  ])('keeps the session and records an uncertain financial result for %#', async (failure) => {
    const api = mockAdminApi();
    vi.mocked(api.adminFinance.assignCredits).mockRejectedValueOnce(failure);
    const user = userEvent.setup();
    const view = renderAdminApp(api, '/clientes/client-a');
    await user.click(await screen.findByRole('button', { name: 'Asignar creditos gratuitos' }));
    await user.type(screen.getByLabelText('Creditos'), '2');
    await user.type(screen.getByLabelText('Motivo'), 'Resultado incierto');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText(/resultado no confirmado/i)).toBeInTheDocument();
    expect(view.financeIntentRegistry.list('client-a')).toHaveLength(1);
    expect(screen.getByText(organization.name)).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/clientes/client-a');
    expect(api.auth.logout).not.toHaveBeenCalled();
  });

  it('prioritizes session expiration over a financial mutation 401', async () => {
    const api = mockAdminApi();
    const user = userEvent.setup();
    const view = renderAdminApp(api, '/clientes/client-a');
    vi.mocked(api.adminFinance.assignCredits).mockImplementationOnce(() => {
      view.unauthorizedController.notify();
      return Promise.reject(new ApiError(401, 'UNAUTHORIZED', 'expired'));
    });
    await user.click(await screen.findByRole('button', { name: 'Asignar creditos gratuitos' }));
    await user.type(screen.getByLabelText('Creditos'), '2');
    await user.type(screen.getByLabelText('Motivo'), 'Ajuste');
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/login'));
    expect(api.adminFinance.assignCredits).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(organization.name)).not.toBeInTheDocument();
    expect(view.financeIntentRegistry.list('client-a')).toHaveLength(0);
    expect(api.auth.logout).not.toHaveBeenCalled();
  });
});
