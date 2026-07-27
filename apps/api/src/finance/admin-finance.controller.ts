import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  AssignCreditsRequestDto,
  ConfigureCreditLineRequestDto,
  FinanceBalanceResponseDto,
  FinanceCutResponseDto,
  FinanceMutationResponseDto,
  ManualPaymentRequestDto,
  parseAssignCreditsRequest,
  parseConfigureCreditLineRequest,
  parseDailyCutQuery,
  parseIdempotencyKey,
  parseManualPaymentRequest,
  parseMonthlyCutQuery,
  parseUuidParameter
} from './finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('admin-finance')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get('clients/:clientId/balance')
  @ApiOkResponse({ type: FinanceBalanceResponseDto })
  balance(@Param('clientId') clientIdInput: string): Promise<FinanceBalanceResponseDto> {
    return this.finance.getBalance(parseUuidParameter(clientIdInput, 'clientId'));
  }

  @Post('clients/:clientId/assign-credits')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: AssignCreditsRequestDto })
  @ApiCreatedResponse({ type: FinanceMutationResponseDto })
  assignCredits(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKeyInput: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FinanceMutationResponseDto> {
    return this.finance.assignCredits(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseAssignCreditsRequest(body),
      parseIdempotencyKey(idempotencyKeyInput),
      principal,
      request.operationId
    );
  }

  @Post('clients/:clientId/credit-line')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ConfigureCreditLineRequestDto })
  @ApiCreatedResponse({ type: FinanceMutationResponseDto })
  configureCreditLine(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKeyInput: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FinanceMutationResponseDto> {
    return this.finance.configureCreditLine(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseConfigureCreditLineRequest(body),
      parseIdempotencyKey(idempotencyKeyInput),
      principal,
      request.operationId
    );
  }

  @Post('clients/:clientId/manual-payment')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ManualPaymentRequestDto })
  @ApiCreatedResponse({ type: FinanceMutationResponseDto })
  manualPayment(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKeyInput: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FinanceMutationResponseDto> {
    return this.finance.registerManualPayment(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseManualPaymentRequest(body),
      parseIdempotencyKey(idempotencyKeyInput),
      principal,
      request.operationId
    );
  }

  @Post('clients/:clientId/rebuild-balance')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: FinanceMutationResponseDto })
  rebuildBalance(
    @Param('clientId') clientIdInput: string,
    @Headers('idempotency-key') idempotencyKeyInput: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FinanceMutationResponseDto> {
    return this.finance.rebuildBalanceFromLedger(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseIdempotencyKey(idempotencyKeyInput),
      principal,
      request.operationId
    );
  }

  @Get('cuts/daily')
  @ApiOkResponse({ type: FinanceCutResponseDto })
  dailyCut(@Query() query: unknown): Promise<FinanceCutResponseDto> {
    return this.finance.getDailyCut(parseDailyCutQuery(query));
  }

  @Get('cuts/monthly')
  @ApiOkResponse({ type: FinanceCutResponseDto })
  monthlyCut(@Query() query: unknown): Promise<FinanceCutResponseDto> {
    return this.finance.getMonthlyCut(parseMonthlyCutQuery(query));
  }
}
