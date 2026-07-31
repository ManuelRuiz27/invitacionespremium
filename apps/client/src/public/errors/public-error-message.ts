import { ApiError } from '@invitaciones/api-client';

const messages: Record<string, string> = {
  INVITATION_NOT_FOUND: 'Esta invitación no está disponible.',
  RSVP_NOT_AVAILABLE: 'La confirmación de asistencia no está disponible.',
  RSVP_CLOSED: 'La confirmación de asistencia ya fue cerrada. Contacta al organizador.',
  RSVP_ASSISTANT_LIMIT_EXCEEDED: 'Alcanzaste el máximo de acompañantes permitidos.',
  RSVP_EVENT_CAPACITY_EXCEEDED: 'Ya no hay lugares suficientes disponibles para completar esta confirmación.',
  RSVP_ASSISTANT_NOT_FOUND: 'No pudimos actualizar a uno de los acompañantes.',
  RSVP_ASSISTANT_MISMATCH: 'No pudimos verificar a uno de los acompañantes.',
  RSVP_INVITATION_CANCELLED: 'Esta invitación fue cancelada por el organizador.',
  RSVP_EVENT_CANCELLED: 'Este evento ha sido cancelado por el organizador.',
  RSVP_EVENT_STATE_INVALID: 'La confirmación de asistencia no está disponible.',
  FILE_STORAGE_FAILURE: 'No pudimos cargar este contenido.',
  QR_NOT_AVAILABLE: 'El QR todavía no está disponible.',
  QR_GENERATION_FAILURE: 'No pudimos preparar el QR. Inténtalo nuevamente.'
};

export interface PublicDisplayError {
  message: string;
  operationId?: string;
}

export function publicErrorMessage(error: unknown, fallback: string): PublicDisplayError {
  if (!(error instanceof ApiError)) return { message: fallback };
  return {
    message: messages[error.code] ?? fallback,
    ...(error.operationId ? { operationId: error.operationId } : {})
  };
}

export function isUncertainNetworkResult(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}
