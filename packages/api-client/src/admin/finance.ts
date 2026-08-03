import type { components, operations } from '../generated/schema';
import { isRecord, type ApiRequester } from '../api-client';

export type AdminFinanceBalance =
  operations['AdminFinanceController_balance']['responses'][200]['content']['application/json'];
export type AdminFinanceMutation = components['schemas']['FinanceMutationResponseDto'];
export type AssignAdminCreditsInput = components['schemas']['AssignCreditsRequestDto'];
export type ConfigureAdminCreditLineInput = components['schemas']['ConfigureCreditLineRequestDto'];
export type AdminManualPaymentInput = components['schemas']['ManualPaymentRequestDto'];
export type AdminFinanceCut =
  operations['AdminFinanceController_dailyCut']['responses'][200]['content']['application/json'];

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
  dailyCut(signal?: AbortSignal): Promise<AdminFinanceCut>;
  monthlyCut(signal?: AbortSignal): Promise<AdminFinanceCut>;
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
    rebuildBalance: (clientId, key, signal) => mutate(clientId, 'rebuild-balance', key, undefined, signal),
    dailyCut: (signal) =>
      request({ path: '/admin/finance/cuts/daily', response: 'json', ...(signal ? { signal } : {}) }, isCut),
    monthlyCut: (signal) =>
      request({ path: '/admin/finance/cuts/monthly', response: 'json', ...(signal ? { signal } : {}) }, isCut)
  };
}

function isCut(value: unknown): value is AdminFinanceCut {
  if (!isRecord(value) || !isDateTime(value.from) || !isDateTime(value.until)) return false;
  return cutNumberFields.every((field) => isFiniteInteger(value[field]));
}

const cutNumberFields = [
  'incomeMxnCents',
  'creditsSold',
  'creditsGranted',
  'creditsConsumed',
  'creditsLent',
  'debtGeneratedCredits',
  'debtGeneratedMxnCents',
  'debtPaidCredits',
  'debtPaidMxnCents',
  'pendingDebtCredits',
  'pendingDebtMxnCents',
  'pendingPurchasedCredits',
  'internalRefundCredits',
  'reversalCount'
] as const;

const isFiniteInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
const isDateTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

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
