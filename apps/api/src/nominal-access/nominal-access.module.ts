import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { PublicRsvpModule } from '../public-rsvp/public-rsvp.module';
import { NominalAccessController } from './nominal-access.controller';
import { NominalAccessService } from './nominal-access.service';
import { NominalAccessTokenService } from './nominal-access-token.service';
import { NominalAccessQrService } from './nominal-access-qr.service';

@Module({
  imports: [AuditModule, EventsModule, PublicRsvpModule],
  controllers: [NominalAccessController],
  providers: [NominalAccessService, NominalAccessTokenService, NominalAccessQrService],
  exports: [NominalAccessService, NominalAccessTokenService]
})
export class NominalAccessModule {}
