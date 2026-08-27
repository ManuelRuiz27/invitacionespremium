import type { PublicPricing } from '@invitaciones/api-client';

const now = '2026-08-27T00:00:00.000Z';

export const publicPricingFixture: PublicPricing[] = [
  price('PHYSICAL_QR', 'QR / EventOps', 1, 50, 125, 250000),
  price('PHYSICAL_QR', 'QR / EventOps', 51, 100, 150, 300000),
  price('PHYSICAL_QR', 'QR / EventOps', 101, 150, 175, 350000),
  price('FLYER', 'Flyer', 1, 50, 225, 450000),
  price('FLYER', 'Flyer', 51, 100, 275, 550000),
  price('FLYER', 'Flyer', 101, 150, 325, 650000),
  price('FLIPBOOK', 'Flipbook', 1, 50, 300, 600000),
  price('FLIPBOOK', 'Flipbook', 51, 100, 350, 700000),
  price('FLIPBOOK', 'Flipbook', 101, 150, 400, 800000)
];

function price(
  serviceCode: PublicPricing['serviceCode'],
  displayName: string,
  capacityMin: number,
  capacityMax: number,
  credits: number,
  amountMxnCents: number
): PublicPricing {
  return {
    serviceCode,
    displayName,
    capacityMin,
    capacityMax,
    credits,
    amountMxnCents,
    validFrom: now,
    validUntil: null
  };
}
