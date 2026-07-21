import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

export const OPERATION_ID_HEADER = 'x-operation-id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RequestWithOperationId extends Request {
  operationId?: string;
}

export function resolveOperationId(value: string | undefined): string {
  return value && UUID_PATTERN.test(value) ? value : randomUUID();
}

export function resolveRouteTemplate(request: Request): string {
  const routePath: unknown = request.route?.path;

  if (typeof routePath !== 'string') {
    return 'unmatched';
  }

  return `${request.baseUrl}${routePath}` || '/';
}
