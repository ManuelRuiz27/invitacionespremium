import type { components, operations } from '../generated/schema';
import { isRecord, type ApiRequester } from '../api-client';

export type AdminFinanceBalance =
  operations['AdminFinanceController_balance']['responses'][200]['content']['application/json'];
export type AdminFinanceMutation = components['schemas']['FinanceMutationResponseDto'];
export type AssignAdminCreditsInput = components['schemas']['AssignCreditsRequestDto'];
export type ConfigureAdminCreditLineInput = components['schemas']['ConfigureCreditLineRequestDto'];
export type AdminManualPaymentInput = components['schemas']['ManualPaymentRequestDto'];

export interface AdminFinanceClient {
  balance(clientId: string, signal?: AbortSignal): Promise<AdminFinanceBalance>;
  assignCredits(
    clientId: string,
    input: AssignAdminCreditsInput,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<AdminFinanceMutation>;
  configureCreditLine(
    clientId: string,
    input: ConfigureAdminCreditLineInput,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<AdminFinanceMutation>;
  manualPayment(
    clientId: string,
    input: AdminManualPaymentInput,
    idempotencyKey: string,
    signal?: AbortSignal
  ): Promise<AdminFinanceMutation>;
  rebuildBalance(clientId: string, idempotencyKey: string, signal?: AbortSignal): Promise<AdminFinanceMutation>;
}

export function createAdminFinanceClient(request: ApiRequester): AdminFinanceClient {
  const financePath = (clientId: string) => `/admin/finance/clients/${encodeURIComponent(clientId)}`;
  const mutate = (clientId: string, suffix: string, idempotencyKey: string, body?: unknown, signal?: AbortSignal) =>
    request<AdminFinanceMutation>(
      {
        method: 'POST',
        path: `${financePath(clientId)}/${suffix}`,
        headers: { 'Idempotency-Key': idempotencyKey },
        ...(body === undefined ? {} : { body }),
        response: 'json',
        ...(signal ? { signal } : {})
      },
      isMutation
    );
  return {
    balance: (clientId, signal) =>
      request({ path: `${financePath(clientId)}/balance`, response: 'json', ...(signal ? { signal } : {}) }, isBalance),
    assignCredits: (clientId, body, key, signal) => mutate(clientId, 'assign-credits', key, body, signal),
    configureCreditLine: (clientId, body, key, signal) => mutate(clientId, 'credit-line', key, body, signal),
    manualPayment: (clientId, body, key, signal) => mutate(clientId, 'manual-payment', key, body, signal),
    rebuildBalance: (clientId, key, signal) => mutate(clientId, 'rebuild-balance', key, undefined, signal)
  };
}

function isBalance(value: unknown): value is AdminFinanceBalance {
  return (
    isRecord(value) &&
    typeof value.clientId === 'string' &&
    typeof value.purchasedCredits === 'number' &&
    typeof value.debtCredits === 'number' &&
    typeof value.debtMxnCents === 'number' &&
    isRecord(value.creditLine) &&
    isRecord(value.reconciliation)
  );
}

function isMutation(value: unknown): value is AdminFinanceMutation {
  return isRecord(value) && isBalance(value.balance) && isRecord(value.receipt) && typeof value.receipt.id === 'string';
}
