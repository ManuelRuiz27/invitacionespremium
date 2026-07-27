import { describe, expect, it } from 'vitest';
import { CreditLineStatus, LedgerMovementType } from '../generated/prisma/client';
import { parseConfigureCreditLineRequest, parseIdempotencyKey, parseManualPaymentRequest } from './finance.dto';

describe('finance DTO validation', () => {
  it('accepts an exact integer-cent credit purchase', () => {
    expect(
      parseManualPaymentRequest({
        kind: LedgerMovementType.CREDIT_PURCHASE,
        credits: 7,
        creditUnitValueMxnCents: 2000,
        amountMxnCents: 14_000,
        externalReference: 'cash-001'
      })
    ).toMatchObject({ credits: 7, amountMxnCents: 14_000 });
  });

  it('rejects a paid purchase whose amount does not match its historical unit value', () => {
    expect(() =>
      parseManualPaymentRequest({
        kind: LedgerMovementType.CREDIT_PURCHASE,
        credits: 7,
        creditUnitValueMxnCents: 2000,
        amountMxnCents: 13_999,
        externalReference: 'cash-002'
      })
    ).toThrow();
  });

  it('rejects duplicate debt lots and fractional or negative finance values', () => {
    const lotId = '7244d59d-e9ec-4c6a-a5ca-6333df8c08dc';
    expect(() =>
      parseManualPaymentRequest({
        kind: LedgerMovementType.DEBT_PAYMENT,
        amountMxnCents: 4000,
        externalReference: 'debt-001',
        allocations: [
          { debtLotLedgerEntryId: lotId, credits: 1 },
          { debtLotLedgerEntryId: lotId, credits: 1 }
        ]
      })
    ).toThrow();
    expect(() =>
      parseConfigureCreditLineRequest({
        limitCredits: -1,
        status: CreditLineStatus.ACTIVE
      })
    ).toThrow();
  });

  it('requires a bounded idempotency key', () => {
    expect(parseIdempotencyKey('finance-operation-001')).toBe('finance-operation-001');
    expect(() => parseIdempotencyKey('short')).toThrow();
  });
});
