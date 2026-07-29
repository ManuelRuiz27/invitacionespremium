import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { FileAssetsModule } from '../file-assets/file-assets.module';
import { AlbumExpirationScheduler } from './album-expiration.scheduler';
import { AlbumTokenService } from './album-token.service';
import { AlbumsController } from './albums.controller';
import { AlbumsService } from './albums.service';
import { PublicAlbumsController } from './public-albums.controller';

@Module({
  imports: [AuditModule, EventsModule, FileAssetsModule],
  controllers: [AlbumsController, PublicAlbumsController],
  providers: [AlbumsService, AlbumTokenService, AlbumExpirationScheduler],
  exports: [AlbumsService, AlbumTokenService]
})
export class AlbumsModule {}
