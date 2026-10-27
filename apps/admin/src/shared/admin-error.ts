import { ApiError } from '@invitaciones/api-client';

const messages: Record<string, string> = {
  UNAUTHORIZED: 'La sesion administrativa expiro.',
  FORBIDDEN: 'No tienes permiso para ejecutar esta accion.',
  CLIENT_NOT_FOUND: 'El Cliente administrativo no esta disponible.',
  CLIENT_SUSPENDED: 'El Cliente esta suspendido.',
  USER_NOT_FOUND: 'El usuario no esta disponible.',
  EVENT_NOT_FOUND: 'El Evento administrativo no esta disponible.',
  SERVICE_NOT_FOUND: 'El Servicio no esta disponible.',
  SERVICE_ALREADY_EXISTS: 'Ya existe un Servicio con ese codigo.',
  PRICE_NOT_FOUND: 'El precio no esta disponible.',
  PRICE_OVERLAP: 'La vigencia se solapa con otro precio del mismo servicio, canal y rango o volumen.',
  PRICE_HISTORY_IMMUTABLE: 'El historial de precios es inmutable; solo puede cerrarse la vigencia.',
  CURRENT_PRICE_NOT_FOUND: 'No existe un precio vigente para esa combinacion.',
  PROMOTION_NOT_FOUND: 'La promocion no esta disponible.',
  PROMOTION_ALREADY_ACTIVE: 'La promocion ya esta activa.',
  PROMOTION_ALREADY_INACTIVE: 'La promocion ya esta inactiva.',
  PROMOTION_CLIENT_TYPE_MISMATCH: 'El tipo seleccionado no coincide con el tipo real del Cliente.',
  REPORT_NOT_FOUND: 'El reporte no esta disponible.',
  REPORT_CONTENT_EXPIRED: 'El contenido del reporte ya concluyo su retencion.',
  FINANCE_BALANCE_NOT_FOUND: 'El balance del Cliente no esta disponible.',
  IDEMPOTENCY_CONFLICT: 'La llave de la operacion ya corresponde a otra intencion.',
  FINANCE_DUPLICATE_OPERATION: 'La llave de la operacion ya corresponde a otra intencion.',
  EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT: 'El Evento ya fue activado mediante otra operación.',
  EVENT_ACCESS_CONFIGURATION_IMMUTABLE: 'La modalidad ya no puede cambiar: existe registro o material de acceso.',
  EVENT_PLANNER_ASSIGNMENT_INVALID: 'Selecciona una Planner vigente de la misma Organización.',
  EVENT_PLANNER_ASSIGNMENT_REQUIRED: 'Selecciona la Planner responsable del Evento.',
  EVENT_ACCESS_CAPACITY_EXCEEDED: 'La capacidad es menor que los accesos vigentes.',
  PHYSICAL_PASS_CAPACITY_EXCEEDED: 'El lote supera los lugares disponibles del Evento o la Mesa.',
  PHYSICAL_PASS_TABLE_INVALID: 'Selecciona una Mesa válida del Croquis con capacidad para el lote.',
  PHYSICAL_PASS_EVENT_NOT_MUTABLE: 'El estado del Evento ya no permite generar pases.',
  PHYSICAL_PASS_GENERATION_IDEMPOTENCY_CONFLICT: 'La operación de generación no coincide con el lote original.',
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
