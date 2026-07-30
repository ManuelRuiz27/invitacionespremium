import type { EventSocialType } from '@invitaciones/api-client';

export const socialTypeLabels: Record<EventSocialType, string> = {
  WEDDING: 'Boda',
  QUINCEANERA: 'XV años',
  CORPORATE: 'Corporativo',
  BIRTHDAY: 'Cumpleaños',
  OTHER: 'Otro'
};

export function formatEventDate(value: string | null, timeZone: string | null, includeTime = false): string {
  if (!value || !timeZone) return 'Fecha pendiente';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone,
      dateStyle: 'medium',
      ...(includeTime ? { timeStyle: 'short' } : {})
    }).format(new Date(value));
  } catch {
    return 'Fecha pendiente';
  }
}

export function formatCredits(value: number): string {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value);
}

export function formatMxnCents(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  }).format(value / 100);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}
