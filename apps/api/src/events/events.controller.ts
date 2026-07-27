import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags
} from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  CreateEventRequestDto,
  EventResponseDto,
  UpdateEventRequestDto,
  parseCreateEventRequest,
  parseEventId,
  parseUpdateEventRequest
} from './events.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events')
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}

  @Get()
  @ApiOkResponse({ type: EventResponseDto, isArray: true })
  list(@CurrentAuth() principal: AuthPrincipal): Promise<EventResponseDto[]> {
    return this.events.listOwned(principal);
  }

  @Post()
  @ApiBody({ type: CreateEventRequestDto })
  @ApiCreatedResponse({ type: EventResponseDto })
  create(
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<EventResponseDto> {
    return this.events.create(parseCreateEventRequest(body), principal, request.operationId);
  }

  @Get(':eventId')
  @ApiOkResponse({ type: EventResponseDto })
  get(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal): Promise<EventResponseDto> {
    return this.events.getOwned(parseEventId(eventId), principal);
  }

  @Patch(':eventId')
  @ApiBody({ type: UpdateEventRequestDto })
  @ApiOkResponse({ type: EventResponseDto })
  update(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<EventResponseDto> {
    return this.events.update(parseEventId(eventId), parseUpdateEventRequest(body), principal, request.operationId);
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.events.softDelete(parseEventId(eventId), principal, request.operationId);
  }
}
