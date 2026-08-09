import { ApiError } from '@invitaciones/api-client';

const messages: Record<string, string> = {
  EVENT_NOT_FOUND: 'No encontramos este Evento o ya no tienes acceso.',
  EVENT_NOT_EDITABLE: 'Este evento ya no puede modificarse.',
  EVENT_CAPACITY_EXCEEDED: 'Los Asistentes autorizados superan la capacidad del Evento.',
  SERVICE_NOT_AVAILABLE: 'El servicio seleccionado ya no está disponible.',
  EVENT_INVALID_STATE_TRANSITION: 'Este evento todavía no puede activarse.',
  EVENT_INVITATION_DESIGN_INCOMPLETE: 'Completa el diseño de la Invitación.',
  EVENT_ACTIVE_INVITATION_MISSING: 'Agrega al menos una Invitación activa.',
  EVENT_CONFIRMATION_NOT_ENABLED: 'Activa la Confirmación de asistencia.',
  EVENT_LOCATION_URL_MISSING: 'Agrega la ubicación del evento.',
  EVENT_GIFT_REGISTRY_URL_MISSING: 'Agrega la mesa de regalos.',
  EVENT_FLOORPLAN_INCOMPLETE: 'Agrega el plano del lugar y al menos una mesa.',
  FINANCE_INSUFFICIENT_CREDITS: 'No hay saldo ni línea de crédito suficientes para activar.',
  CURRENT_PRICE_NOT_FOUND: 'No existe un precio vigente para este servicio.',
  CLIENT_NOT_ACTIVE: 'Tu cuenta no está habilitada para realizar esta acción.',
  VALIDATION_ERROR: 'Revisa los campos señalados e inténtalo nuevamente.',
  FILE_ASSET_NOT_READY: 'Espera a que el archivo termine de cargarse e inténtalo nuevamente.',
  IDEMPOTENCY_CONFLICT: 'No pudimos completar esta operación. Actualiza la información e inténtalo nuevamente.',
  INVITATION_DESIGN_SERVICE_UNSUPPORTED: 'El servicio elegido no permite configurar una invitación digital.',
  INVITATION_DESIGN_NOT_FOUND: 'Todavía no hay un diseño de invitación.',
  INVITATION_DESIGN_CONFLICT: 'El diseño cambió al mismo tiempo. Actualiza la vista e inténtalo nuevamente.',
  INVITATION_DESIGN_SERVICE_MISMATCH: 'El diseño actual no corresponde al formato de invitación elegido.',
  INVITATION_DESIGN_EVENT_STATE_LOCKED: 'El diseño ya no puede modificarse en el estado actual del evento.',
  EVENT_INVITATION_DESIGN_RESET_REQUIRED: 'Confirma que deseas reiniciar únicamente el diseño de la invitación.',
  FLIPBOOK_PAGE_LIMIT_EXCEEDED: 'El Flipbook admite un máximo de 10 páginas.',
  HOTSPOT_EXTERNAL_LINK_LIMIT_EXCEEDED: 'Puedes agregar hasta tres enlaces adicionales.',
  HOTSPOT_QR_PAGE_ALREADY_DEFINED: 'Ya elegiste otra página para mostrar el QR.',
  HOTSPOT_VISUAL_OWNER_NOT_OPERATIONAL:
    'El orden no cambió porque algunas acciones dependen de la portada o de la página QR. Revisa esas acciones primero.',
  HOTSPOT_COORDINATES_INVALID: 'Coloca el área completamente dentro de la imagen.',
  INVITATION_DESIGN_MISSING: 'Agrega las imágenes de la invitación.',
  INVITATION_DESIGN_TYPE_MISMATCH: 'La invitación no coincide con el servicio elegido.',
  FLYER_INITIAL_IMAGE_MISSING: 'Falta agregar la imagen inicial.',
  FLYER_QR_IMAGE_MISSING: 'Falta agregar la imagen donde se mostrará el QR.',
  FLIPBOOK_PAGE_COUNT_INVALID: 'Agrega entre 1 y 10 páginas al Flipbook.',
  FLIPBOOK_PAGE_ORDER_INVALID: 'Revisa el orden de las páginas del Flipbook.',
  FLIPBOOK_PAGE_ASSET_INVALID: 'Una página necesita una imagen válida.',
  FLYER_RSVP_HOTSPOT_MISSING: 'Falta agregar la acción para confirmar asistencia.',
  FLYER_LOCATION_HOTSPOT_MISSING: 'Falta agregar la acción para ver la ubicación.',
  FLYER_GIFT_REGISTRY_HOTSPOT_MISSING: 'Falta agregar la acción para abrir la mesa de regalos.',
  FLYER_QR_AREA_HOTSPOT_MISSING: 'Falta indicar dónde mostrar el QR.',
  FLIPBOOK_COVER_PAGE_MISSING: 'Falta agregar la portada del Flipbook.',
  FLIPBOOK_COVER_RSVP_HOTSPOT_MISSING: 'Falta agregar en la portada la acción para confirmar asistencia.',
  FLIPBOOK_COVER_LOCATION_HOTSPOT_MISSING: 'Falta agregar en la portada la acción para ver la ubicación.',
  FLIPBOOK_COVER_GIFT_REGISTRY_HOTSPOT_MISSING: 'Falta agregar en la portada la acción para abrir la mesa de regalos.',
  FLIPBOOK_QR_PAGE_MISSING: 'Falta indicar en qué página se mostrará el QR.',
  FLIPBOOK_HOTSPOT_OWNER_INVALID: 'Una acción está asociada a una página que ya no está disponible.',
  FLIPBOOK_HOTSPOT_PLACEMENT_INVALID: 'Mueve la acción a una página permitida.',
  FLOORPLAN_ALREADY_EXISTS: 'Ya existe un plano para este evento.',
  FLOORPLAN_NOT_FOUND: 'Agrega el plano del lugar antes de continuar.',
  FLOORPLAN_SHAPE_NOT_FOUND: 'Esta mesa o zona ya no está disponible. Actualiza la información.',
  FLOORPLAN_SHAPE_INVALID: 'Ajusta la forma para que permanezca dentro del plano.',
  FLOORPLAN_TABLE_OCCUPIED:
    'Esta mesa tiene lugares ocupados. No puede eliminarse ni reducirse por debajo de su ocupación actual.',
  FLOORPLAN_LAYOUT_LOCKED: 'Selecciona Editar distribución antes de realizar cambios.',
  FLOORPLAN_EVENT_STATE_LOCKED: 'La distribución ya no puede modificarse en el estado actual del evento.',
  FLOORPLAN_FILE_ASSET_INCOMPATIBLE: 'Selecciona una imagen JPG o PNG válida para este evento.',
  FLOORPLAN_CONCURRENCY_CONFLICT: 'La distribución cambió al mismo tiempo. Actualiza e inténtalo nuevamente.',
  FILE_UNSUPPORTED_TYPE: 'Selecciona una imagen JPG o PNG.',
  FILE_SIZE_EXCEEDED: 'La imagen es demasiado grande. Selecciona otra e inténtalo nuevamente.'
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
