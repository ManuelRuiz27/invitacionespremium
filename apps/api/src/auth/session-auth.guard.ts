import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppConfigService } from '../config/app-config.service';
import { readCookie } from './auth-cookie';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, this.config.authCookieName);

    if (!token) {
      throw unauthenticated();
    }

    const principal = await this.authService.authenticateSessionToken(token);

    if (!principal) {
      throw unauthenticated();
    }

    request.auth = principal;
    return true;
  }
}

function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'UNAUTHENTICATED',
    message: 'A valid session is required.'
  });
}
