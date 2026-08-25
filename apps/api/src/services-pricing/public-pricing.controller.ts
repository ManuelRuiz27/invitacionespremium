import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicRoute } from '../auth/public-route.decorator';
import { PublicPricingResponseDto } from './services-pricing.dto';
import { ServicesPricingService } from './services-pricing.service';

@ApiTags('public-pricing')
@PublicRoute()
@Controller('public/pricing')
export class PublicPricingController {
  constructor(@Inject(ServicesPricingService) private readonly pricing: ServicesPricingService) {}

  @Get()
  @ApiOkResponse({ type: PublicPricingResponseDto, isArray: true })
  list(): Promise<PublicPricingResponseDto[]> {
    return this.pricing.listPublicPricing();
  }
}
