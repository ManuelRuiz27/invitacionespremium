import { ApiError } from '@invitaciones/api-client';

const messages: Record<string, string> = {
  UNAUTHORIZED: 'La sesion administrativa expiro.',
  FORBIDDEN: 'No tienes permiso para ejecutar esta accion.',
  CLIENT_NOT_FOUND: 'El Cliente administrativo no esta disponible.',
  CLIENT_SUSPENDED: 'El Cliente esta suspendido.',
  USER_NOT_FOUND: 'El usuario no esta disponible.',
  EVENT_NOT_FOUND: 'El Evento administrativo no esta disponible.',
  FINANCE_BALANCE_NOT_FOUND: 'El balance del Cliente no esta disponible.',
  IDEMPOTENCY_CONFLICT: 'La llave de la operacion ya corresponde a otra intencion.',
  FINANCE_DUPLICATE_OPERATION: 'La llave de la operacion ya corresponde a otra intencion.',
  VALIDATION_ERROR: 'Revisa los datos capturados.',
  UNEXPECTED_API_RESPONSE: 'La API devolvio una respuesta inesperada.'
};

export interface AdminErrorMessage {
  message: string;
  operationId?: string;
  uncertain: boolean;
}

export function adminErrorMessage(error: unknown): AdminErrorMessage {
  if (error instanceof ApiError) {
    const result: AdminErrorMessage = {
      message:
        messages[error.code] ??
        (error.status === 404
          ? 'El recurso administrativo no esta disponible.'
          : error.status === 409
            ? 'La operacion entra en conflicto con el estado actual.'
            : error.status === 400 || error.status === 422
              ? 'Revisa los datos capturados.'
              : error.status === 429 || error.status >= 500
                ? 'El resultado no pudo confirmarse. Puedes reintentar la misma intencion.'
                : 'La solicitud no pudo completarse.'),
      uncertain: error.status === 429 || error.status >= 500
    };
    if (error.operationId) result.operationId = error.operationId;
    return result;
  }
  return { message: 'El resultado no pudo confirmarse. Revisa tu conexion y reintenta.', uncertain: true };
}

export function isUncertainFailure(error: unknown) {
  return adminErrorMessage(error).uncertain;
}
