import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ManagedPlansController } from './managed-plans.controller';
import { ManagedPlansService } from './managed-plans.service';
import { ManagedPlanMutationsService } from './managed-plan-mutations.service';
import { ManagedContractsController } from './managed-contracts.controller';
import { ManagedContractsService } from './managed-contracts.service';

@Module({
  imports: [AuditModule],
  controllers: [ManagedPlansController, ManagedContractsController],
  providers: [ManagedPlansService, ManagedPlanMutationsService, ManagedContractsService]
})
export class ManagedPlansModule {}
