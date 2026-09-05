import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  FloorplanImageRequestDto,
  FloorplanResponseDto,
  FloorplanShapeRequestDto,
  FloorplanShapeResponseDto,
  FloorplanSeatRequestDto,
  FloorplanSeatResponseDto,
  UpdateFloorplanSeatRequestDto,
  UpdateFloorplanSeatingModeRequestDto,
  UpdateFloorplanShapeRequestDto,
  parseCreateFloorplan,
  parseCreateShape,
  parseFloorplanId,
  parseUpdateFloorplan,
  parseUpdateShape
  ,parseCreateSeat, parseUpdateSeat, parseSeatingMode
} from './floorplan.dto';
import { FloorplanService } from './floorplan.service';

@ApiTags('admin-floorplan')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId/floorplan')
export class AdminFloorplanController {
  constructor(@Inject(FloorplanService) private readonly floorplan: FloorplanService) {}

  @Get()
  @ApiOkResponse({ type: FloorplanResponseDto })
  get(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.getAdministrative(parseFloorplanId(clientId), parseFloorplanId(eventId), principal);
  }

  @Patch('seating-mode')
  @ApiBody({ type: UpdateFloorplanSeatingModeRequestDto })
  setSeatingMode(@Param('clientId') clientId: string, @Param('eventId') eventId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest): Promise<FloorplanResponseDto> {
    return this.floorplan.setSeatingModeAdministrative(parseFloorplanId(clientId), parseFloorplanId(eventId), parseSeatingMode(body).seatingMode, principal, request.operationId);
  }

  @Post('shapes/:shapeId/seats')
  @ApiBody({ type: FloorplanSeatRequestDto })
  @ApiOkResponse({ type: FloorplanSeatResponseDto })
  createSeat(@Param('clientId') clientId: string, @Param('eventId') eventId: string, @Param('shapeId') shapeId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest): Promise<FloorplanSeatResponseDto> {
    return this.floorplan.createSeatAdministrative(parseFloorplanId(clientId), parseFloorplanId(eventId), parseFloorplanId(shapeId), parseCreateSeat(body), principal, request.operationId);
  }

  @Patch('seats/:seatId')
  @ApiBody({ type: UpdateFloorplanSeatRequestDto })
  updateSeat(@Param('clientId') clientId: string, @Param('eventId') eventId: string, @Param('seatId') seatId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest): Promise<FloorplanSeatResponseDto> {
    return this.floorplan.updateSeatAdministrative(parseFloorplanId(clientId), parseFloorplanId(eventId), parseFloorplanId(seatId), parseUpdateSeat(body), principal, request.operationId);
  }

  @Delete('seats/:seatId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSeat(@Param('clientId') clientId: string, @Param('eventId') eventId: string, @Param('seatId') seatId: string, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.floorplan.deleteSeatAdministrative(parseFloorplanId(clientId), parseFloorplanId(eventId), parseFloorplanId(seatId), principal, request.operationId);
  }

  @Post()
  @ApiBody({ type: FloorplanImageRequestDto })
  @ApiOkResponse({ type: FloorplanResponseDto })
  create(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.createAdministrative(
      parseFloorplanId(clientId),
      parseFloorplanId(eventId),
      parseCreateFloorplan(body),
      principal,
      request.operationId
    );
  }

  @Patch()
  @ApiBody({ type: FloorplanImageRequestDto })
  @ApiOkResponse({ type: FloorplanResponseDto })
  replaceImage(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.replaceImageAdministrative(
      parseFloorplanId(clientId),
      parseFloorplanId(eventId),
      parseUpdateFloorplan(body),
      principal,
      request.operationId
    );
  }

  @Post('lock')
  @ApiOkResponse({ type: FloorplanResponseDto })
  lock(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.lockAdministrative(
      parseFloorplanId(clientId),
      parseFloorplanId(eventId),
      principal,
      request.operationId
    );
  }

  @Post('unlock')
  @ApiOkResponse({ type: FloorplanResponseDto })
  unlock(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanResponseDto> {
    return this.floorplan.unlockAdministrative(
      parseFloorplanId(clientId),
      parseFloorplanId(eventId),
      principal,
      request.operationId
    );
  }

  @Post('shapes')
  @ApiBody({ type: FloorplanShapeRequestDto })
  @ApiOkResponse({ type: FloorplanShapeResponseDto })
  createShape(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanShapeResponseDto> {
    return this.floorplan.createShapeAdministrative(
      parseFloorplanId(clientId),
      parseFloorplanId(eventId),
      parseCreateShape(body),
      principal,
      request.operationId
    );
  }

  @Patch('shapes/:shapeId')
  @ApiBody({ type: UpdateFloorplanShapeRequestDto })
  @ApiOkResponse({ type: FloorplanShapeResponseDto })
  updateShape(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('shapeId') shapeId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<FloorplanShapeResponseDto> {
    return this.floorplan.updateShapeAdministrative(
      parseFloorplanId(clientId),
      parseFloorplanId(eventId),
      parseFloorplanId(shapeId),
      parseUpdateShape(body),
      principal,
      request.operationId
    );
  }

  @Delete('shapes/:shapeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteShape(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('shapeId') shapeId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.floorplan.deleteShapeAdministrative(
      parseFloorplanId(clientId),
      parseFloorplanId(eventId),
      parseFloorplanId(shapeId),
      principal,
      request.operationId
    );
  }
}
