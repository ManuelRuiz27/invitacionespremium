import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminPilotObservationsController } from './admin-pilot-observations.controller';
import { PilotObservationsService } from './pilot-observations.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminPilotObservationsController],
  providers: [PilotObservationsService],
  exports: [PilotObservationsService]
})
export class PilotObservationsModule {}
