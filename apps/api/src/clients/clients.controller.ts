import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PublicRoute } from '../auth/public-route.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  ClientCreatedResponseDto,
  ClientResponseDto,
  RegisterPlannerRequestDto,
  UpdateClientRequestDto,
  parseRegisterPlannerRequest,
  parseUpdateClientRequest,
  parseUuidParameter
} from './clients.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(@Inject(ClientsService) private readonly clients: ClientsService) {}

  @PublicRoute()
  @Post('register-planner')
  @ApiBody({ type: RegisterPlannerRequestDto })
  @ApiCreatedResponse({ type: ClientCreatedResponseDto })
  registerPlanner(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientCreatedResponseDto> {
    return this.clients.registerPlanner(parseRegisterPlannerRequest(body), request.operationId);
  }

  @Get(':clientId')
  @Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN)
  @ApiCookieAuth()
  @ApiOkResponse({ type: ClientResponseDto })
  getOwned(
    @Param('clientId') clientIdInput: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<ClientResponseDto> {
    return this.clients.getOwned(parseUuidParameter(clientIdInput, 'clientId'), principal);
  }

  @Patch(':clientId')
  @Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN)
  @ApiCookieAuth()
  @ApiBody({ type: UpdateClientRequestDto })
  @ApiOkResponse({ type: ClientResponseDto })
  updateOwned(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientResponseDto> {
    return this.clients.updateOwned(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseUpdateClientRequest(body),
      principal,
      request.operationId
    );
  }
}
