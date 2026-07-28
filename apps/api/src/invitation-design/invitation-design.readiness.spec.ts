import { describe, expect, it } from 'vitest';
import {
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  HotspotAction,
  HotspotVisualOwnerType,
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

  it('requires each approved Flyer action instead of accepting an arbitrary hotspot', async () => {
    const designId = crypto.randomUUID();
    const design = flyerDesign(designId, [HotspotAction.RSVP]);
    expect(await resolveDesignReadiness(dbWith(design), crypto.randomUUID(), ServiceCode.FLYER)).toEqual({
      complete: false,
      designType: InvitationDesignType.FLYER,
      blockers: [
        DESIGN_READINESS_BLOCKERS.FLYER_LOCATION,
        DESIGN_READINESS_BLOCKERS.FLYER_GIFT_REGISTRY,
        DESIGN_READINESS_BLOCKERS.FLYER_QR_AREA
      ]
    });

    design.hotspots.push(
      flyerHotspot(designId, HotspotAction.LOCATION),
      flyerHotspot(designId, HotspotAction.GIFT_REGISTRY),
      flyerHotspot(designId, HotspotAction.QR_AREA)
    );
    expect(await resolveDesignReadiness(dbWith(design), crypto.randomUUID(), ServiceCode.FLYER)).toEqual({
      complete: true,
      designType: InvitationDesignType.FLYER,
      blockers: []
    });
  });

  it('requires cover actions and a QR page for Flipbook', async () => {
    const designId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const cover = page(designId, eventId, 1);
    const qr = page(designId, eventId, 2);
    const design = flipbookDesign(
      designId,
      [cover, qr],
      [
        pageHotspot(designId, eventId, cover, HotspotAction.RSVP),
        pageHotspot(designId, eventId, cover, HotspotAction.LOCATION),
        pageHotspot(designId, eventId, cover, HotspotAction.GIFT_REGISTRY)
      ]
    );
    expect((await resolveDesignReadiness(dbWith(design), eventId, ServiceCode.FLIPBOOK)).blockers).toEqual([
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_QR_PAGE
    ]);

    design.hotspots.push(pageHotspot(designId, eventId, qr, HotspotAction.QR_AREA));
    expect(await resolveDesignReadiness(dbWith(design), eventId, ServiceCode.FLIPBOOK)).toEqual({
      complete: true,
      designType: InvitationDesignType.FLIPBOOK,
      blockers: []
    });
  });

  it('ignores deleted page owners and reports invalid placement after reorder', async () => {
    const designId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const formerCover = page(designId, eventId, 2);
    const newCover = page(designId, eventId, 1);
    const deletedQr = { ...page(designId, eventId, 3), deletedAt: new Date() };
    const design = flipbookDesign(
      designId,
      [newCover, formerCover],
      [
        pageHotspot(designId, eventId, formerCover, HotspotAction.RSVP),
        pageHotspot(designId, eventId, formerCover, HotspotAction.LOCATION),
        pageHotspot(designId, eventId, formerCover, HotspotAction.GIFT_REGISTRY),
        pageHotspot(designId, eventId, deletedQr, HotspotAction.QR_AREA)
      ]
    );
    const result = await resolveDesignReadiness(dbWith(design), eventId, ServiceCode.FLIPBOOK);
    expect(result.complete).toBe(false);
    expect(result.blockers).toEqual([
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_HOTSPOT_OWNER,
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_COVER_RSVP,
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_COVER_LOCATION,
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_COVER_GIFT_REGISTRY,
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_QR_PAGE,
      DESIGN_READINESS_BLOCKERS.FLIPBOOK_HOTSPOT_PLACEMENT
    ]);
  });
});

function flyerDesign(designId: string, actions: HotspotAction[]) {
  const ready = {
    id: crypto.randomUUID(),
    ownerId: designId,
    ownerType: FileAssetOwnerType.FLYER,
    fileType: FileAssetType.FLYER_INITIAL_IMAGE,
    status: FileAssetStatus.READY,
    deletedAt: null
  };
  return {
    id: designId,
    type: InvitationDesignType.FLYER,
    flyerInitialAsset: ready,
    flyerQrAsset: { ...ready, id: crypto.randomUUID(), fileType: FileAssetType.FLYER_QR_IMAGE },
    pages: [],
    hotspots: actions.map((action) => flyerHotspot(designId, action))
  };
}

function flipbookDesign(designId: string, pages: ReturnType<typeof page>[], hotspots: unknown[]) {
  return {
    id: designId,
    type: InvitationDesignType.FLIPBOOK,
    flyerInitialAsset: null,
    flyerQrAsset: null,
    pages,
    hotspots
  };
}

function page(designId: string, eventId: string, position: number) {
  const id = crypto.randomUUID();
  return {
    id,
    designId,
    eventId,
    position,
    deletedAt: null as Date | null,
    fileAsset: { ownerId: id, status: FileAssetStatus.READY, deletedAt: null },
    hotspots: []
  };
}

function flyerHotspot(designId: string, action: HotspotAction) {
  return {
    id: crypto.randomUUID(),
    designId,
    eventId: crypto.randomUUID(),
    action,
    visualOwnerType: HotspotVisualOwnerType.FLYER,
    flipbookPageId: null,
    flipbookPage: null
  };
}

function pageHotspot(designId: string, eventId: string, owner: ReturnType<typeof page>, action: HotspotAction) {
  return {
    id: crypto.randomUUID(),
    designId,
    eventId,
    action,
    visualOwnerType: HotspotVisualOwnerType.FLIPBOOK_PAGE,
    flipbookPageId: owner.id,
    flipbookPage: owner
  };
}

function dbWith(design: unknown) {
  return {
    invitationDesign: {
      findFirst: async () => design
    }
  } as Parameters<typeof resolveDesignReadiness>[0];
}
