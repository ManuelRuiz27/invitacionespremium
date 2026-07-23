import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ClientsModule } from '../clients/clients.module';
import { AdminClientUsersController } from './admin-client-users.controller';
import { ClientUsersController } from './client-users.controller';
import { ClientUsersService } from './client-users.service';

@Module({
  imports: [AuditModule, ClientsModule],
  controllers: [ClientUsersController, AdminClientUsersController],
  providers: [ClientUsersService]
})
export class ClientUsersModule {}
