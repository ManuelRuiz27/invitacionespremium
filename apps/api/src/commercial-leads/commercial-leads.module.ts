import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AdminCommercialLeadsController } from './admin-commercial-leads.controller';
import { CommercialLeadsController } from './commercial-leads.controller';
import { CommercialLeadsService } from './commercial-leads.service';

@Module({
  imports: [AuditModule, ContactsModule],
  controllers: [CommercialLeadsController, AdminCommercialLeadsController],
  providers: [CommercialLeadsService]
})
export class CommercialLeadsModule {}
