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
  AddFlipbookPageRequestDto,
  CreateFlyerRequestDto,
  CreateHotspotRequestDto,
  DesignReadinessResponseDto,
  HotspotResponseDto,
  InvitationDesignResponseDto,
  ReorderFlipbookPagesRequestDto,
  ReplaceDesignAssetRequestDto,
  UpdateHotspotRequestDto,
  parseAddPage,
  parseCreateFlyer,
  parseCreateHotspot,
  parseDesignUuid,
  parseReorderPages,
  parseReplaceAsset,
  parseUpdateHotspot
} from './invitation-design.dto';
import { InvitationDesignService, type InvitationDesignTarget } from './invitation-design.service';

@ApiTags('admin-invitation-design')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/clients/:clientId/events/:eventId')
export class AdminInvitationDesignController {
  constructor(@Inject(InvitationDesignService) private readonly designs: InvitationDesignService) {}

  @Get('design')
  @ApiOkResponse({ type: InvitationDesignResponseDto })
  get(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.get(parseDesignUuid(eventId), principal, target(parseDesignUuid(clientId)));
  }

  @Get('design/readiness')
  @ApiOkResponse({ type: DesignReadinessResponseDto })
  readiness(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<DesignReadinessResponseDto> {
    return this.designs.readiness(parseDesignUuid(eventId), principal, target(parseDesignUuid(clientId)));
  }

  @Post('design/flyer')
  @ApiBody({ type: CreateFlyerRequestDto })
  @ApiCreatedResponse({ type: InvitationDesignResponseDto })
  createFlyer(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.createFlyer(
      parseDesignUuid(eventId),
      parseCreateFlyer(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Post('design/flipbook')
  @ApiCreatedResponse({ type: InvitationDesignResponseDto })
  createFlipbook(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.createFlipbook(
      parseDesignUuid(eventId),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Patch('design/flyer/initial-image')
  @ApiBody({ type: ReplaceDesignAssetRequestDto })
  @ApiOkResponse({ type: InvitationDesignResponseDto })
  replaceFlyerInitial(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.replaceFlyerAsset(
      parseDesignUuid(eventId),
      'initial',
      parseReplaceAsset(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Patch('design/flyer/qr-image')
  @ApiBody({ type: ReplaceDesignAssetRequestDto })
  @ApiOkResponse({ type: InvitationDesignResponseDto })
  replaceFlyerQr(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.replaceFlyerAsset(
      parseDesignUuid(eventId),
      'qr',
      parseReplaceAsset(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Post('design/flipbook/pages')
  @ApiBody({ type: AddFlipbookPageRequestDto })
  @ApiCreatedResponse({ type: InvitationDesignResponseDto })
  addPage(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.addPage(
      parseDesignUuid(eventId),
      parseAddPage(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Patch('design/flipbook/pages/reorder')
  @ApiBody({ type: ReorderFlipbookPagesRequestDto })
  @ApiOkResponse({ type: InvitationDesignResponseDto })
  reorderPages(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.reorderPages(
      parseDesignUuid(eventId),
      parseReorderPages(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Patch('design/flipbook/pages/:pageId/asset')
  @ApiBody({ type: ReplaceDesignAssetRequestDto })
  @ApiOkResponse({ type: InvitationDesignResponseDto })
  replacePageAsset(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('pageId') pageId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.replacePageAsset(
      parseDesignUuid(eventId),
      parseDesignUuid(pageId),
      parseReplaceAsset(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Delete('design/flipbook/pages/:pageId')
  @ApiOkResponse({ type: InvitationDesignResponseDto })
  deletePage(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('pageId') pageId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.deletePage(
      parseDesignUuid(eventId),
      parseDesignUuid(pageId),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Get('hotspots')
  @ApiOkResponse({ type: HotspotResponseDto, isArray: true })
  async listHotspots(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<HotspotResponseDto[]> {
    return (await this.designs.get(parseDesignUuid(eventId), principal, target(parseDesignUuid(clientId)))).hotspots;
  }

  @Post('hotspots')
  @ApiBody({ type: CreateHotspotRequestDto })
  @ApiCreatedResponse({ type: HotspotResponseDto })
  createHotspot(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<HotspotResponseDto> {
    return this.designs.createHotspot(
      parseDesignUuid(eventId),
      parseCreateHotspot(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Patch('hotspots/:hotspotId')
  @ApiBody({ type: UpdateHotspotRequestDto })
  @ApiOkResponse({ type: HotspotResponseDto })
  updateHotspot(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('hotspotId') hotspotId: string,
    @Body() body: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<HotspotResponseDto> {
    return this.designs.updateHotspot(
      parseDesignUuid(eventId),
      parseDesignUuid(hotspotId),
      parseUpdateHotspot(body),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }

  @Delete('hotspots/:hotspotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteHotspot(
    @Param('clientId') clientId: string,
    @Param('eventId') eventId: string,
    @Param('hotspotId') hotspotId: string,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ): Promise<void> {
    await this.designs.deleteHotspot(
      parseDesignUuid(eventId),
      parseDesignUuid(hotspotId),
      principal,
      request.operationId,
      target(parseDesignUuid(clientId))
    );
  }
}

function target(clientId: string): InvitationDesignTarget {
  return { kind: 'ADMIN', clientId };
}
