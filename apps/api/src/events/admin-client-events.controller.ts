import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseUuidParameter } from '../clients/clients.dto';
import { UserRole } from '../generated/prisma/client';
import { EventIntakeQuoteResponseDto } from './event-commercial.dto';
import { EventCommercialService } from './event-commercial.service';
import {
  AdminEventAssignmentRequestDto,
  AdminEventIntakeRequestDto,
  EventResponseDto,
  UpdateEventRequestDto,
  parseAdminEventAssignment,
  parseAdminEventIntake,
  parseAdminEventIntakeQuote,
  parseEventId,
  parseUpdateEventRequest
} from './events.dto';
import { EventsService } from './events.service';

@ApiTags('admin-events')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events')
export class AdminClientEventsController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(EventCommercialService) private readonly commercial: EventCommercialService
  ) {}

  @Get('intake-quote')
  @ApiOkResponse({ type: EventIntakeQuoteResponseDto })
  @ApiQuery({ name: 'serviceCode', enum: ['FLYER', 'FLIPBOOK', 'PHYSICAL_QR'] })
  @ApiQuery({ name: 'capacity', type: Number, minimum: 1, maximum: 150 })
  quoteIntake(@Param('clientId') clientIdInput: string, @Query() query: unknown): Promise<EventIntakeQuoteResponseDto> {
    const input = parseAdminEventIntakeQuote(query);
    return this.commercial.quoteIntake(
      parseUuidParameter(clientIdInput, 'clientId'),
      input.serviceCode,
      input.capacity
    );
  }

  @Post()
  @ApiBody({ type: AdminEventIntakeRequestDto })
  @ApiCreatedResponse({ type: EventResponseDto })
  create(
    @Param('clientId') clientIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<EventResponseDto> {
    return this.events.createAdminIntake(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseAdminEventIntake(body),
      principal,
      request.operationId
    );
  }

  @Patch(':eventId/assignment')
  @ApiBody({ type: AdminEventAssignmentRequestDto })
  @ApiOkResponse({ type: EventResponseDto })
  updateAssignment(
    @Param('clientId') clientIdInput: string,
    @Param('eventId') eventIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<EventResponseDto> {
    return this.events.updateAdminAssignment(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseEventId(eventIdInput),
      parseAdminEventAssignment(body),
      principal,
      request.operationId
    );
  }

  @Patch(':eventId')
  @ApiBody({ type: UpdateEventRequestDto })
  @ApiOkResponse({ type: EventResponseDto })
  update(
    @Param('clientId') clientIdInput: string,
    @Param('eventId') eventIdInput: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<EventResponseDto> {
    return this.events.updateAdmin(
      parseUuidParameter(clientIdInput, 'clientId'),
      parseEventId(eventIdInput),
      parseUpdateEventRequest(body),
      principal,
      request.operationId
    );
  }
}
