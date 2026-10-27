import { describe, expect, it } from 'vitest';
import { addContractMonths, contractLocalDate } from './managed-contract-dates';

describe('Managed contract calendar dates', () => {
  it('clamps end-of-month dates without drifting the original anniversary', () => {
    expect(addContractMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addContractMonths('2027-01-31', 2)).toBe('2027-03-31');
    expect(addContractMonths('2027-01-31', 12)).toBe('2028-01-31');
    expect(addContractMonths('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('uses the contract timezone to resolve date boundaries', () => {
    expect(contractLocalDate(new Date('2027-04-01T05:59:59.999Z'))).toBe('2027-03-31');
    expect(contractLocalDate(new Date('2027-04-01T06:00:00.000Z'))).toBe('2027-04-01');
  });
});
