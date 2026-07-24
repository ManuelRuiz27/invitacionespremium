import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import {
  ClientUserResponseDto,
  CreatePlannerUserRequestDto,
  UpdateClientUserRequestDto,
  parseCreatePlannerUserRequest,
  parseUpdateClientUserRequest,
  parseUuidParameter
} from '../clients/clients.dto';
import { UserRole } from '../generated/prisma/client';
import { ClientUsersService } from './client-users.service';

@ApiTags('admin-client-users')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/users')
export class AdminClientUsersController {
  constructor(@Inject(ClientUsersService) private readonly users: ClientUsersService) {}

  @Get()
  @ApiOkResponse({ type: ClientUserResponseDto, isArray: true })
  list(@Param('clientId') clientIdInput: string): Promise<ClientUserResponseDto[]> {
    return this.users.listAdmin(parseUuidParameter(clientIdInput, 'clientId'));
  }

  @Post('planner')
  @ApiBody({ type: CreatePlannerUserRequestDto })
  @ApiCreatedResponse({ type: ClientUserResponseDto })
  createPlanner(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientUserResponseDto> {
    return this.users.createAdmin(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseCreatePlannerUserRequest(body),
      principal,
      request.operationId
    );
  }

  @Patch(':userId')
  @ApiBody({ type: UpdateClientUserRequestDto })
  @ApiOkResponse({ type: ClientUserResponseDto })
  update(
    @Param('clientId') clientIdInput: string,
    @Param('userId') userIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientUserResponseDto> {
    return this.users.updateAdmin(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseUuidParameter(userIdInput, 'userId'),
      parseUpdateClientUserRequest(body),
      principal,
      request.operationId
    );
  }
}
