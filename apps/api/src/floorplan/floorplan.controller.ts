import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOkResponse, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PublicRoute } from '../auth/public-route.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseEventId } from '../events/events.dto';
import { parseIdempotencyKey } from '../finance/finance.dto';
import { UserRole } from '../generated/prisma/client';
import {
  AssignFamilyRequestDto,
  AssignGroupRequestDto,
  AssignSeatingRequestDto,
  FloorplanResponseDto,
  ScannerFloorplanResponseDto,
  SeatingMutationResponseDto,
  SeatingWorkspacePageDto,
  UpdateSeatingRequestDto,
  parseAssignFamily,
  parseAssignGroup,
  parseAssignSeating,
  parseFloorplanId,
  parseSeatingWorkspaceQuery,
  parseUpdateSeating
} from './floorplan.dto';
import { FloorplanService } from './floorplan.service';

const PLANNER_ROLES = [UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER];

@ApiTags('floorplan')
@ApiCookieAuth()
@Roles(...PLANNER_ROLES)
@Controller('events/:eventId')
export class FloorplanController {
  constructor(@Inject(FloorplanService) private readonly floorplan: FloorplanService) {}

  @Get('floorplan')
  @ApiOkResponse({ type: FloorplanResponseDto })
  get(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal): Promise<FloorplanResponseDto> {
    return this.floorplan.get(parseEventId(eventId), principal);
  }

  @Get('seating')
  @ApiQuery({ name: 'scope', enum: ['UNASSIGNED', 'TABLE'], required: true })
  @ApiQuery({ name: 'tableShapeId', type: String, format: 'uuid', required: false })
  @ApiQuery({ name: 'groupId', type: String, format: 'uuid', required: false })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({ name: 'cursor', type: String, required: false })
  @ApiQuery({ name: 'limit', type: Number, minimum: 1, maximum: 100, required: false })
  @ApiOkResponse({ type: SeatingWorkspacePageDto })
  seatingWorkspace(
    @Param('eventId') eventId: string,
    @Query() query: unknown,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<SeatingWorkspacePageDto> {
    return this.floorplan.seatingWorkspace(parseEventId(eventId), parseSeatingWorkspaceQuery(query), principal);
  }

  @Post('seating/assign')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: AssignSeatingRequestDto })
  @ApiOkResponse({ type: SeatingMutationResponseDto })
  assign(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<SeatingMutationResponseDto> {
    return this.floorplan.assign(
      parseEventId(eventId),
      parseIdempotencyKey(key),
      parseAssignSeating(body),
      principal,
      request.operationId
    );
  }

  @Post('seating/assign-family')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: AssignFamilyRequestDto })
  @ApiOkResponse({ type: SeatingMutationResponseDto })
  assignFamily(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<SeatingMutationResponseDto> {
    return this.floorplan.assignFamily(
      parseEventId(eventId),
      parseIdempotencyKey(key),
      parseAssignFamily(body),
      principal,
      request.operationId
    );
  }

  @Post('seating/assign-group')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: AssignGroupRequestDto })
  @ApiOkResponse({ type: SeatingMutationResponseDto })
  assignGroup(
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<SeatingMutationResponseDto> {
    return this.floorplan.assignGroup(
      parseEventId(eventId),
      parseIdempotencyKey(key),
      parseAssignGroup(body),
      principal,
      request.operationId
    );
  }

  @Patch('seating/:assistantId')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: UpdateSeatingRequestDto })
  @ApiOkResponse({ type: SeatingMutationResponseDto })
  updateSeating(
    @Param('eventId') eventId: string,
    @Param('assistantId') assistantId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<SeatingMutationResponseDto> {
    return this.floorplan.updateSeating(
      parseEventId(eventId),
      parseFloorplanId(assistantId),
      parseIdempotencyKey(key),
      parseUpdateSeating(body),
      principal,
      request.operationId
    );
  }
}

@ApiTags('scanner')
@PublicRoute()
@Controller('scanner/:staffToken/floorplan')
export class ScannerFloorplanController {
  constructor(@Inject(FloorplanService) private readonly floorplan: FloorplanService) {}

  @Get()
  @ApiOkResponse({ type: ScannerFloorplanResponseDto })
  get(@Param('staffToken') token: string): Promise<ScannerFloorplanResponseDto> {
    return this.floorplan.scannerFloorplan(token);
  }

  @Get('content')
  @ApiProduces('image/jpeg', 'image/png')
  async content(@Param('staffToken') token: string, @Res() response: Response): Promise<void> {
    const content = await this.floorplan.scannerContent(token);
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader('ETag', content.etag);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(content.bytes);
  }
}
