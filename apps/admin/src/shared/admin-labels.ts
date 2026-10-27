import type { AdminClient, AdminClientUser, AdminEvent } from '@invitaciones/api-client';

export const clientTypeLabel: Record<AdminClient['type'], string> = {
  PLANNER: 'Planner independiente',
  ORGANIZATION: 'Organizacion'
};
export const clientStatusLabel: Record<AdminClient['status'], string> = { ACTIVE: 'Activo', SUSPENDED: 'Suspendido' };
export const clientOperatingProfileLabel: Record<AdminClient['operatingProfile'], string> = {
  MANAGED: 'Gestionado',
  SELF_SERVICE: 'Autoservicio'
};
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

export const serviceCodeLabel = {
  ACCESS_CONTROL: 'Control de acceso',
  PHYSICAL_QR: 'QR / EventOps',
  FLYER: 'Flyer',
  FLIPBOOK: 'Flipbook',
  DEMO: 'Demo'
} as const;
export const eventServiceLabel = (event: Pick<AdminEvent, 'serviceCode'>) =>
  event.serviceCode ? serviceCodeLabel[event.serviceCode] : 'Sin asignar';
export const accessModeLabel = (mode: AdminEvent['accessMode']) =>
  mode === 'NOMINAL' ? 'Nominal' : mode === 'ANONYMOUS' ? 'Anónimo' : 'Sin definir';
