import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContactsService } from './contacts.service';

@Injectable()
export class ContactsScheduler {
  private readonly logger = new Logger(ContactsScheduler.name);

  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'contacts-anonymize-expired' })
  async anonymizeExpiredContacts(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      const count = await this.contacts.anonymizeExpiredContacts();
      if (count > 0) {
        this.logger.log({ event: 'contacts_anonymized', count });
      }
    } catch (error) {
      this.logger.error({
        event: 'contacts_anonymization_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  }
}
