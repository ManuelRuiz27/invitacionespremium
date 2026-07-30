import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { FileAssetsModule } from '../file-assets/file-assets.module';
import { AdminReportsController } from './admin-reports.controller';
import { ReportUploadLockService } from './report-upload-lock.service';
import { ReportsController } from './reports.controller';
import { ReportsDatasetService } from './reports-dataset.service';
import { ReportsPdfService } from './reports-pdf.service';
import { ReportsRetentionScheduler } from './reports-retention.scheduler';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuditModule, EventsModule, FileAssetsModule],
  controllers: [ReportsController, AdminReportsController],
  providers: [
    ReportsService,
    ReportsDatasetService,
    ReportsPdfService,
    ReportsRetentionScheduler,
    ReportUploadLockService
  ],
  exports: [ReportsService]
})
export class ReportsModule {}
