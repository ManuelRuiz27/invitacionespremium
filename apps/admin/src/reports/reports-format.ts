import type { AdminReport } from '@invitaciones/api-client';

export const reportTypeLabels: Record<AdminReport['type'], string> = {
  ATTENDANCE: 'Asistencia',
  PHYSICAL_PASSES: 'Pases fisicos'
};
export const reportStatusLabels: Record<AdminReport['status'], string> = {
  AUTHORIZED: 'Autorizado',
  READY: 'Listo',
  HIDDEN: 'Oculto',
  EXPIRED: 'Expirado'
};
export const privacyLabels: Record<AdminReport['privacyMode'], string> = {
  DETAILED: 'Detallado',
  AGGREGATE: 'Agregado'
};
