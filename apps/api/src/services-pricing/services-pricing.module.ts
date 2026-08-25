import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminServicesPricingController } from './admin-services-pricing.controller';
import { PublicPricingController } from './public-pricing.controller';
import { ServicesPricingController } from './services-pricing.controller';
import { ServicesPricingService } from './services-pricing.service';

@Module({
  imports: [AuditModule],
  controllers: [ServicesPricingController, AdminServicesPricingController, PublicPricingController],
  providers: [ServicesPricingService],
  exports: [ServicesPricingService]
})
export class ServicesPricingModule {}
