import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { PublicRoute } from '../auth/public-route.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { parseEventId } from '../events/events.dto';
import { UserRole } from '../generated/prisma/client';
import { parseInvitationId } from '../invitations/invitations.dto';
import { InvitationQrService } from './invitation-qr.service';
import {
  ConfirmationStateResponseDto,
  PublicInvitationViewResponseDto,
  RsvpAssistantsRequestDto,
  RsvpMutationResponseDto,
  RsvpOverrideRequestDto,
  parsePublicUuid,
  parseRsvpAssistants,
  parseRsvpOverride
} from './public-rsvp.dto';
import { PublicRsvpService } from './public-rsvp.service';

@ApiTags('public-rsvp')
@PublicRoute()
@Controller('public/invitations')
export class PublicRsvpController {
  constructor(
    @Inject(PublicRsvpService) private readonly rsvp: PublicRsvpService,
    @Inject(InvitationQrService) private readonly invitationQr: InvitationQrService
  ) {}

  @Get(':invitationToken')
  @ApiOkResponse({ type: PublicInvitationViewResponseDto })
  resolve(@Param('invitationToken') token: string): Promise<PublicInvitationViewResponseDto> {
    return this.rsvp.resolve(token);
  }

  @Get(':invitationToken/assets/:fileAssetId/content')
  @ApiProduces('image/jpeg', 'image/png')
  @ApiOkResponse({
    description: 'Private invitation-scoped design asset.',
    headers: {
      'Content-Type': { schema: { type: 'string' } },
      'Content-Length': { schema: { type: 'integer' } },
      ETag: { schema: { type: 'string' } },
      'Content-Disposition': { schema: { type: 'string', example: 'inline' } },
      'Cache-Control': { schema: { type: 'string', example: 'private, no-store' } },
      'X-Content-Type-Options': { schema: { type: 'string', example: 'nosniff' } },
      'Referrer-Policy': { schema: { type: 'string', example: 'no-referrer' } }
    }
  })
  async content(
    @Param('invitationToken') token: string,
    @Param('fileAssetId') fileAssetId: string,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.rsvp.content(token, parsePublicUuid(fileAssetId));
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', String(content.sizeBytes));
    response.setHeader('ETag', content.etag);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.end(content.bytes);
  }

  @Get(':invitationToken/qr.svg')
  @ApiProduces('image/svg+xml')
  @ApiOkResponse({
    description: 'Deterministic invitation QR SVG generated on demand.',
    content: { 'image/svg+xml': { schema: { type: 'string', format: 'binary' } } },
    headers: {
      'Content-Type': { schema: { type: 'string', example: 'image/svg+xml; charset=utf-8' } },
      'Content-Length': { schema: { type: 'integer' } },
      ETag: { schema: { type: 'string' } },
      'Content-Disposition': { schema: { type: 'string', example: 'inline' } },
      'Cache-Control': { schema: { type: 'string', example: 'private, no-store' } },
      'X-Content-Type-Options': { schema: { type: 'string', example: 'nosniff' } },
      'Referrer-Policy': { schema: { type: 'string', example: 'no-referrer' } },
      'Content-Security-Policy': { schema: { type: 'string', example: "default-src 'none'" } }
    }
  })
  async qrSvg(@Param('invitationToken') token: string, @Res() response: Response): Promise<void> {
    const content = await this.invitationQr.getSvg(token);
    response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    response.setHeader('Content-Length', String(content.bytes.length));
    response.setHeader('ETag', content.etag);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.end(content.bytes);
  }

  @Post(':invitationToken/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RsvpAssistantsRequestDto })
  @ApiOkResponse({ type: RsvpMutationResponseDto })
  confirm(
    @Param('invitationToken') token: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ): Promise<RsvpMutationResponseDto> {
    return this.rsvp.confirm(token, parseRsvpAssistants(body), request.operationId);
  }

  @Post(':invitationToken/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RsvpMutationResponseDto })
  reject(
    @Param('invitationToken') token: string,
    @Req() request: AuthenticatedRequest
  ): Promise<RsvpMutationResponseDto> {
    return this.rsvp.reject(token, request.operationId);
  }

  @Patch(':invitationToken/assistants')
  @ApiBody({ type: RsvpAssistantsRequestDto })
  @ApiOkResponse({ type: RsvpMutationResponseDto })
  assistants(
    @Param('invitationToken') token: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ): Promise<RsvpMutationResponseDto> {
    return this.rsvp.modifyAssistants(token, parseRsvpAssistants(body), request.operationId);
  }
}

@ApiTags('event-confirmation')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId')
export class EventConfirmationController {
  constructor(@Inject(PublicRsvpService) private readonly rsvp: PublicRsvpService) {}

  @Get('confirmation')
  @ApiOkResponse({ type: ConfirmationStateResponseDto })
  confirmation(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<ConfirmationStateResponseDto> {
    return this.rsvp.confirmation(parseEventId(eventId), principal);
  }

  @Post('confirmation/close')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ConfirmationStateResponseDto })
  close(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ConfirmationStateResponseDto> {
    return this.rsvp.closeConfirmation(parseEventId(eventId), principal, request.operationId);
  }

  @Post('confirmation/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ConfirmationStateResponseDto })
  reopen(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<ConfirmationStateResponseDto> {
    return this.rsvp.reopenConfirmation(parseEventId(eventId), principal, request.operationId);
  }

  @Put('invitations/:invitationId/confirmation')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RsvpOverrideRequestDto })
  @ApiOkResponse({ type: RsvpMutationResponseDto })
  override(
    @Param('eventId') eventId: string,
    @Param('invitationId') invitationId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<RsvpMutationResponseDto> {
    return this.rsvp.override(
      parseEventId(eventId),
      parseInvitationId(invitationId),
      parseRsvpOverride(body),
      principal,
      request.operationId
    );
  }
}
