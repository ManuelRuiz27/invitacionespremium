import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientUsersModule } from './client-users/client-users.module';
import { ClientsModule } from './clients/clients.module';
import { DatabaseModule } from './common/database/database.module';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { AppConfigModule } from './config/app-config.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuditModule,
    AuthModule,
    ClientsModule,
    ClientUsersModule,
    ScheduleModule.forRoot()
  ],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
