import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { FileAssetsModule } from '../file-assets/file-assets.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { InvitationQrRenderer, InvitationQrService } from './invitation-qr.service';
import { EventConfirmationController, PublicRsvpController } from './public-rsvp.controller';
import { PublicRsvpService } from './public-rsvp.service';
import { AlbumsModule } from '../albums/albums.module';

@Module({
  imports: [AuditModule, EventsModule, FileAssetsModule, InvitationsModule, AlbumsModule],
  controllers: [PublicRsvpController, EventConfirmationController],
  providers: [PublicRsvpService, InvitationQrService, InvitationQrRenderer],
  exports: [InvitationQrService]
})
export class PublicRsvpModule {}
