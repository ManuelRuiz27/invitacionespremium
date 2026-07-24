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

@ApiTags('client-users')
@ApiCookieAuth()
@Roles(UserRole.ORGANIZATION_ADMIN)
@Controller('clients/:clientId/users')
export class ClientUsersController {
  constructor(@Inject(ClientUsersService) private readonly users: ClientUsersService) {}

  @Get()
  @ApiOkResponse({ type: ClientUserResponseDto, isArray: true })
  list(
    @Param('clientId') clientIdInput: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<ClientUserResponseDto[]> {
    return this.users.listOwned(parseUuidParameter(clientIdInput, 'clientId'), principal);
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
    return this.users.createOwned(
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
    return this.users.updateOwned(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseUuidParameter(userIdInput, 'userId'),
      parseUpdateClientUserRequest(body),
      principal,
      request.operationId
    );
  }
}
