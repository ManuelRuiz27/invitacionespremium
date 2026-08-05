import { ApiError } from '@invitaciones/api-client';

export function scannerErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  switch (error.code) {
    case 'STAFF_TOKEN_INVALID_OR_EXPIRED':
      return 'Token Staff revocado, expirado o inválido.';
    case 'STAFF_EVENT_NOT_OPERATIONAL':
      return 'El Evento está cerrado, cancelado, archivado o fuera de operación.';
    case 'SCANNER_QR_NOT_FOUND':
      return 'El código QR no es válido para este Evento.';
    case 'SCANNER_TABLE_ASSIGNMENT_REQUIRED':
      return 'Falta una Mesa operativa para uno o más Asistentes.';
    case 'SCANNER_FLOORPLAN_NOT_AVAILABLE':
      return 'El Croquis no está disponible.';
    case 'PHYSICAL_PASS_ALREADY_USED':
      return 'Este pase físico ya fue utilizado.';
    default:
      return error.status >= 500
        ? 'No pudimos confirmar la respuesta. Conservamos el resultado para reintentar con seguridad.'
        : error.message;
  }
}
