import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  ClientCreatedResponseDto,
  ClientResponseDto,
  CreateOrganizationRequestDto,
  SuspendClientRequestDto,
  UpdateClientRequestDto,
  parseCreateOrganizationRequest,
  parseSuspendClientRequest,
  parseUpdateClientRequest,
  parseUuidParameter
} from './clients.dto';
import { ClientsService } from './clients.service';

@ApiTags('admin-clients')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients')
export class AdminClientsController {
  constructor(@Inject(ClientsService) private readonly clients: ClientsService) {}

  @Get()
  @ApiOkResponse({ type: ClientResponseDto, isArray: true })
  list(): Promise<ClientResponseDto[]> {
    return this.clients.listAdmin();
  }

  @Post('organizations')
  @ApiBody({ type: CreateOrganizationRequestDto })
  @ApiCreatedResponse({ type: ClientCreatedResponseDto })
  createOrganization(
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientCreatedResponseDto> {
    return this.clients.createOrganization(parseCreateOrganizationRequest(body), principal, request.operationId);
  }

  @Get(':clientId')
  @ApiOkResponse({ type: ClientResponseDto })
  get(@Param('clientId') clientIdInput: string): Promise<ClientResponseDto> {
    return this.clients.getAdmin(parseUuidParameter(clientIdInput, 'clientId'));
  }

  @Patch(':clientId')
  @ApiBody({ type: UpdateClientRequestDto })
  @ApiOkResponse({ type: ClientResponseDto })
  update(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientResponseDto> {
    return this.clients.updateAdmin(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseUpdateClientRequest(body),
      principal,
      request.operationId
    );
  }

  @Post(':clientId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: SuspendClientRequestDto })
  @ApiOkResponse({ type: ClientResponseDto })
  suspend(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientResponseDto> {
    return this.clients.suspend(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseSuspendClientRequest(body),
      principal,
      request.operationId
    );
  }

  @Post(':clientId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ClientResponseDto })
  restore(
    @Param('clientId') clientIdInput: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ClientResponseDto> {
    return this.clients.restore(parseUuidParameter(clientIdInput, 'clientId'), principal, request.operationId);
  }
}
