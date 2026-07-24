import { Controller, Get, Inject } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { AuthPrincipal } from '../auth/auth.types';
import { CurrentAuth } from '../auth/current-auth.decorator';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../generated/prisma/client';
import { AvailableServiceResponseDto } from './services-pricing.dto';
import { ServicesPricingService } from './services-pricing.service';

@ApiTags('services')
@ApiCookieAuth()
@Roles(UserRole.INDEPENDENT_PLANNER, UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER)
@Controller('services')
export class ServicesPricingController {
  constructor(@Inject(ServicesPricingService) private readonly servicesPricing: ServicesPricingService) {}

  @Get()
  @ApiOkResponse({ type: AvailableServiceResponseDto, isArray: true })
  list(@CurrentAuth() principal: AuthPrincipal): Promise<AvailableServiceResponseDto[]> {
    return this.servicesPricing.listAvailable(principal);
  }
}
