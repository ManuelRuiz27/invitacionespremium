import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FileAssetsService } from './file-assets.service';

@Injectable()
export class FileAssetsScheduler {
  private readonly logger = new Logger(FileAssetsScheduler.name);

  constructor(@Inject(FileAssetsService) private readonly fileAssets: FileAssetsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'file-assets-cleanup-orphans' })
  async cleanupOrphans(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      const count = await this.fileAssets.cleanupOrphans();
      if (count > 0) {
        this.logger.log({ event: 'file_assets_orphans_cleaned', count });
      }
    } catch (error) {
      this.logger.error({
        event: 'file_assets_cleanup_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  }
}
