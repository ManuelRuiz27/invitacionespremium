import type { EventStatus } from '@invitaciones/api-client';
import type { StatusChipProps } from '@invitaciones/ui';

export type EventGroup = 'preparation' | 'active' | 'finished' | 'cancelled';

const statusPresentation: Record<
  EventStatus,
  { label: string; group: EventGroup; tone: NonNullable<StatusChipProps['tone']> }
> = {
  DRAFT: { label: 'En preparación', group: 'preparation', tone: 'neutral' },
  CONFIGURED: { label: 'En preparación', group: 'preparation', tone: 'neutral' },
  READY_TO_ACTIVATE: { label: 'Listo para activar', group: 'preparation', tone: 'info' },
  ACTIVE: { label: 'Activo', group: 'active', tone: 'success' },
  EVENT_DAY: { label: 'Día del evento', group: 'active', tone: 'success' },
  CLOSED: { label: 'Cerrado', group: 'finished', tone: 'neutral' },
  ALBUM_PUBLISHED: { label: 'Álbum publicado', group: 'finished', tone: 'info' },
  ARCHIVED: { label: 'Archivado', group: 'finished', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', group: 'cancelled', tone: 'danger' }
};

export function getEventStatusPresentation(status: EventStatus) {
  return statusPresentation[status];
}
