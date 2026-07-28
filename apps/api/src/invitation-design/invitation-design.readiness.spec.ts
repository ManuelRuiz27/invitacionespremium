import { describe, expect, it } from 'vitest';
import {
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  InvitationDesignType,
  ServiceCode
} from '../generated/prisma/client';
import { DESIGN_READINESS_BLOCKERS, resolveDesignReadiness } from './invitation-design.readiness';

describe('Invitation design readiness', () => {
  it('rejects unsupported services and missing designs', async () => {
    const database = dbWith(null);
    expect(await resolveDesignReadiness(database, crypto.randomUUID(), ServiceCode.PHYSICAL_QR)).toEqual({
      complete: false,
      designType: null,
      blockers: [DESIGN_READINESS_BLOCKERS.UNSUPPORTED_SERVICE]
    });
    expect(await resolveDesignReadiness(database, crypto.randomUUID(), ServiceCode.FLYER)).toEqual({
      complete: false,
      designType: null,
      blockers: [DESIGN_READINESS_BLOCKERS.MISSING]
    });
  });

  it('marks a Flyer complete only with both READY owned assets and a hotspot', async () => {
    const designId = crypto.randomUUID();
    const ready = {
      id: crypto.randomUUID(),
      ownerId: designId,
      ownerType: FileAssetOwnerType.FLYER,
      fileType: FileAssetType.FLYER_INITIAL_IMAGE,
      status: FileAssetStatus.READY,
      deletedAt: null
    };
    const database = dbWith({
      id: designId,
      type: InvitationDesignType.FLYER,
      flyerInitialAsset: ready,
      flyerQrAsset: { ...ready, id: crypto.randomUUID(), fileType: FileAssetType.FLYER_QR_IMAGE },
      pages: [],
      hotspots: [{ id: crypto.randomUUID() }]
    });
    expect(await resolveDesignReadiness(database, crypto.randomUUID(), ServiceCode.FLYER)).toEqual({
      complete: true,
      designType: InvitationDesignType.FLYER,
      blockers: []
    });
  });

  it('checks the Flipbook page limit, continuous order, assets and minimum hotspot', async () => {
    const pageId = crypto.randomUUID();
    const database = dbWith({
      id: crypto.randomUUID(),
      type: InvitationDesignType.FLIPBOOK,
      flyerInitialAsset: null,
      flyerQrAsset: null,
      pages: [
        {
          id: pageId,
          position: 2,
          fileAsset: {
            ownerId: pageId,
            status: FileAssetStatus.HIDDEN,
            deletedAt: null
          }
        }
      ],
      hotspots: []
    });
    const result = await resolveDesignReadiness(database, crypto.randomUUID(), ServiceCode.FLIPBOOK);
    expect(result.complete).toBe(false);
    expect(result.blockers).toEqual([
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_ORDER,
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_ASSET,
      DESIGN_READINESS_BLOCKERS.HOTSPOTS
    ]);
  });
});

function dbWith(design: unknown) {
  return {
    invitationDesign: {
      findFirst: async () => design
    }
  } as Parameters<typeof resolveDesignReadiness>[0];
}
