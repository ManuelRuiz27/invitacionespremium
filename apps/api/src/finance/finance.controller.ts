import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  FinanceBalanceResponseDto,
  LedgerMovementResponseDto,
  ReceiptResponseDto,
  parseListMovementsQuery,
  parseListReceiptsQuery
} from './finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN)
@Controller('finance')
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get('balance')
  @ApiOkResponse({ type: FinanceBalanceResponseDto })
  balance(@CurrentAuth() principal: AuthPrincipal): Promise<FinanceBalanceResponseDto> {
    return this.finance.getOwnBalance(principal);
  }

  @Get('movements')
  @ApiOkResponse({ type: LedgerMovementResponseDto, isArray: true })
  movements(@CurrentAuth() principal: AuthPrincipal, @Query() query: unknown): Promise<LedgerMovementResponseDto[]> {
    return this.finance.listOwnMovements(principal, parseListMovementsQuery(query));
  }

  @Get('receipts')
  @ApiOkResponse({ type: ReceiptResponseDto, isArray: true })
  receipts(@CurrentAuth() principal: AuthPrincipal, @Query() query: unknown): Promise<ReceiptResponseDto[]> {
    return this.finance.listOwnReceipts(principal, parseListReceiptsQuery(query));
  }
}
