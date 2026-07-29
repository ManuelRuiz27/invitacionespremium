import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { PublicRsvpModule } from '../public-rsvp/public-rsvp.module';
import { StaffAccessModule } from '../staff-access/staff-access.module';
import { CheckInsController, ScannerController } from './scanner.controller';
import { ScannerService } from './scanner.service';

@Module({
  imports: [AuditModule, EventsModule, PublicRsvpModule, StaffAccessModule],
  controllers: [ScannerController, CheckInsController],
  providers: [ScannerService],
  exports: [ScannerService]
})
export class ScannerModule {}
