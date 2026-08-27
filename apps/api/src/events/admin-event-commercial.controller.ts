import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseUuidParameter } from '../clients/clients.dto';
import { UserRole } from '../generated/prisma/client';
import {
  CommercialAuthorizationRequestDto,
  CommercialRequoteRequestDto,
  EventCommercialResponseDto,
  parseCommercialAuthorization,
  parseCommercialQuote,
  parseCommercialRequote
} from './event-commercial.dto';
import { EventCommercialService } from './event-commercial.service';
import { parseEventId } from './events.dto';
import { EventsService } from './events.service';

@ApiTags('admin-event-commercial')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId')
export class AdminEventCommercialController {
  constructor(
    @Inject(EventCommercialService) private readonly commercial: EventCommercialService,
    @Inject(EventsService) private readonly events: EventsService
  ) {}

  @Get('commercial-quote')
  @ApiOkResponse({ type: EventCommercialResponseDto })
  @ApiQuery({ name: 'serviceId', type: String, format: 'uuid', required: false })
  @ApiQuery({ name: 'capacity', type: Number, minimum: 1, maximum: 150, required: false })
  quote(@Param('clientId') clientId: string, @Param('eventId') eventId: string, @Query() query: unknown) {
    return this.commercial.quote(
      parseUuidParameter(clientId, 'clientId'),
      parseEventId(eventId),
      parseCommercialQuote(query)
    );
  }

  @Post('commercial-authorization')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: CommercialAuthorizationRequestDto })
  @ApiOkResponse({ type: EventCommercialResponseDto })
  authorize(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    parseCommercialAuthorization(body);
    return this.commercial.authorize(
      parseUuidParameter(clientId, 'clientId'),
      parseEventId(eventId),
      principal,
      request.operationId
    );
  }

  @Post('design-kickoff')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: EventCommercialResponseDto })
  kickoff(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.commercial.kickoff(
      parseUuidParameter(clientId, 'clientId'),
      parseEventId(eventId),
      principal,
      request.operationId
    );
  }

  @Post('commercial-requote')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: CommercialRequoteRequestDto })
  @ApiOkResponse({ type: EventCommercialResponseDto })
  requote(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.events.requoteAdmin(
      parseUuidParameter(clientId, 'clientId'),
      parseEventId(eventId),
      parseCommercialRequote(body),
      principal,
      request.operationId
    );
  }
}
