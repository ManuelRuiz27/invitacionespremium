import { describe, expect, it } from 'vitest';
import { FileAssetOwnerType, FileAssetType } from '../generated/prisma/client';
import {
  assertCompatibleFileAssetType,
  FILE_ASSET_COMPATIBILITY,
  USER_IMAGE_FILE_TYPES
} from './file-asset-compatibility';

describe('FileAsset compatibility', () => {
  it('contains only the exact documented owner/file pairs', () => {
    expect(FILE_ASSET_COMPATIBILITY).toEqual({
      FLYER: ['FLYER_INITIAL_IMAGE', 'FLYER_QR_IMAGE'],
      FLIPBOOK_PAGE: ['FLIPBOOK_PAGE_IMAGE'],
      FLOORPLAN: ['FLOORPLAN_IMAGE'],
      ALBUM_PHOTO: ['ALBUM_PHOTO_IMAGE'],
      GENERATED_REPORT: ['GENERATED_REPORT_PDF'],
      INVITATION: ['INVITATION_QR_SVG'],
      PHYSICAL_PASS: ['PHYSICAL_PASS_QR_SVG']
    });
    expect(USER_IMAGE_FILE_TYPES).not.toContain(FileAssetType.GENERATED_REPORT_PDF);
    expect(USER_IMAGE_FILE_TYPES).not.toContain(FileAssetType.INVITATION_QR_SVG);
    expect(USER_IMAGE_FILE_TYPES).not.toContain(FileAssetType.PHYSICAL_PASS_QR_SVG);
  });

  it('rejects an incompatible owner/file pair with the stable error', () => {
    expect(() => assertCompatibleFileAssetType(FileAssetOwnerType.FLYER, FileAssetType.FLOORPLAN_IMAGE)).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'FILE_TYPE_OWNER_MISMATCH' }) })
    );
  });
});
