import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = request.headers.origin;

    if (origin === undefined || this.config.corsOrigins.includes(origin)) {
      return true;
    }

    throw new ForbiddenException({
      code: 'UNTRUSTED_ORIGIN',
      message: 'Request origin is not allowed.'
    });
  }
}
