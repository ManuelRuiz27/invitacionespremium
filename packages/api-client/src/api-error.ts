export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly operationId?: string;

  constructor(status: number, code: string, message: string, operationId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (operationId !== undefined) this.operationId = operationId;
  }
}

interface ApiErrorBody {
  code?: unknown;
  message?: unknown;
  operationId?: unknown;
}

export function createApiError(status: number, payload: unknown): ApiError {
  const body = isRecord(payload) ? (payload as ApiErrorBody) : {};
  const code = typeof body.code === 'string' ? body.code : `HTTP_${status}`;
  const message = typeof body.message === 'string' ? body.message : 'La solicitud no pudo completarse.';
  const operationId = typeof body.operationId === 'string' ? body.operationId : undefined;
  return new ApiError(status, code, message, operationId);
}

export function unexpectedResponse(message = 'La API devolvió una respuesta inesperada.'): ApiError {
  return new ApiError(502, 'UNEXPECTED_API_RESPONSE', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
