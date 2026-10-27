import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  parseCreateManagedPlanVersion,
  parseManagedPlanIdempotencyKey,
  parseSetManagedPlanAvailability
} from './managed-plans.dto';

const valid = {
  commercialName: 'Frecuente',
  monthlyAmountMxnCents: 990000,
  initialFeeMxnCents: 490000,
  extraEventAmountMxnCents: 125000,
  contractMonths: 12,
  includedEventsPerMonth: 8,
  monthlyEventLimit: 12,
  includedEventsPerYear: 96,
  eventCapacity: 150
};

describe('Managed plan version requests', () => {
  it('accepts immediate and scheduled versions without requiring credit-unit divisibility', () => {
    expect(
      parseCreateManagedPlanVersion({ ...valid, monthlyAmountMxnCents: 990001, extraEventAmountMxnCents: 125001 })
    ).toMatchObject({ monthlyAmountMxnCents: 990001, extraEventAmountMxnCents: 125001 });
    expect(parseCreateManagedPlanVersion({ ...valid, validFrom: '2030-01-01T00:00:00.000Z' }).validFrom).toBe(
      '2030-01-01T00:00:00.000Z'
    );
  });
  it.each([
    { monthlyAmountMxnCents: 1.2 },
    { initialFeeMxnCents: -1 },
    { monthlyAmountMxnCents: 0 },
    { monthlyAmountMxnCents: 2_147_483_648 },
    { extraEventAmountMxnCents: 0 },
    { contractMonths: 1 },
    { eventCapacity: 151 },
    { includedEventsPerMonth: 13 },
    { includedEventsPerYear: 145 },
    { credits: 125 }
  ])('rejects invalid currency, terms and unsupported payload %j', (change) => {
    expect(() => parseCreateManagedPlanVersion({ ...valid, ...change })).toThrow(BadRequestException);
  });
  it('permits a waived initial fee as a new commercial configuration', () => {
    expect(parseCreateManagedPlanVersion({ ...valid, initialFeeMxnCents: 0 }).initialFeeMxnCents).toBe(0);
  });
  it('validates availability as a strict boolean operation', () => {
    expect(parseSetManagedPlanAvailability({ isAvailable: false })).toEqual({ isAvailable: false });
    expect(() => parseSetManagedPlanAvailability({ isAvailable: 'false' })).toThrow(BadRequestException);
    expect(() => parseSetManagedPlanAvailability({ isAvailable: true, operatingProfile: 'MANAGED' })).toThrow(
      BadRequestException
    );
  });
  it('requires a bounded idempotency key', () => {
    expect(parseManagedPlanIdempotencyKey('pr02-test-operation')).toBe('pr02-test-operation');
    expect(() => parseManagedPlanIdempotencyKey('')).toThrow(BadRequestException);
  });
});
