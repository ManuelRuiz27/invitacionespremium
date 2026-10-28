import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { parseManagedPlanIdempotencyKey, parseManagedPlanUuid } from './managed-plans.dto';
import {
  ManagedCollectionHistoryEntryDto,
  ManagedCollectionPaymentRequestDto,
  ManagedCollectionReversalRequestDto,
  ManagedCollectionsResponseDto,
  ManagedExtraordinaryChargeRequestDto,
  parseManagedCollectionPayment,
  parseManagedCollectionReversal,
  parseManagedExtraordinaryCharge
} from './managed-collections.dto';
import { ManagedCollectionsService } from './managed-collections.service';

@ApiTags('admin-managed-collections')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/managed-contracts/:contractId/collections')
export class ManagedCollectionsController {
  constructor(@Inject(ManagedCollectionsService) private readonly collections: ManagedCollectionsService) {}

  @Get()
  @ApiOkResponse({ type: ManagedCollectionsResponseDto })
  list(
    @Param('clientId') clientId: string,
    @Param('contractId') contractId: string,
    @CurrentAuth() principal: AuthPrincipal
  ) {
    return this.collections.list(parseManagedPlanUuid(clientId), parseManagedPlanUuid(contractId), principal);
  }

  @Get('history')
  @ApiOkResponse({ type: ManagedCollectionHistoryEntryDto, isArray: true })
  async history(
    @Param('clientId') clientId: string,
    @Param('contractId') contractId: string,
    @CurrentAuth() principal: AuthPrincipal
  ) {
    return (await this.collections.list(parseManagedPlanUuid(clientId), parseManagedPlanUuid(contractId), principal))
      .history;
  }

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ManagedCollectionPaymentRequestDto })
  @ApiCreatedResponse({ type: ManagedCollectionsResponseDto })
  pay(
    @Param('clientId') clientId: string,
    @Param('contractId') contractId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.collections.pay(
      parseManagedPlanUuid(clientId),
      parseManagedPlanUuid(contractId),
      parseManagedPlanIdempotencyKey(key),
      parseManagedCollectionPayment(body),
      principal,
      request.operationId
    );
  }

  @Post('payments/:paymentId/reverse')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ManagedCollectionReversalRequestDto })
  @ApiCreatedResponse({ type: ManagedCollectionsResponseDto })
  reverse(
    @Param('clientId') clientId: string,
    @Param('contractId') contractId: string,
    @Param('paymentId') paymentId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.collections.reverse(
      parseManagedPlanUuid(clientId),
      parseManagedPlanUuid(contractId),
      parseManagedPlanUuid(paymentId),
      parseManagedPlanIdempotencyKey(key),
      parseManagedCollectionReversal(body),
      principal,
      request.operationId
    );
  }

  @Post('extraordinary-charges')
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ManagedExtraordinaryChargeRequestDto })
  @ApiCreatedResponse({ type: ManagedCollectionsResponseDto })
  confirmExtra(
    @Param('clientId') clientId: string,
    @Param('contractId') contractId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.collections.confirmExtra(
      parseManagedPlanUuid(clientId),
      parseManagedPlanUuid(contractId),
      parseManagedPlanIdempotencyKey(key),
      parseManagedExtraordinaryCharge(body),
      principal,
      request.operationId
    );
  }
}
