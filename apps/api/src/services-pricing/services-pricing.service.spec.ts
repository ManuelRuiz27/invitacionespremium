import { describe, expect, it } from 'vitest';
import { VenuePriceTier } from '../generated/prisma/client';
import { venueTierForVolume } from './services-pricing.service';

describe('venueTierForVolume', () => {
  it.each([
    [0, VenuePriceTier.ONE_TO_TWO],
    [1, VenuePriceTier.ONE_TO_TWO],
    [2, VenuePriceTier.ONE_TO_TWO],
    [3, VenuePriceTier.THREE_TO_FIVE],
    [5, VenuePriceTier.THREE_TO_FIVE],
    [6, VenuePriceTier.SIX_TO_TEN],
    [10, VenuePriceTier.SIX_TO_TEN],
    [11, VenuePriceTier.ELEVEN_PLUS],
    [20, VenuePriceTier.ELEVEN_PLUS]
  ])('maps %i effective M-1 Events to %s', (volume, tier) => {
    expect(venueTierForVolume(volume)).toBe(tier);
  });
});
