import type { AdminManagedPlan, AdminManagedPlanVersion } from '@invitaciones/api-client';

export const managedModalityLabel: Record<AdminManagedPlan['modality'], string> = {
  STANDARD: 'Estándar Gestionado',
  PRIVATE: 'Licencia Privada'
};
export const managedTierLabel: Record<AdminManagedPlan['tier'], string> = {
  ESSENTIAL: 'Esencial',
  FREQUENT: 'Frecuente',
  INTENSIVE: 'Intensivo'
};
export const managedMoney = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

export function parseManagedMoney(value: string): number | null {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export const managedVersionLabel = (version: AdminManagedPlanVersion) =>
  ({ CURRENT: 'Vigente', FUTURE: 'Futura', EXPIRED: 'Histórica' })[version.status];

export const managedPlansKey = ['admin-managed-plans'] as const;
export const managedContractsKey = (clientId: string) => ['admin-managed-contracts', clientId] as const;
export const managedConsumptionKey = (clientId: string, contractId: string) =>
  ['admin-managed-consumption', clientId, contractId] as const;
