import { ApiError } from '@invitaciones/api-client';

export function isTerminalScannerError(error: unknown): boolean {
  return (
    error instanceof ApiError && ['STAFF_TOKEN_INVALID_OR_EXPIRED', 'STAFF_EVENT_NOT_OPERATIONAL'].includes(error.code)
  );
}

export function isUncertainScannerError(error: unknown): boolean {
  return Boolean(error) && (!(error instanceof ApiError) || error.status >= 500 || error.code === 'INVALID_RESPONSE');
}

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
    case 'SCANNER_SEAT_ASSIGNMENT_REQUIRED':
      return 'Falta un Lugar operativo para uno o más Asistentes.';
    case 'SCANNER_FLOORPLAN_NOT_AVAILABLE':
      return 'El Croquis no está disponible.';
    case 'PHYSICAL_PASS_ALREADY_USED':
      return 'Este pase físico ya fue utilizado.';
    case 'ASSISTANT_ALREADY_CHECKED_IN':
      return 'Este QR ya registró un ingreso.';
    case 'PHYSICAL_PASS_NOT_FOUND':
    case 'PHYSICAL_PASS_REVOKED':
      return 'El código QR no es válido para este Evento.';
    default:
      return error.status >= 500
        ? 'No pudimos confirmar la respuesta. Conservamos el resultado para reintentar con seguridad.'
        : fallback;
  }
}
