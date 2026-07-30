import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuditModule } from '../audit/audit.module';
import { AppConfigService } from '../config/app-config.service';
import { EventsModule } from '../events/events.module';
import {
  AlbumPhotoFileAssetOwnerResolver,
  FileAssetOwnerRegistry,
  FlipbookPageFileAssetOwnerResolver,
  FloorplanFileAssetOwnerResolver,
  FlyerFileAssetOwnerResolver,
  GeneratedReportFileAssetOwnerResolver,
  InvitationFileAssetOwnerResolver
} from './file-asset-owner.registry';
import { FileImageValidator } from './file-image-validator';
import { FileStorage } from './file-storage';
import { FileAssetsController } from './file-assets.controller';
import { FileAssetsScheduler } from './file-assets.scheduler';
import { FileAssetsService } from './file-assets.service';
import { LocalFileStorage } from './local-file-storage';

@Module({
  imports: [
    AuditModule,
    EventsModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        limits: { fileSize: config.fileUploadMaxBytes, files: 1 }
      })
    })
  ],
  controllers: [FileAssetsController],
  providers: [
    FileAssetsService,
    FileAssetsScheduler,
    FileImageValidator,
    LocalFileStorage,
    { provide: FileStorage, useExisting: LocalFileStorage },
    InvitationFileAssetOwnerResolver,
    FlyerFileAssetOwnerResolver,
    FlipbookPageFileAssetOwnerResolver,
    FloorplanFileAssetOwnerResolver,
    AlbumPhotoFileAssetOwnerResolver,
    GeneratedReportFileAssetOwnerResolver,
    FileAssetOwnerRegistry
  ],
  exports: [FileAssetsService, FileAssetOwnerRegistry, FileStorage]
})
export class FileAssetsModule {}
