import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PublicRoute } from '../auth/public-route.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseUuidParameter } from '../clients/clients.dto';
import { parseEventId } from '../events/events.dto';
import { parseIdempotencyKey } from '../finance/finance.dto';
import { UserRole } from '../generated/prisma/client';
import {
  GeneratePhysicalPassesRequestDto,
  GeneratePhysicalPassesResponseDto,
  PhysicalPassResponseDto,
  ScanPhysicalPassRequestDto,
  ScanPhysicalPassResponseDto,
  RevokePhysicalPassRequestDto,
  RevokePhysicalPassResponseDto,
  parseRevokePhysicalPass,
  parseGeneratePhysicalPasses,
  parsePhysicalPassId,
  parseScanPhysicalPass
} from './physical-passes.dto';
import { PhysicalPassesService } from './physical-passes.service';

@ApiTags('physical-passes')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/physical-passes')
export class PhysicalPassesController {
  constructor(@Inject(PhysicalPassesService) private readonly passes: PhysicalPassesService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: GeneratePhysicalPassesRequestDto })
  @ApiOkResponse({ type: GeneratePhysicalPassesResponseDto })
  generate(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<GeneratePhysicalPassesResponseDto> {
    return this.passes.generate(
      parseEventId(eventId),
      parseIdempotencyKey(key),
      parseGeneratePhysicalPasses(body),
      principal,
      request.operationId
    );
  }

  @Get()
  @ApiOkResponse({ type: PhysicalPassResponseDto, isArray: true })
  list(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal): Promise<PhysicalPassResponseDto[]> {
    return this.passes.list(parseEventId(eventId), principal);
  }

  @Post(':passId/revoke')
  @Roles(UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiParam({ name: 'passId', type: String, format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: RevokePhysicalPassRequestDto })
  @ApiOkResponse({ type: RevokePhysicalPassResponseDto })
  revoke(
    @Param('eventId') eventId: string,
    @Param('passId') passId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<RevokePhysicalPassResponseDto> {
    return this.passes.revoke(
      parseEventId(eventId),
      parsePhysicalPassId(passId),
      parseIdempotencyKey(key),
      parseRevokePhysicalPass(body),
      principal,
      request.operationId
    );
  }

  @Get(':passId/svg')
  @ApiProduces('image/svg+xml')
  @ApiResponse({
    status: HttpStatus.OK,
    headers: {
      ETag: { schema: { type: 'string' } },
      'Cache-Control': { schema: { type: 'string', example: 'private, no-store' } },
      'X-Content-Type-Options': { schema: { type: 'string', example: 'nosniff' } },
      'Referrer-Policy': { schema: { type: 'string', example: 'no-referrer' } },
      'Content-Security-Policy': { schema: { type: 'string', example: "default-src 'none'" } }
    }
  })
  async svg(
    @Param('eventId') eventId: string,
    @Param('passId') passId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.passes.getSvg(parseEventId(eventId), parsePhysicalPassId(passId), principal);
    response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    response.setHeader('Content-Length', String(content.bytes.length));
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('ETag', content.etag);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.send(content.bytes);
  }
}

@ApiTags('admin-physical-passes')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId/physical-passes')
export class AdminPhysicalPassesController {
  constructor(@Inject(PhysicalPassesService) private readonly passes: PhysicalPassesService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'clientId', type: String, format: 'uuid' })
  @ApiParam({ name: 'eventId', type: String, format: 'uuid' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: GeneratePhysicalPassesRequestDto })
  @ApiOkResponse({ type: GeneratePhysicalPassesResponseDto })
  generate(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<GeneratePhysicalPassesResponseDto> {
    return this.passes.generateAdministrative(
      parseUuidParameter(clientId, 'clientId'),
      parseEventId(eventId),
      parseIdempotencyKey(key),
      parseGeneratePhysicalPasses(body),
      principal,
      request.operationId
    );
  }
}

@ApiTags('scanner')
@PublicRoute()
@Controller('scanner/:staffToken/physical-passes')
export class ScannerPhysicalPassesController {
  constructor(@Inject(PhysicalPassesService) private readonly passes: PhysicalPassesService) {}

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: ScanPhysicalPassRequestDto })
  @ApiOkResponse({ type: ScanPhysicalPassResponseDto })
  scan(
    @Param('staffToken') staffToken: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ): Promise<ScanPhysicalPassResponseDto> {
    return this.passes.scan(staffToken, parseIdempotencyKey(key), parseScanPhysicalPass(body), request.operationId);
  }
}
