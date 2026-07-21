import {
  type MiddlewareConsumer,
  Module,
  type NestModule
} from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './common/database/database.module';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { AppConfigModule } from './config/app-config.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  imports: [AppConfigModule, DatabaseModule, ScheduleModule.forRoot()],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
