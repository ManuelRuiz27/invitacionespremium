import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { ContactsController } from './contacts.controller';
import { ContactsScheduler } from './contacts.scheduler';
import { ContactsService } from './contacts.service';
import { PhoneNormalizer } from './phone-normalizer';

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsScheduler, PhoneNormalizer],
  exports: [ContactsService]
})
export class ContactsModule {}
