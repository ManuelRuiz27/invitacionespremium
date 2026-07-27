import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminEventsController } from './admin-events.controller';
import { EventAccessPolicy } from './event-access.policy';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuditModule],
  controllers: [EventsController, AdminEventsController],
  providers: [EventsService, EventAccessPolicy],
  exports: [EventsService]
})
export class EventsModule {}
