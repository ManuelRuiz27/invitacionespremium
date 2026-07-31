import { ApiError } from '@invitaciones/api-client';

const messages: Record<string, string> = {
  EVENT_NOT_FOUND: 'No encontramos este Evento o ya no tienes acceso.',
  EVENT_NOT_EDITABLE: 'El Evento ya no admite cambios en su estado actual.',
  EVENT_CAPACITY_EXCEEDED: 'Los Asistentes autorizados superan la capacidad del Evento.',
  SERVICE_NOT_AVAILABLE: 'El servicio seleccionado ya no está disponible.',
  EVENT_INVALID_STATE_TRANSITION: 'El Evento no puede activarse desde su estado actual.',
  EVENT_INVITATION_DESIGN_INCOMPLETE: 'Completa el diseño de la Invitación.',
  EVENT_ACTIVE_INVITATION_MISSING: 'Agrega al menos una Invitación activa.',
  EVENT_CONFIRMATION_NOT_ENABLED: 'Activa la Confirmación de asistencia.',
  EVENT_LOCATION_URL_MISSING: 'Agrega la ubicación HTTPS del Evento.',
  EVENT_GIFT_REGISTRY_URL_MISSING: 'Agrega la mesa de regalos HTTPS.',
  EVENT_FLOORPLAN_INCOMPLETE: 'Completa y bloquea el Croquis.',
  FINANCE_INSUFFICIENT_CREDITS: 'No hay saldo ni línea de crédito suficientes para activar.',
  CURRENT_PRICE_NOT_FOUND: 'No existe un precio vigente para este servicio.',
  CLIENT_NOT_ACTIVE: 'El Cliente no está activo.',
  VALIDATION_ERROR: 'Revisa los campos señalados e inténtalo nuevamente.',
  FILE_ASSET_NOT_READY: 'El archivo aún no está listo para asociarse.',
  IDEMPOTENCY_CONFLICT: 'Este intento ya fue usado con datos distintos.'
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return messages[error.code] ?? 'No se pudo completar la operación.';
  return 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.';
}

export function operationReference(error: unknown): string | undefined {
  return error instanceof ApiError && error.operationId ? `Referencia: ${error.operationId}` : undefined;
}

export function blockerMessage(code: string): string {
  return messages[code] ?? 'Hay un requisito pendiente que debe resolverse.';
}

export function normalizeRect(value: { x: number; y: number; width: number; height: number }) {
  const clamp = (number: number) => Math.min(1, Math.max(0, number));
  const x = clamp(value.x);
  const y = clamp(value.y);
  return { x, y, width: Math.min(clamp(value.width), 1 - x), height: Math.min(clamp(value.height), 1 - y) };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
