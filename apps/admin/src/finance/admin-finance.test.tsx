import { ApiError } from '@invitaciones/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { adminBalance, mockAdminApi } from '../test/fixtures';
import { renderAdminApp } from '../test/render-admin-app';
import { formatMxn, parseMxnToCents } from './finance-format';

const loadedViewTimeout = { timeout: 10_000 };

describe('Admin Client finance', () => {
  it('shows only authoritative balance values with credits and MXN formatting', async () => {
    const api = mockAdminApi();
    renderAdminApp(api, '/clientes/client-a');
    expect(
      await screen.findByText(formatMxn(adminBalance.debtMxnCents), undefined, loadedViewTimeout)
    ).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('Verificada')).toBeInTheDocument();
    expect(api.adminFinance.balance).toHaveBeenCalledWith('client-a', expect.any(AbortSignal));
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
    await user.click(await screen.findByRole('button', { name: 'Asignar creditos gratuitos' }, loadedViewTimeout));
    await user.type(screen.getByLabelText('Creditos'), '5');
    await user.type(screen.getByLabelText('Motivo'), 'Cortesia contractual');
    expect(api.adminFinance.assignCredits).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(api.adminFinance.assignCredits).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[0]?.[1]).toEqual({
      credits: 5,
      reason: 'Cortesia contractual'
    });
    expect(vi.mocked(api.adminFinance.assignCredits).mock.calls[0]?.[2]).toEqual(expect.any(String));
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
    await user.click(await screen.findByRole('button', { name: 'Reconstruir balance' }, loadedViewTimeout));
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
    await user.click(await screen.findByRole('button', { name: 'Asignar creditos gratuitos' }, loadedViewTimeout));
    await user.type(screen.getByLabelText('Creditos'), '2');
    await user.type(screen.getByLabelText('Motivo'), 'Ajuste');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/resultado no pudo confirmarse/i, undefined, loadedViewTimeout)).toBeInTheDocument();
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
    await screen.findByText('Finanzas', undefined, loadedViewTimeout);
    expect(screen.queryByRole('button', { name: /refund|revers/i })).not.toBeInTheDocument();
  });
});
