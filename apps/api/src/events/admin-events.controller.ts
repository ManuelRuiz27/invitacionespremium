import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { EventResponseDto, parseEventId } from './events.dto';
import { EventsService } from './events.service';

@ApiTags('admin-events')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/events')
export class AdminEventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}

  @Get()
  @ApiOkResponse({ type: EventResponseDto, isArray: true })
  list(): Promise<EventResponseDto[]> {
    return this.events.listAdmin();
  }

  @Get(':eventId')
  @ApiOkResponse({ type: EventResponseDto })
  get(@Param('eventId') eventId: string): Promise<EventResponseDto> {
    return this.events.getAdmin(parseEventId(eventId));
  }

  @Post(':eventId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: EventResponseDto })
  restore(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<EventResponseDto> {
    return this.events.restoreAdmin(parseEventId(eventId), principal, request.operationId);
  }
}
