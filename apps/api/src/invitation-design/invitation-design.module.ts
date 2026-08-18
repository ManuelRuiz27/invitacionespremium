import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { FileAssetsModule } from '../file-assets/file-assets.module';
import { AdminInvitationDesignController } from './admin-invitation-design.controller';
import { InvitationDesignController } from './invitation-design.controller';
import { InvitationDesignService } from './invitation-design.service';

@Module({
  imports: [AuditModule, EventsModule, FileAssetsModule],
  controllers: [AdminInvitationDesignController, InvitationDesignController],
  providers: [InvitationDesignService],
  exports: [InvitationDesignService]
})
export class InvitationDesignModule {}
