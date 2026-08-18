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

export const ADMIN_INVITATION_IMAGE_FILE_TYPES = new Set<FileAssetType>([
  FileAssetType.FLYER_INITIAL_IMAGE,
  FileAssetType.FLYER_QR_IMAGE,
  FileAssetType.FLIPBOOK_PAGE_IMAGE
]);

export function assertCompatibleFileAssetType(ownerType: FileAssetOwnerType, fileType: FileAssetType): void {
  if (!FILE_ASSET_COMPATIBILITY[ownerType].includes(fileType)) {
    throw new ConflictException({
      code: 'FILE_TYPE_OWNER_MISMATCH',
      message: 'File type is not compatible with the requested owner type.'
    });
  }
}

export function administrativeInvitationOwnerType(fileType: FileAssetType): FileAssetOwnerType {
  if (!ADMIN_INVITATION_IMAGE_FILE_TYPES.has(fileType)) {
    throw new ConflictException({
      code: 'FILE_UNSUPPORTED_TYPE',
      message: 'File type is not available through the administrative Invitation surface.'
    });
  }
  const match = (Object.entries(FILE_ASSET_COMPATIBILITY) as Array<[FileAssetOwnerType, readonly FileAssetType[]]>).find(
    ([, compatible]) => compatible.includes(fileType)
  );
  if (!match || (match[0] !== FileAssetOwnerType.FLYER && match[0] !== FileAssetOwnerType.FLIPBOOK_PAGE)) {
    throw new ConflictException({
      code: 'FILE_TYPE_OWNER_MISMATCH',
      message: 'File type is not compatible with an Invitation design owner.'
    });
  }
  return match[0];
}
