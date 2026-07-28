import { ConflictException } from '@nestjs/common';
import { FileAssetOwnerType, FileAssetType } from '../generated/prisma/client';

export const FILE_ASSET_COMPATIBILITY: Readonly<Record<FileAssetOwnerType, readonly FileAssetType[]>> = {
  [FileAssetOwnerType.FLYER]: [FileAssetType.FLYER_INITIAL_IMAGE, FileAssetType.FLYER_QR_IMAGE],
  [FileAssetOwnerType.FLIPBOOK_PAGE]: [FileAssetType.FLIPBOOK_PAGE_IMAGE],
  [FileAssetOwnerType.FLOORPLAN]: [FileAssetType.FLOORPLAN_IMAGE],
  [FileAssetOwnerType.ALBUM_PHOTO]: [FileAssetType.ALBUM_PHOTO_IMAGE],
  [FileAssetOwnerType.GENERATED_REPORT]: [FileAssetType.GENERATED_REPORT_PDF],
  [FileAssetOwnerType.INVITATION]: [FileAssetType.INVITATION_QR_SVG],
  [FileAssetOwnerType.PHYSICAL_PASS]: [FileAssetType.PHYSICAL_PASS_QR_SVG]
};

export const USER_IMAGE_FILE_TYPES = new Set<FileAssetType>([
  FileAssetType.FLYER_INITIAL_IMAGE,
  FileAssetType.FLYER_QR_IMAGE,
  FileAssetType.FLIPBOOK_PAGE_IMAGE,
  FileAssetType.FLOORPLAN_IMAGE,
  FileAssetType.ALBUM_PHOTO_IMAGE
]);

export function assertCompatibleFileAssetType(ownerType: FileAssetOwnerType, fileType: FileAssetType): void {
  if (!FILE_ASSET_COMPATIBILITY[ownerType].includes(fileType)) {
    throw new ConflictException({
      code: 'FILE_TYPE_OWNER_MISMATCH',
      message: 'File type is not compatible with the requested owner type.'
    });
  }
}
