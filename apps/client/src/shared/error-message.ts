import { ApiError } from '@invitaciones/api-client';

const domainMessages: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  UNAUTHORIZED: 'Tu sesión expiró. Inicia sesión nuevamente.',
  FORBIDDEN: 'Tu cuenta no tiene permiso para consultar esta información.',
  EVENT_NOT_FOUND: 'El Evento solicitado no está disponible.',
  CLIENT_NOT_FOUND: 'No encontramos la información de tu cuenta.',
  CLIENT_NOT_ACTIVE: 'Tu cuenta no está habilitada para realizar esta acción.',
  EVENT_NOT_EDITABLE: 'Este evento ya no puede modificarse.',
  EVENT_INVALID_STATE_TRANSITION: 'Este evento todavía no puede activarse.',
  EVENT_LOCATION_URL_MISSING: 'Agrega la ubicación del evento.',
  EVENT_GIFT_REGISTRY_URL_MISSING: 'Agrega la mesa de regalos.',
  FILE_ASSET_NOT_READY: 'Espera a que el archivo termine de cargarse e inténtalo nuevamente.',
  IDEMPOTENCY_CONFLICT: 'No pudimos completar esta operación. Actualiza la información e inténtalo nuevamente.'
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
