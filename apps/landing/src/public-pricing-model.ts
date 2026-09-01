import type { PublicPricing } from '@invitaciones/api-client';

export type PublicSku = 'PHYSICAL_QR' | 'FLYER' | 'FLIPBOOK';

export interface PublicPricingBracket {
  readonly capacityMin: number;
  readonly capacityMax: number;
  readonly label: 'Hasta 50' | 'Hasta 100' | 'Hasta 150';
  readonly credits: number;
  readonly amountMxnCents: number;
}

export interface PublicPricingRow {
  readonly serviceCode: PublicSku;
  readonly displayName: 'Gestión de Invitados' | 'Invitación Digital' | 'Invitación Premium';
  readonly brackets: readonly PublicPricingBracket[];
}

export interface PublicPricingMatrix {
  readonly columns: readonly ['Hasta 50', 'Hasta 100', 'Hasta 150'];
  readonly rows: readonly PublicPricingRow[];
}

const skuOrder: readonly PublicSku[] = ['PHYSICAL_QR', 'FLYER', 'FLIPBOOK'];
const displayNames: Record<PublicSku, PublicPricingRow['displayName']> = {
  PHYSICAL_QR: 'Gestión de Invitados',
  FLYER: 'Invitación Digital',
  FLIPBOOK: 'Invitación Premium'
};
const expectedBrackets = [
  { capacityMin: 1, capacityMax: 50, label: 'Hasta 50' },
  { capacityMin: 51, capacityMax: 100, label: 'Hasta 100' },
  { capacityMin: 101, capacityMax: 150, label: 'Hasta 150' }
] as const;

export function buildPublicPricingMatrix(prices: PublicPricing[]): PublicPricingMatrix | null {
  if (prices.length !== 9) return null;

  const entries = new Map<string, PublicPricing>();
  for (const price of prices) {
    if (!skuOrder.includes(price.serviceCode as PublicSku)) return null;
    const key = `${price.serviceCode}:${price.capacityMin}:${price.capacityMax}`;
    if (entries.has(key)) return null;
    entries.set(key, price);
  }

  const rows: PublicPricingRow[] = [];
  for (const serviceCode of skuOrder) {
    const brackets: PublicPricingBracket[] = [];
    for (const expected of expectedBrackets) {
      const price = entries.get(`${serviceCode}:${expected.capacityMin}:${expected.capacityMax}`);
      if (!price) return null;
      brackets.push({
        capacityMin: expected.capacityMin,
        capacityMax: expected.capacityMax,
        label: expected.label,
        credits: price.credits,
        amountMxnCents: price.amountMxnCents
      });
    }
    rows.push({ serviceCode, displayName: displayNames[serviceCode], brackets });
  }

  return { columns: ['Hasta 50', 'Hasta 100', 'Hasta 150'], rows };
}

const mxnFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export function formatMxnFromCents(amountMxnCents: number): string {
  return mxnFormatter.format(amountMxnCents / 100);
}
