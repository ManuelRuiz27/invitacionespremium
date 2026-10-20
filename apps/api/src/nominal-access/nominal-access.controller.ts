import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiProduces,
  ApiTags
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/client';
import {
  IssueNominalAccessRequestDto,
  NominalAccessCredentialResponseDto,
  RevokeNominalAccessRequestDto,
  parseIssueNominalAccess,
  parseNominalAccessId,
  parseNominalAccessKey,
  parseRevokeNominalAccess
} from './nominal-access.dto';
import { NominalAccessService } from './nominal-access.service';

@ApiTags('nominal-access')
@ApiCookieAuth()
@Roles(UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId/nominal-access-credentials')
export class NominalAccessController {
  constructor(@Inject(NominalAccessService) private readonly access: NominalAccessService) {}

  @Post('assistants/:assistantId/issue')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: IssueNominalAccessRequestDto })
  @ApiCreatedResponse({ type: NominalAccessCredentialResponseDto })
  issue(
    @Param('eventId') eventId: string,
    @Param('assistantId') assistantId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<NominalAccessCredentialResponseDto> {
    parseIssueNominalAccess(body);
    return this.access.issue(
      parseNominalAccessId(eventId),
      parseNominalAccessId(assistantId),
      parseNominalAccessKey(key),
      principal,
      request.operationId
    );
  }

  @Get()
  @ApiOkResponse({ type: NominalAccessCredentialResponseDto, isArray: true })
  list(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<NominalAccessCredentialResponseDto[]> {
    return this.access.list(parseNominalAccessId(eventId), principal);
  }

  @Get(':credentialId/svg')
  @ApiProduces('image/svg+xml')
  @ApiOkResponse({
    description: 'Authenticated nominal credential SVG; never persisted.',
    content: { 'image/svg+xml': { schema: { type: 'string', format: 'binary' } } },
    headers: {
      'Content-Type': { schema: { type: 'string', example: 'image/svg+xml; charset=utf-8' } },
      ETag: { schema: { type: 'string' } },
      'Cache-Control': { schema: { type: 'string', example: 'private, no-store' } },
      'X-Content-Type-Options': { schema: { type: 'string', example: 'nosniff' } },
      'Referrer-Policy': { schema: { type: 'string', example: 'no-referrer' } },
      'Content-Security-Policy': { schema: { type: 'string', example: "default-src 'none'" } }
    }
  })
  async svg(
    @Param('eventId') eventId: string,
    @Param('credentialId') credentialId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.access.getSvg(
      parseNominalAccessId(eventId),
      parseNominalAccessId(credentialId),
      principal
    );
    response.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    response.setHeader('Content-Length', String(content.bytes.length));
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('ETag', content.etag);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.end(content.bytes);
  }

  @Post(':credentialId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: RevokeNominalAccessRequestDto })
  @ApiOkResponse({ type: NominalAccessCredentialResponseDto })
  revoke(
    @Param('eventId') eventId: string,
    @Param('credentialId') credentialId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<NominalAccessCredentialResponseDto> {
    return this.access.revoke(
      parseNominalAccessId(eventId),
      parseNominalAccessId(credentialId),
      parseNominalAccessKey(key),
      parseRevokeNominalAccess(body),
      principal,
      request.operationId
    );
  }
}
