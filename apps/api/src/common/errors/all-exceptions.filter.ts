import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter
} from '@nestjs/common';
import type { Response } from 'express';
import {
  type RequestWithOperationId,
  resolveOperationId,
  resolveRouteTemplate
} from '../logging/request-context';

interface NormalizedException {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

interface HttpExceptionBody {
  code?: unknown;
  message?: unknown;
  error?: unknown;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithOperationId>();
    const response = context.getResponse<Response>();
    const normalized = normalizeException(exception);
    const operationId = request.operationId ?? resolveOperationId(undefined);

    const logPayload = {
      event: 'http_exception',
      operationId,
      method: request.method,
      route: resolveRouteTemplate(request),
      statusCode: normalized.statusCode,
      code: normalized.code,
      errorName: exception instanceof Error ? exception.name : 'UnknownException'
    };

    if (normalized.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logPayload);
    } else {
      this.logger.warn(logPayload);
    }

    response.status(normalized.statusCode).json({
      statusCode: normalized.statusCode,
      code: normalized.code,
      message: normalized.message,
      timestamp: new Date().toISOString(),
      operationId,
      ...(normalized.details === undefined
        ? {}
        : { details: normalized.details })
    });
  }
}

function normalizeException(exception: unknown): NormalizedException {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.'
    };
  }

  const statusCode = exception.getStatus();
  const exceptionResponse = exception.getResponse();

  if (typeof exceptionResponse === 'string') {
    return {
      statusCode,
      code: defaultCodeForStatus(statusCode),
      message: exceptionResponse
    };
  }

  const body = exceptionResponse as HttpExceptionBody;
  const message = normalizeMessage(body.message, exception.message);

  return {
    statusCode,
    code:
      typeof body.code === 'string'
        ? body.code
        : defaultCodeForStatus(statusCode),
    message,
    ...(body.details === undefined ? {} : { details: body.details })
  };
}

function normalizeMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return 'Request validation failed.';
  }

  return fallback || 'Request failed.';
}

function defaultCodeForStatus(statusCode: number): string {
  const knownCodes: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
    [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
    [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
    [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
    [HttpStatus.CONFLICT]: 'CONFLICT',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
    [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE'
  };

  return knownCodes[statusCode] ?? `HTTP_${statusCode}`;
}
