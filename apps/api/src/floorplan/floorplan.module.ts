import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { FileAssetsModule } from '../file-assets/file-assets.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { StaffAccessModule } from '../staff-access/staff-access.module';
import { FloorplanAccessService } from './floorplan-access.service';
import { AdminFloorplanController } from './admin-floorplan.controller';
import { FloorplanController, ScannerFloorplanController } from './floorplan.controller';
import { FloorplanService } from './floorplan.service';

@Module({
  imports: [AuditModule, EventsModule, FileAssetsModule, RealtimeModule, StaffAccessModule],
  controllers: [AdminFloorplanController, FloorplanController, ScannerFloorplanController],
  providers: [FloorplanAccessService, FloorplanService],
  exports: [FloorplanService]
})
export class FloorplanModule {}
