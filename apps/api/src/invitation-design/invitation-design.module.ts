import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { FileAssetsModule } from '../file-assets/file-assets.module';
import { InvitationDesignController } from './invitation-design.controller';
import { InvitationDesignService } from './invitation-design.service';

@Module({
  imports: [AuditModule, EventsModule, FileAssetsModule],
  controllers: [InvitationDesignController],
  providers: [InvitationDesignService],
  exports: [InvitationDesignService]
})
export class InvitationDesignModule {}
