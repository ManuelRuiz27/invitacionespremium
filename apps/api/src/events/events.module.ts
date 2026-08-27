import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { ServicesPricingModule } from '../services-pricing/services-pricing.module';
import { StaffAccessModule } from '../staff-access/staff-access.module';
import { AdminClientEventsController } from './admin-client-events.controller';
import { AdminEventCommercialController } from './admin-event-commercial.controller';
import { AdminEventsController } from './admin-events.controller';
import { EventAccessPolicy } from './event-access.policy';
import { EventCommercialService } from './event-commercial.service';
import { EventLifecycleScheduler } from './event-lifecycle.scheduler';
import { EventLifecycleService } from './event-lifecycle.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuditModule, FinanceModule, ServicesPricingModule, StaffAccessModule],
  controllers: [EventsController, AdminEventsController, AdminClientEventsController, AdminEventCommercialController],
  providers: [EventsService, EventAccessPolicy, EventCommercialService, EventLifecycleService, EventLifecycleScheduler],
  exports: [EventsService, EventLifecycleService, EventAccessPolicy, EventCommercialService]
})
export class EventsModule {}
