import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientUsersModule } from './client-users/client-users.module';
import { ClientsModule } from './clients/clients.module';
import { DatabaseModule } from './common/database/database.module';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { AppConfigModule } from './config/app-config.module';
import { ContactsModule } from './contacts/contacts.module';
import { FinanceModule } from './finance/finance.module';
import { FloorplanModule } from './floorplan/floorplan.module';
import { EventsModule } from './events/events.module';
import { FileAssetsModule } from './file-assets/file-assets.module';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { InvitationsModule } from './invitations/invitations.module';
import { InvitationDesignModule } from './invitation-design/invitation-design.module';
import { ServicesPricingModule } from './services-pricing/services-pricing.module';
import { PublicRsvpModule } from './public-rsvp/public-rsvp.module';
import { StaffAccessModule } from './staff-access/staff-access.module';
import { ScannerModule } from './scanner/scanner.module';
import { RealtimeModule } from './realtime/realtime.module';
import { PhysicalPassesModule } from './physical-passes/physical-passes.module';
import { AlbumsModule } from './albums/albums.module';
import { ReportsModule } from './reports/reports.module';
import { PilotObservationsModule } from './pilot-observations/pilot-observations.module';
import { CommercialLeadsModule } from './commercial-leads/commercial-leads.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuditModule,
    AuthModule,
    RealtimeModule,
    ClientsModule,
    ClientUsersModule,
    ServicesPricingModule,
    FinanceModule,
    EventsModule,
    FileAssetsModule,
    InvitationDesignModule,
    InvitationsModule,
    PublicRsvpModule,
    StaffAccessModule,
    ScannerModule,
    FloorplanModule,
    PhysicalPassesModule,
    AlbumsModule,
    ReportsModule,
    PilotObservationsModule,
    CommercialLeadsModule,
    ContactsModule,
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
