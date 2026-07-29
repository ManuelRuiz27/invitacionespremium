import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlbumsService } from './albums.service';

@Injectable()
export class AlbumExpirationScheduler {
  private readonly logger = new Logger(AlbumExpirationScheduler.name);

  constructor(@Inject(AlbumsService) private readonly albums: AlbumsService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'albums-expire' })
  async expire(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const count = await this.albums.expirePublishedAlbums();
      if (count > 0) this.logger.log({ event: 'albums_expired', count });
    } catch (error) {
      this.logger.error({
        event: 'album_expiration_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  }
}
