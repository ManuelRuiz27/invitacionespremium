import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { parseUuidParameter } from '../clients/clients.dto';
import { UserRole } from '../generated/prisma/client';
import {
  CorrectPilotObservationRequestDto,
  PilotObservationJournalResponseDto,
  PilotObservationRequestDto,
  PilotObservationResponseDto,
  parsePilotObservation,
  parsePilotObservationCorrection
} from './pilot-observations.dto';
import { PilotObservationsService } from './pilot-observations.service';

@ApiTags('admin-pilot-observations')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId/pilot-observations')
export class AdminPilotObservationsController {
  constructor(@Inject(PilotObservationsService) private readonly observations: PilotObservationsService) {}

  @Post()
  @ApiBody({ type: PilotObservationRequestDto })
  @ApiCreatedResponse({ type: PilotObservationResponseDto })
  create(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PilotObservationResponseDto> {
    return this.observations.create(
      parseUuidParameter(clientId, 'clientId'),
      parseUuidParameter(eventId, 'eventId'),
      parsePilotObservation(body),
      principal,
      request.operationId
    );
  }

  @Get()
  @ApiOkResponse({ type: PilotObservationJournalResponseDto })
  get(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string
  ): Promise<PilotObservationJournalResponseDto> {
    return this.observations.get(parseUuidParameter(clientId, 'clientId'), parseUuidParameter(eventId, 'eventId'));
  }

  @Post(':observationId/correction')
  @ApiBody({ type: CorrectPilotObservationRequestDto })
  @ApiCreatedResponse({ type: PilotObservationResponseDto })
  correct(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('observationId') observationId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<PilotObservationResponseDto> {
    return this.observations.correct(
      parseUuidParameter(clientId, 'clientId'),
      parseUuidParameter(eventId, 'eventId'),
      parseUuidParameter(observationId, 'observationId'),
      parsePilotObservationCorrection(body),
      principal,
      request.operationId
    );
  }
}
