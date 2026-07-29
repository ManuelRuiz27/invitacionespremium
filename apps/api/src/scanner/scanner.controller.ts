import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PublicRoute } from '../auth/public-route.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseEventId } from '../events/events.dto';
import { parseIdempotencyKey } from '../finance/finance.dto';
import { UserRole } from '../generated/prisma/client';
import {
  CheckInRevertResponseDto,
  ScannerCheckInRequestDto,
  ScannerCheckInResponseDto,
  ScannerScanRequestDto,
  ScannerScanResponseDto,
  ScannerSearchRequestDto,
  ScannerSearchResponseDto,
  parseCheckInId,
  parseScannerCheckIn,
  parseScannerScan,
  parseScannerSearch
} from './scanner.dto';
import { ScannerService } from './scanner.service';

@ApiTags('scanner')
@PublicRoute()
@Controller('scanner/:staffToken')
export class ScannerController {
  constructor(@Inject(ScannerService) private readonly scanner: ScannerService) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ScannerScanRequestDto })
  @ApiOkResponse({ type: ScannerScanResponseDto })
  scan(@Param('staffToken') token: string, @Body() body: unknown): Promise<ScannerScanResponseDto> {
    return this.scanner.scan(token, parseScannerScan(body));
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: ScannerSearchRequestDto })
  @ApiOkResponse({ type: ScannerSearchResponseDto })
  search(@Param('staffToken') token: string, @Body() body: unknown): Promise<ScannerSearchResponseDto> {
    return this.scanner.search(token, parseScannerSearch(body));
  }

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ScannerCheckInRequestDto })
  @ApiOkResponse({ type: ScannerCheckInResponseDto })
  checkIn(
    @Param('staffToken') token: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ): Promise<ScannerCheckInResponseDto> {
    return this.scanner.checkIn(token, parseIdempotencyKey(key), parseScannerCheckIn(body), request.operationId);
  }
}

@ApiTags('check-ins')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/check-ins')
export class CheckInsController {
  constructor(@Inject(ScannerService) private readonly scanner: ScannerService) {}

  @Post(':checkInId/revert')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: CheckInRevertResponseDto })
  revert(
    @Param('eventId') eventId: string,
    @Param('checkInId') checkInId: string,
    @Headers('idempotency-key') key: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<CheckInRevertResponseDto> {
    return this.scanner.revert(
      parseEventId(eventId),
      parseCheckInId(checkInId),
      parseIdempotencyKey(key),
      principal,
      request.operationId
    );
  }
}
