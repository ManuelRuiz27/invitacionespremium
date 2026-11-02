import type { CommercialOpportunityType } from '@invitaciones/api-client';
import type { PublicSku } from './public-pricing-model';

export type CommercialIntent = 'INDIVIDUAL' | CommercialOpportunityType;
export interface PriceSelection {
  sku: PublicSku;
  capacityMax: 50 | 100 | 150;
}
export const capacityOptions = [
  { value: 50, label: '1–50 personas' },
  { value: 100, label: '51–100 personas' },
  { value: 150, label: '101–150 personas' }
] as const;
export const initialPriceSelection: PriceSelection = { sku: 'PHYSICAL_QR', capacityMax: 50 };

// A single serialized context, separated from free text. JSON escaping prevents
// user notes from injecting or duplicating the authoritative selection fields.
export function commercialNotes(selection: PriceSelection | undefined, message: string): string {
  if (!selection) return message.trim();
  return JSON.stringify({
    contextoPrecioPublico: {
      sku: selection.sku,
      capacidad: capacityOptions.find((option) => option.value === selection.capacityMax)!.label
    },
    mensaje: message.trim()
  });
}
