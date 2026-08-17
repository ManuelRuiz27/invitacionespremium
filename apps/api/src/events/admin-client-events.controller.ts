import { Body, Controller, Inject, Param, Patch, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseUuidParameter } from '../clients/clients.dto';
import { UserRole } from '../generated/prisma/client';
import { EventResponseDto, UpdateEventRequestDto, parseEventId, parseUpdateEventRequest } from './events.dto';
import { EventsService } from './events.service';

@ApiTags('admin-events')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events')
export class AdminClientEventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}

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
