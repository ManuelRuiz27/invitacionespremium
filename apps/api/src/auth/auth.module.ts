import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';
import { TrustedOriginGuard } from './trusted-origin.guard';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: TrustedOriginGuard
    },
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard
    }
  ],
  exports: [AuthService]
})
export class AuthModule {}
