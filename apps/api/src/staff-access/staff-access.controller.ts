import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PublicRoute } from '../auth/public-route.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseEventId } from '../events/events.dto';
import { UserRole } from '../generated/prisma/client';
import {
  CreateStaffTokenRequestDto,
  CreatedStaffTokenResponseDto,
  ScannerSessionResponseDto,
  StaffTokenResponseDto,
  parseCreateStaffToken
} from './staff-access.dto';
import { StaffTokenManagementService, StaffTokenResolverService } from './staff-access.service';

@ApiTags('staff-access')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/staff-tokens')
export class StaffTokensController {
  constructor(@Inject(StaffTokenManagementService) private readonly staffTokens: StaffTokenManagementService) {}

  @Get()
  @ApiOkResponse({ type: StaffTokenResponseDto, isArray: true })
  list(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal): Promise<StaffTokenResponseDto[]> {
    return this.staffTokens.list(parseEventId(eventId), principal);
  }

  @Post()
  @ApiBody({ type: CreateStaffTokenRequestDto })
  @ApiCreatedResponse({ type: CreatedStaffTokenResponseDto })
  create(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<CreatedStaffTokenResponseDto> {
    return this.staffTokens.create(parseEventId(eventId), parseCreateStaffToken(body), principal, request.operationId);
  }
}

@ApiTags('scanner-session')
@PublicRoute()
@Controller('scanner')
export class ScannerSessionController {
  constructor(@Inject(StaffTokenResolverService) private readonly resolver: StaffTokenResolverService) {}

  @Get(':staffToken/session')
  @ApiOkResponse({ type: ScannerSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Malformed, unknown, or expired StaffToken.' })
  session(@Param('staffToken') staffToken: string): Promise<ScannerSessionResponseDto> {
    return this.resolver.getPublicSession(staffToken);
  }
}
