import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  DesignReadinessResponseDto,
  AddFlipbookPageRequestDto,
  CreateFlyerRequestDto,
  CreateHotspotRequestDto,
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
import { InvitationDesignService } from './invitation-design.service';

@ApiTags('invitation-design')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('events/:eventId')
export class InvitationDesignController {
  constructor(@Inject(InvitationDesignService) private readonly designs: InvitationDesignService) {}

  @Get('design')
  @ApiOkResponse({ type: InvitationDesignResponseDto })
  get(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<InvitationDesignResponseDto> {
    return this.designs.get(parseDesignUuid(eventId), principal);
  }

  @Get('design/readiness')
  @ApiOkResponse({ type: DesignReadinessResponseDto })
  readiness(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<DesignReadinessResponseDto> {
    return this.designs.readiness(parseDesignUuid(eventId), principal);
  }

  @Get('hotspots')
  @ApiOkResponse({ type: HotspotResponseDto, isArray: true })
  async listHotspots(
    @Param('eventId') eventId: string,
    @CurrentAuth() principal: AuthPrincipal
  ): Promise<HotspotResponseDto[]> {
    return (await this.designs.get(parseDesignUuid(eventId), principal)).hotspots;
  }

  @Post('design/flyer')
  @ApiBody({ type: CreateFlyerRequestDto })
  @ApiCreatedResponse({ type: InvitationDesignResponseDto })
  createFlyer(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.createFlyer(parseDesignUuid(eventId), parseCreateFlyer(body), principal, request.operationId);
  }

  @Post('design/flipbook')
  @ApiCreatedResponse({ type: InvitationDesignResponseDto })
  createFlipbook(@Param('eventId') eventId: string, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.createFlipbook(parseDesignUuid(eventId), principal, request.operationId);
  }

  @Patch('design/flyer/initial-image')
  @ApiBody({ type: ReplaceDesignAssetRequestDto })
  replaceFlyerInitial(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.replaceFlyerAsset(parseDesignUuid(eventId), 'initial', parseReplaceAsset(body), principal, request.operationId);
  }

  @Patch('design/flyer/qr-image')
  @ApiBody({ type: ReplaceDesignAssetRequestDto })
  replaceFlyerQr(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.replaceFlyerAsset(parseDesignUuid(eventId), 'qr', parseReplaceAsset(body), principal, request.operationId);
  }

  @Post('design/flipbook/pages')
  @ApiBody({ type: AddFlipbookPageRequestDto })
  @ApiCreatedResponse({ type: InvitationDesignResponseDto })
  addPage(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.addPage(parseDesignUuid(eventId), parseAddPage(body), principal, request.operationId);
  }

  @Patch('design/flipbook/pages/reorder')
  @ApiBody({ type: ReorderFlipbookPagesRequestDto })
  reorderPages(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.reorderPages(parseDesignUuid(eventId), parseReorderPages(body), principal, request.operationId);
  }

  @Patch('design/flipbook/pages/:pageId/asset')
  @ApiBody({ type: ReplaceDesignAssetRequestDto })
  replacePage(@Param('eventId') eventId: string, @Param('pageId') pageId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.replacePageAsset(parseDesignUuid(eventId), parseDesignUuid(pageId), parseReplaceAsset(body), principal, request.operationId);
  }

  @Delete('design/flipbook/pages/:pageId')
  deletePage(@Param('eventId') eventId: string, @Param('pageId') pageId: string, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.deletePage(parseDesignUuid(eventId), parseDesignUuid(pageId), principal, request.operationId);
  }

  @Post('hotspots')
  @ApiBody({ type: CreateHotspotRequestDto })
  @ApiCreatedResponse({ type: HotspotResponseDto })
  createHotspot(@Param('eventId') eventId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.createHotspot(parseDesignUuid(eventId), parseCreateHotspot(body), principal, request.operationId);
  }

  @Patch('hotspots/:hotspotId')
  @ApiBody({ type: UpdateHotspotRequestDto })
  updateHotspot(@Param('eventId') eventId: string, @Param('hotspotId') hotspotId: string, @Body() body: unknown, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest) {
    return this.designs.updateHotspot(parseDesignUuid(eventId), parseDesignUuid(hotspotId), parseUpdateHotspot(body), principal, request.operationId);
  }

  @Delete('hotspots/:hotspotId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async deleteHotspot(@Param('eventId') eventId: string, @Param('hotspotId') hotspotId: string, @CurrentAuth() principal: AuthPrincipal, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.designs.deleteHotspot(parseDesignUuid(eventId), parseDesignUuid(hotspotId), principal, request.operationId);
  }
}
