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
  Req
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PublicRoute } from '../auth/public-route.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { parseEventId } from '../events/events.dto';
import { parseIdempotencyKey } from '../finance/finance.dto';
import { UserRole } from '../generated/prisma/client';
import {
  AssistantRequestDto,
  AssistantResponseDto,
  InvitationResponseDto,
  PublicInvitationResponseDto,
  UpdateInvitationRequestDto,
  parseAssistant,
  parseInvitationId,
  parseUpdateInvitation
} from './invitations.dto';
import { InvitationsService } from './invitations.service';

@ApiTags('invitations')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/invitations')
export class InvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Get()
  @ApiOkResponse({ type: InvitationResponseDto, isArray: true })
  list(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal): Promise<InvitationResponseDto[]> {
    return this.invitations.list(parseEventId(eventId), principal);
  }

  @Get(':invitationId')
  @ApiOkResponse({ type: InvitationResponseDto })
  get(
    @Param('eventId') eventId: string,
    @Param('invitationId') invitationId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<InvitationResponseDto> {
    return this.invitations.get(parseEventId(eventId), parseInvitationId(invitationId), principal);
  }

  @Patch(':invitationId')
  @ApiBody({ type: UpdateInvitationRequestDto })
  @ApiOkResponse({ type: InvitationResponseDto })
  update(
    @Param('eventId') eventId: string,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationResponseDto> {
    return this.invitations.update(
      parseEventId(eventId),
      parseInvitationId(invitationId),
      parseUpdateInvitation(body),
      principal,
      request.operationId
    );
  }

  @Post(':invitationId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: InvitationResponseDto })
  cancel(
    @Param('eventId') eventId: string,
    @Param('invitationId') invitationId: string,
    @Headers('idempotency-key') idempotencyKey: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationResponseDto> {
    return this.invitations.cancel(
      parseEventId(eventId),
      parseInvitationId(invitationId),
      parseIdempotencyKey(idempotencyKey),
      principal,
      request.operationId
    );
  }

  @Post(':invitationId/assistants')
  @ApiBody({ type: AssistantRequestDto })
  @ApiCreatedResponse({ type: AssistantResponseDto })
  createAssistant(
    @Param('eventId') eventId: string,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<AssistantResponseDto> {
    return this.invitations.createAssistant(
      parseEventId(eventId),
      parseInvitationId(invitationId),
      parseAssistant(body),
      principal,
      request.operationId
    );
  }

  @Patch(':invitationId/assistants/:assistantId')
  @ApiBody({ type: AssistantRequestDto })
  @ApiOkResponse({ type: AssistantResponseDto })
  updateAssistant(
    @Param('eventId') eventId: string,
    @Param('invitationId') invitationId: string,
    @Param('assistantId') assistantId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<AssistantResponseDto> {
    return this.invitations.updateAssistant(
      parseEventId(eventId),
      parseInvitationId(invitationId),
      parseInvitationId(assistantId),
      parseAssistant(body),
      principal,
      request.operationId
    );
  }

  @Delete(':invitationId/assistants/:assistantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteAssistant(
    @Param('eventId') eventId: string,
    @Param('invitationId') invitationId: string,
    @Param('assistantId') assistantId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.invitations.deleteAssistant(
      parseEventId(eventId),
      parseInvitationId(invitationId),
      parseInvitationId(assistantId),
      principal,
      request.operationId
    );
  }
}

@ApiTags('public-invitations')
@PublicRoute()
@Controller('public/invitations')
export class PublicInvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Get(':invitationToken')
  @ApiOkResponse({ type: PublicInvitationResponseDto })
  resolve(@Param('invitationToken') token: string): Promise<PublicInvitationResponseDto> {
    return this.invitations.resolvePublic(token);
  }
}
