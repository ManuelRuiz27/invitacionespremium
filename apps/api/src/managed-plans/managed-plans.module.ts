import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ManagedPlansController } from './managed-plans.controller';
import { ManagedPlansService } from './managed-plans.service';
import { ManagedPlanMutationsService } from './managed-plan-mutations.service';
import { ManagedContractsController } from './managed-contracts.controller';
import { ManagedContractsService } from './managed-contracts.service';
import { ManagedCollectionsController } from './managed-collections.controller';
import { ManagedCollectionsService } from './managed-collections.service';

@Module({
  imports: [AuditModule],
  controllers: [ManagedPlansController, ManagedContractsController, ManagedCollectionsController],
  providers: [ManagedPlansService, ManagedPlanMutationsService, ManagedContractsService, ManagedCollectionsService]
})
export class ManagedPlansModule {}
