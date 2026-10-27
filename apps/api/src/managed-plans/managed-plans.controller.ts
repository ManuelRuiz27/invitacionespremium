import { Body, Controller, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest, AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import {
  CreateManagedPlanVersionRequestDto,
  ManagedPlanResponseDto,
  ManagedPlanVersionResponseDto,
  SetManagedPlanAvailabilityRequestDto,
  parseCreateManagedPlanVersion,
  parseManagedPlanIdempotencyKey,
  parseManagedPlanUuid,
  parseSetManagedPlanAvailability
} from './managed-plans.dto';
import { ManagedPlansService } from './managed-plans.service';

@ApiTags('admin-managed-plans')
@ApiCookieAuth()
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin/managed-plans')
export class ManagedPlansController {
  constructor(@Inject(ManagedPlansService) private readonly plans: ManagedPlansService) {}

  @Get()
  @ApiOkResponse({ type: ManagedPlanResponseDto, isArray: true })
  list(@CurrentAuth() principal: AuthPrincipal) {
    return this.plans.list(principal);
  }

  @Post(':planId/versions')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: CreateManagedPlanVersionRequestDto })
  @ApiCreatedResponse({ type: ManagedPlanVersionResponseDto })
  createVersion(
    @Param('planId') planId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.plans.createVersion(
      parseManagedPlanUuid(planId),
      parseCreateManagedPlanVersion(body),
      parseManagedPlanIdempotencyKey(key),
      principal,
      request.operationId
    );
  }

  @Post(':planId/availability')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: SetManagedPlanAvailabilityRequestDto })
  @ApiCreatedResponse({ type: ManagedPlanResponseDto })
  setAvailability(
    @Param('planId') planId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: unknown,
    @CurrentAuth() principal: AuthPrincipal,
    @Req() request: AuthenticatedRequest
  ) {
    return this.plans.setAvailability(
      parseManagedPlanUuid(planId),
      parseSetManagedPlanAvailability(body),
      parseManagedPlanIdempotencyKey(key),
      principal,
      request.operationId
    );
  }
}
