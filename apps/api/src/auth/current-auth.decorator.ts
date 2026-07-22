import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthPrincipal } from './auth.types';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new TypeError('Authenticated request is missing auth principal.');
    }

    return request.auth;
  }
);
