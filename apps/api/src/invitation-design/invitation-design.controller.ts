import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  DesignReadinessResponseDto,
  HotspotResponseDto,
  InvitationDesignResponseDto,
  parseDesignUuid
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
}
