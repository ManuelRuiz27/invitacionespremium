import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
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
  FloorplanImageRequestDto,
  FloorplanResponseDto,
  FloorplanShapeRequestDto,
  FloorplanShapeResponseDto,
  ScannerFloorplanResponseDto,
  SeatingMutationResponseDto,
  SeatingWorkspacePageDto,
  UpdateFloorplanShapeRequestDto,
  UpdateSeatingRequestDto,
  parseAssignFamily,
  parseAssignGroup,
  parseAssignSeating,
  parseCreateFloorplan,
  parseCreateShape,
  parseFloorplanId,
  parseSeatingWorkspaceQuery,
  parseUpdateFloorplan,
  parseUpdateSeating,
  parseUpdateShape
} from './floorplan.dto';
import { FloorplanService } from './floorplan.service';

const PLANNER_ROLES = [UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER];

@ApiTags('floorplan')
@ApiCookieAuth()
@Roles(...PLANNER_ROLES)
@Controller('events/:eventId')
export class FloorplanController {
  constructor(@Inject(FloorplanService) private readonly floorplan: FloorplanService) {}

  @Post('floorplan')
  @ApiBody({ type: FloorplanImageRequestDto })
  @ApiOkResponse({ type: FloorplanResponseDto })
  create(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.create(parseEventId(eventId), parseCreateFloorplan(body), principal, request.operationId);
  }

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

  @Patch('floorplan')
  @ApiBody({ type: FloorplanImageRequestDto })
  @ApiOkResponse({ type: FloorplanResponseDto })
  replaceImage(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.replaceImage(
      parseEventId(eventId),
      parseUpdateFloorplan(body),
      principal,
      request.operationId
    );
  }

  @Post('floorplan/lock')
  @ApiOkResponse({ type: FloorplanResponseDto })
  lock(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.lock(parseEventId(eventId), principal, request.operationId);
  }

  @Post('floorplan/unlock')
  @ApiOkResponse({ type: FloorplanResponseDto })
  unlock(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.unlock(parseEventId(eventId), principal, request.operationId);
  }

  @Post('floorplan/shapes')
  @ApiBody({ type: FloorplanShapeRequestDto })
  @ApiOkResponse({ type: FloorplanShapeResponseDto })
  createShape(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanShapeResponseDto> {
    return this.floorplan.createShape(parseEventId(eventId), parseCreateShape(body), principal, request.operationId);
  }

  @Patch('floorplan/shapes/:shapeId')
  @ApiBody({ type: UpdateFloorplanShapeRequestDto })
  @ApiOkResponse({ type: FloorplanShapeResponseDto })
  updateShape(
    @Param('eventId') eventId: string,
    @Param('shapeId') shapeId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanShapeResponseDto> {
    return this.floorplan.updateShape(
      parseEventId(eventId),
      parseFloorplanId(shapeId),
      parseUpdateShape(body),
      principal,
      request.operationId
    );
  }

  @Delete('floorplan/shapes/:shapeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteShape(
    @Param('eventId') eventId: string,
    @Param('shapeId') shapeId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.floorplan.deleteShape(parseEventId(eventId), parseFloorplanId(shapeId), principal, request.operationId);
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
