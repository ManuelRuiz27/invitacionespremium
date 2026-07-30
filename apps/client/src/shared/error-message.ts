import { ApiError } from '@invitaciones/api-client';

const domainMessages: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  UNAUTHORIZED: 'Tu sesión expiró. Inicia sesión nuevamente.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para consultar esta información.',
  EVENT_NOT_FOUND: 'El Evento solicitado no está disponible.',
  CLIENT_NOT_FOUND: 'No encontramos la información de tu Cliente.'
};

export interface DisplayError {
  message: string;
  operationId?: string;
  unauthorized: boolean;
}

export function toDisplayError(error: unknown): DisplayError {
  if (error instanceof ApiError) {
    return {
      message:
        domainMessages[error.code] ??
        (error.status >= 500 ? 'El servicio no está disponible por el momento.' : 'No pudimos completar la solicitud.'),
      ...(error.operationId ? { operationId: error.operationId } : {}),
      unauthorized: error.status === 401
    };
  }

  return {
    message: 'No pudimos conectarnos. Revisa tu conexión e inténtalo nuevamente.',
    unauthorized: false
  };
}
