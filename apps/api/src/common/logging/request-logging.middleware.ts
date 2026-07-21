import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import {
  OPERATION_ID_HEADER,
  type RequestWithOperationId,
  resolveOperationId,
  resolveRouteTemplate
} from './request-context';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HttpRequest');

  use(
    request: RequestWithOperationId,
    response: Response,
    next: NextFunction
  ): void {
    const operationId = resolveOperationId(request.header(OPERATION_ID_HEADER));
    const startedAt = performance.now();

    request.operationId = operationId;
    response.setHeader(OPERATION_ID_HEADER, operationId);

    response.once('finish', () => {
      this.logger.log({
        event: 'http_request_completed',
        operationId,
        method: request.method,
        route: resolveRouteTemplate(request),
        statusCode: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100
      });
    });

    next();
  }
}
