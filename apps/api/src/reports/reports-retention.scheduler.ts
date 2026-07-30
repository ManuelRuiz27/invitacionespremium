import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportsRetentionScheduler {
  private readonly logger = new Logger(ReportsRetentionScheduler.name);

  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'reports-retention' })
  async expire(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const result = await this.reports.expirePrivacy();
      if (result.detailed + result.retained > 0) {
        this.logger.log({ event: 'reports_retention_applied', ...result });
      }
    } catch (error) {
      this.logger.error({
        event: 'reports_retention_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  }
}
