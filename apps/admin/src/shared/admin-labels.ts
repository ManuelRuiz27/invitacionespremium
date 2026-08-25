import type { AdminClient, AdminClientUser, AdminEvent } from '@invitaciones/api-client';

export const clientTypeLabel: Record<AdminClient['type'], string> = {
  PLANNER: 'Planner independiente',
  ORGANIZATION: 'Organizacion'
};
export const clientStatusLabel: Record<AdminClient['status'], string> = { ACTIVE: 'Activo', SUSPENDED: 'Suspendido' };
export const commercialChannelLabel = {
  STANDARD: 'Estándar / PVP',
  PARTNER: 'Planner / agencia partner',
  VENUE: 'Venue recurrente'
} as const;
export const resolvedCommercialChannelLabel = (value: AdminClient['commercialChannel']) =>
  commercialChannelLabel[value ?? 'STANDARD'];
export const userRoleLabel: Record<AdminClientUser['role'], string> = {
  PLATFORM_ADMIN: 'Platform Admin',
  INDEPENDENT_PLANNER: 'Planner independiente',
  ORGANIZATION_ADMIN: 'Administrador de organizacion',
  ORGANIZATION_PLANNER: 'Planner de organizacion'
};
export const eventStatusLabel: Record<AdminEvent['status'], string> = {
  DRAFT: 'En preparacion',
  CONFIGURED: 'En preparacion',
  READY_TO_ACTIVATE: 'Listo para activar',
  ACTIVE: 'Activo',
  EVENT_DAY: 'Dia del evento',
  CLOSED: 'Cerrado',
  ALBUM_PUBLISHED: 'Album publicado',
  ARCHIVED: 'Archivado',
  CANCELLED: 'Cancelado'
};

export const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Sin definir';

export const formatDateTime = formatDate;
