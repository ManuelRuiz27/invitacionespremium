import type { PublicPricing } from '@invitaciones/api-client';
import { describe, expect, it } from 'vitest';
import { buildPublicPricingMatrix, formatMxnFromCents } from './public-pricing-model';
import { publicPricingFixture } from './test/pricing-fixtures';

describe('public pricing matrix', () => {
  it('builds the exact 3 by 3 matrix and ignores API order', () => {
    const matrix = buildPublicPricingMatrix([...publicPricingFixture].reverse());
    expect(matrix?.rows.map((row) => row.serviceCode)).toEqual(['PHYSICAL_QR', 'FLYER', 'FLIPBOOK']);
    expect(matrix?.rows.map((row) => row.displayName)).toEqual([
      'Gestión de Invitados',
      'Invitación Digital',
      'Invitación Premium'
    ]);
    expect(matrix?.rows.map((row) => row.brackets.map((bracket) => bracket.amountMxnCents))).toEqual([
      [250000, 300000, 350000],
      [450000, 550000, 650000],
      [600000, 700000, 800000]
    ]);
    expect(formatMxnFromCents(250000)).toBe('$2,500');
  });

  it('rejects duplicate rules', () => {
    expect(buildPublicPricingMatrix([...publicPricingFixture.slice(0, -1), publicPricingFixture[0]!])).toBeNull();
  });

  it('rejects a missing rule', () => {
    expect(buildPublicPricingMatrix(publicPricingFixture.slice(0, -1))).toBeNull();
  });

  it('rejects an unexpected bracket', () => {
    const invalid = publicPricingFixture.map((price, index) => (index === 0 ? { ...price, capacityMin: 0 } : price));
    expect(buildPublicPricingMatrix(invalid)).toBeNull();
  });

  it('rejects DEMO and any payload other than the nine public rules', () => {
    const demo = { ...publicPricingFixture[0], serviceCode: 'DEMO' } as unknown as PublicPricing;
    expect(buildPublicPricingMatrix([...publicPricingFixture.slice(1), demo])).toBeNull();
  });
});
