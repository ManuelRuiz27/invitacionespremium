import type { AdminPrice, AdminPromotion } from '@invitaciones/api-client';

export const serviceLabels = {
  FLIPBOOK: 'Flipbook',
  FLYER: 'Flyer',
  PHYSICAL_QR: 'Pase fisico QR',
  DEMO: 'Demo'
} as const;

export const clientTypeLabels = { PLANNER: 'Planner independiente', ORGANIZATION: 'Organizacion' } as const;
export const promotionScopeLabels = {
  CREDIT_PURCHASE: 'Compra de creditos',
  EVENT_ACTIVATION: 'Activacion de Evento'
} as const;

export function intervalLabel(item: Pick<AdminPrice | AdminPromotion, 'validFrom' | 'validUntil'>, now = new Date()) {
  const from = new Date(item.validFrom);
  const until = item.validUntil ? new Date(item.validUntil) : null;
  if (from > now) return 'Programado';
  if (until && until <= now) return 'Vigencia cerrada';
  return until ? 'En intervalo de vigencia' : 'En intervalo de vigencia · Sin fecha de cierre';
}

export function intervalsOverlap(
  first: { validFrom: string; validUntil?: string | null },
  second: { validFrom: string; validUntil?: string | null }
) {
  const firstEnd = first.validUntil ? new Date(first.validUntil).getTime() : Number.POSITIVE_INFINITY;
  const secondEnd = second.validUntil ? new Date(second.validUntil).getTime() : Number.POSITIVE_INFINITY;
  return new Date(first.validFrom).getTime() < secondEnd && new Date(second.validFrom).getTime() < firstEnd;
}

const twoDigits = (value: number) => String(value).padStart(2, '0');

export function toLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}T${twoDigits(
    date.getHours()
  )}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}

export const toIso = (value: string) => new Date(value).toISOString();
