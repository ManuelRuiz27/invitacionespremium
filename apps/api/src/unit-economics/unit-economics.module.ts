import { Module } from '@nestjs/common';
import { PilotObservationsModule } from '../pilot-observations/pilot-observations.module';
import { AdminUnitEconomicsController } from './admin-unit-economics.controller';
import { UnitEconomicsService } from './unit-economics.service';

@Module({
  imports: [PilotObservationsModule],
  controllers: [AdminUnitEconomicsController],
  providers: [UnitEconomicsService]
})
export class UnitEconomicsModule {}
