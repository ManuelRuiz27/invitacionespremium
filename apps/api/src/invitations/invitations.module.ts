import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { InvitationProvisioningService } from './invitation-provisioning.service';
import { InvitationTokenService } from './invitation-token.service';
import { InvitationsController, PublicInvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [InvitationsController, PublicInvitationsController],
  providers: [InvitationTokenService, InvitationProvisioningService, InvitationsService],
  exports: [InvitationProvisioningService]
})
export class InvitationsModule {}
