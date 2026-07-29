import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ScannerSessionController, StaffTokensController } from './staff-access.controller';
import {
  StaffTokenExpirationService,
  StaffTokenManagementService,
  StaffTokenResolverService
} from './staff-access.service';
import { StaffTokenTechnicalService } from './staff-token-technical.service';

@Module({
  imports: [AuditModule],
  controllers: [StaffTokensController, ScannerSessionController],
  providers: [
    StaffTokenTechnicalService,
    StaffTokenManagementService,
    StaffTokenResolverService,
    StaffTokenExpirationService
  ],
  exports: [StaffTokenResolverService, StaffTokenExpirationService]
})
export class StaffAccessModule {}
