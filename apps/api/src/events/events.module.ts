import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { ServicesPricingModule } from '../services-pricing/services-pricing.module';
import { AdminEventsController } from './admin-events.controller';
import { EventAccessPolicy } from './event-access.policy';
import { EventLifecycleScheduler } from './event-lifecycle.scheduler';
import { EventLifecycleService } from './event-lifecycle.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuditModule, FinanceModule, ServicesPricingModule],
  controllers: [EventsController, AdminEventsController],
  providers: [EventsService, EventAccessPolicy, EventLifecycleService, EventLifecycleScheduler],
  exports: [EventsService, EventLifecycleService]
})
export class EventsModule {}
