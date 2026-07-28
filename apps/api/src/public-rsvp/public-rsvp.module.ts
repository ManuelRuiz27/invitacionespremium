import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { FileAssetsModule } from '../file-assets/file-assets.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { EventConfirmationController, PublicRsvpController } from './public-rsvp.controller';
import { PublicRsvpService } from './public-rsvp.service';

@Module({
  imports: [AuditModule, EventsModule, FileAssetsModule, InvitationsModule],
  controllers: [PublicRsvpController, EventConfirmationController],
  providers: [PublicRsvpService]
})
export class PublicRsvpModule {}
