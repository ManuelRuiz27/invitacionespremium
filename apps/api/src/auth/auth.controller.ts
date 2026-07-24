import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { buildClearedSessionCookie, buildSessionCookie } from './auth-cookie';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthPrincipal } from './auth.types';
import { AuthUserDto, LoginRequestDto, LoginResponseDto, parseLoginRequest } from './auth.dto';
import { CurrentAuth } from './current-auth.decorator';
import { PublicRoute } from './public-route.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  @PublicRoute()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginRequestDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<LoginResponseDto> {
    const input = parseLoginRequest(body);
    const result = await this.authService.login(input.email, input.password, request.operationId);

    response.setHeader('Set-Cookie', buildSessionCookie(result.token, this.config));

    return {
      user: toAuthUserDto(result.principal),
      expiresAt: result.expiresAt.toISOString()
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiNoContentResponse({ description: 'Session revoked.' })
  async logout(
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.authService.logout(principal, request.operationId);
    response.setHeader('Set-Cookie', buildClearedSessionCookie(this.config));
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthUserDto })
  getMe(@CurrentAuth() principal: AuthPrincipal): AuthUserDto {
    return toAuthUserDto(principal);
  }
}

function toAuthUserDto(principal: AuthPrincipal): AuthUserDto {
  return {
    id: principal.userId,
    email: principal.email,
    role: principal.role,
    clientId: principal.clientId,
    clientType: principal.clientType,
    clientStatus: principal.clientStatus
  };
}
