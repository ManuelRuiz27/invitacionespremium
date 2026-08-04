import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditedMutationService } from './audited-mutation.service';
import { AdminAuditController } from './admin-audit.controller';

@Module({
  controllers: [AdminAuditController],
  providers: [AuditService, AuditedMutationService],
  exports: [AuditService, AuditedMutationService]
})
export class AuditModule {}
