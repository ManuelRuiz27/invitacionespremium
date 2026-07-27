import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminFinanceController } from './admin-finance.controller';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [AuditModule],
  controllers: [FinanceController, AdminFinanceController],
  providers: [FinanceService],
  exports: [FinanceService]
})
export class FinanceModule {}
