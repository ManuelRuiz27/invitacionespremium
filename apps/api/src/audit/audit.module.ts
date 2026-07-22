import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditedMutationService } from './audited-mutation.service';

@Module({
  providers: [AuditService, AuditedMutationService],
  exports: [AuditService, AuditedMutationService]
})
export class AuditModule {}
