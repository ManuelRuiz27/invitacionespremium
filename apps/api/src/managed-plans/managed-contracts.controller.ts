import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { parseManagedPlanIdempotencyKey, parseManagedPlanUuid } from './managed-plans.dto';
import {
  AssignManagedContractRequestDto,
  ManagedConsumptionResponseDto,
  ManagedContractResponseDto,
  parseAssignManagedContract
} from './managed-contracts.dto';
import { ManagedContractsService } from './managed-contracts.service';

@ApiTags('admin-managed-contracts')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/managed-contracts')
export class ManagedContractsController {
  constructor(@Inject(ManagedContractsService) private readonly contracts: ManagedContractsService) {}

  @Get()
  @ApiOkResponse({ type: ManagedContractResponseDto, isArray: true })
  list(
    @Param('clientId') clientId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<ManagedContractResponseDto[]> {
    return this.contracts.list(parseManagedPlanUuid(clientId), principal);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: AssignManagedContractRequestDto })
  @ApiCreatedResponse({ type: ManagedContractResponseDto })
  assign(
    @Param('clientId') clientId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ManagedContractResponseDto> {
    return this.contracts.assign(
      parseManagedPlanUuid(clientId),
      parseManagedPlanIdempotencyKey(key),
      parseAssignManagedContract(body),
      principal,
      request.operationId
    );
  }

  @Get(':contractId/consumption')
  @ApiOkResponse({ type: ManagedConsumptionResponseDto })
  consumption(
    @Param('clientId') clientId: string,
    @Param('contractId') contractId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<ManagedConsumptionResponseDto> {
    return this.contracts.consumption(parseManagedPlanUuid(clientId), parseManagedPlanUuid(contractId), principal);
  }
}
