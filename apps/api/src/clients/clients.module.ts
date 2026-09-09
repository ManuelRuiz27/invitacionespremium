import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminClientsController } from './admin-clients.controller';
import { ClientAccessPolicy } from './client-access.policy';
import { ClientOperatingProfilePolicy } from './client-operating-profile.policy';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [AuditModule],
  controllers: [ClientsController, AdminClientsController],
  providers: [ClientsService, ClientAccessPolicy, ClientOperatingProfilePolicy],
  exports: [ClientsService, ClientAccessPolicy, ClientOperatingProfilePolicy]
})
export class ClientsModule {}
