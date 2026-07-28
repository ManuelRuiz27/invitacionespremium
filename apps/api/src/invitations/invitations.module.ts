import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { InvitationProvisioningService } from './invitation-provisioning.service';
import { InvitationTokenService } from './invitation-token.service';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [InvitationsController],
  providers: [InvitationTokenService, InvitationProvisioningService, InvitationsService],
  exports: [InvitationProvisioningService, InvitationTokenService]
})
export class InvitationsModule {}
