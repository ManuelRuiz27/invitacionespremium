import type { components } from './generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from './api-client';

export type FinanceBalance = components['schemas']['FinanceBalanceResponseDto'];
export type LedgerMovement = components['schemas']['LedgerMovementResponseDto'];
export type Receipt = components['schemas']['ReceiptResponseDto'];

export interface FinanceListOptions {
  limit?: number;
  signal?: AbortSignal;
}

export interface FinanceClient {
  balance(signal?: AbortSignal): Promise<FinanceBalance>;
  movements(options?: FinanceListOptions): Promise<LedgerMovement[]>;
  receipts(options?: FinanceListOptions): Promise<Receipt[]>;
}

export function createFinanceClient(request: ApiRequester): FinanceClient {
  return {
    balance: (signal) =>
      request({ path: '/finance/balance', response: 'json', ...(signal ? { signal } : {}) }, isBalance),
    movements: (options = {}) =>
      request(
        {
          path: `/finance/movements${toLimitQuery(options.limit)}`,
          response: 'json',
          ...(options.signal ? { signal: options.signal } : {})
        },
        isMovementArray
      ),
    receipts: (options = {}) =>
      request(
        {
          path: `/finance/receipts${toLimitQuery(options.limit)}`,
          response: 'json',
          ...(options.signal ? { signal: options.signal } : {})
        },
        isReceiptArray
      )
  };
}

function toLimitQuery(limit: number | undefined): string {
  return limit === undefined ? '' : `?limit=${encodeURIComponent(String(limit))}`;
}

function isBalance(value: unknown): value is FinanceBalance {
  return (
    isRecord(value) &&
    typeof value.clientId === 'string' &&
    typeof value.purchasedCredits === 'number' &&
    typeof value.debtCredits === 'number' &&
    typeof value.debtMxnCents === 'number' &&
    isRecord(value.creditLine)
  );
}

function isMovementArray(value: unknown): value is LedgerMovement[] {
  return (
    isRecordArray(value) && value.every((entry) => typeof entry.id === 'string' && typeof entry.sequence === 'string')
  );
}

function isReceiptArray(value: unknown): value is Receipt[] {
  return (
    isRecordArray(value) && value.every((entry) => typeof entry.id === 'string' && typeof entry.folio === 'string')
  );
}
