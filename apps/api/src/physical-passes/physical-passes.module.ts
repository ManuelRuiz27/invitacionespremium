import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { StaffAccessModule } from '../staff-access/staff-access.module';
import { PhysicalPassQrService } from './physical-pass-qr.service';
import { PhysicalPassTokenService } from './physical-pass-token.service';
import { PhysicalPassesController, ScannerPhysicalPassesController } from './physical-passes.controller';
import { PhysicalPassesService } from './physical-passes.service';

@Module({
  imports: [AuditModule, EventsModule, StaffAccessModule],
  controllers: [PhysicalPassesController, ScannerPhysicalPassesController],
  providers: [PhysicalPassesService, PhysicalPassTokenService, PhysicalPassQrService],
  exports: [PhysicalPassesService]
})
export class PhysicalPassesModule {}
