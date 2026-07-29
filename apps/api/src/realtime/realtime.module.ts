import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffAccessModule } from '../staff-access/staff-access.module';
import { RealtimeAuthService } from './realtime-auth.service';
import { RealtimePublisherService } from './realtime-publisher.service';
import { RealtimeServerService } from './realtime-server.service';

@Global()
@Module({
  imports: [AuthModule, StaffAccessModule],
  providers: [RealtimeAuthService, RealtimeServerService, RealtimePublisherService],
  exports: [RealtimePublisherService]
})
export class RealtimeModule {}
