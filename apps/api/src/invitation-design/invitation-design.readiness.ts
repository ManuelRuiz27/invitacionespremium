import {
  FileAssetStatus,
  HotspotAction,
  HotspotVisualOwnerType,
  InvitationDesignType,
  ServiceCode,
  type Prisma
} from '../generated/prisma/client';

export const DESIGN_READINESS_BLOCKERS = {
  UNSUPPORTED_SERVICE: 'INVITATION_DESIGN_SERVICE_UNSUPPORTED',
  MISSING: 'INVITATION_DESIGN_MISSING',
  TYPE_MISMATCH: 'INVITATION_DESIGN_TYPE_MISMATCH',
  FLYER_INITIAL: 'FLYER_INITIAL_IMAGE_MISSING',
  FLYER_QR: 'FLYER_QR_IMAGE_MISSING',
  FLIPBOOK_PAGES: 'FLIPBOOK_PAGE_COUNT_INVALID',
  FLIPBOOK_ORDER: 'FLIPBOOK_PAGE_ORDER_INVALID',
  FLIPBOOK_ASSET: 'FLIPBOOK_PAGE_ASSET_INVALID',
  FLYER_RSVP: 'FLYER_RSVP_HOTSPOT_MISSING',
  FLYER_LOCATION: 'FLYER_LOCATION_HOTSPOT_MISSING',
  FLYER_GIFT_REGISTRY: 'FLYER_GIFT_REGISTRY_HOTSPOT_MISSING',
  FLYER_QR_AREA: 'FLYER_QR_AREA_HOTSPOT_MISSING',
  FLIPBOOK_COVER: 'FLIPBOOK_COVER_PAGE_MISSING',
  FLIPBOOK_COVER_RSVP: 'FLIPBOOK_COVER_RSVP_HOTSPOT_MISSING',
  FLIPBOOK_COVER_LOCATION: 'FLIPBOOK_COVER_LOCATION_HOTSPOT_MISSING',
  FLIPBOOK_COVER_GIFT_REGISTRY: 'FLIPBOOK_COVER_GIFT_REGISTRY_HOTSPOT_MISSING',
  FLIPBOOK_QR_PAGE: 'FLIPBOOK_QR_PAGE_MISSING',
  FLIPBOOK_HOTSPOT_OWNER: 'FLIPBOOK_HOTSPOT_OWNER_INVALID',
  FLIPBOOK_HOTSPOT_PLACEMENT: 'FLIPBOOK_HOTSPOT_PLACEMENT_INVALID'
} as const;

export interface DesignReadiness {
  complete: boolean;
  designType: InvitationDesignType | null;
  blockers: string[];
}

type DesignDatabase = Prisma.TransactionClient;

export async function resolveDesignReadiness(
  database: DesignDatabase,
  eventId: string,
  serviceCode: ServiceCode
): Promise<DesignReadiness> {
  if (serviceCode !== ServiceCode.FLYER && serviceCode !== ServiceCode.FLIPBOOK) {
    return {
      complete: false,
      designType: null,
      blockers: [DESIGN_READINESS_BLOCKERS.UNSUPPORTED_SERVICE]
    };
  }

  const design = await database.invitationDesign.findFirst({
    where: { eventId, deletedAt: null },
    include: {
      flyerInitialAsset: true,
      flyerQrAsset: true,
      pages: {
        where: { deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: {
          fileAsset: true,
          hotspots: {
            where: { deletedAt: null },
            select: { id: true, action: true }
          }
        }
      },
      hotspots: {
        where: { deletedAt: null },
        select: {
          id: true,
          action: true,
          visualOwnerType: true,
          flipbookPageId: true,
          eventId: true,
          designId: true,
          flipbookPage: {
            select: { id: true, eventId: true, designId: true, position: true, deletedAt: true }
          }
        }
      }
    }
  });
  if (!design) {
    return { complete: false, designType: null, blockers: [DESIGN_READINESS_BLOCKERS.MISSING] };
  }

  const expectedType = serviceCode === ServiceCode.FLYER ? InvitationDesignType.FLYER : InvitationDesignType.FLIPBOOK;
  const blockers: string[] = [];
  if (design.type !== expectedType) {
    blockers.push(DESIGN_READINESS_BLOCKERS.TYPE_MISMATCH);
  } else if (design.type === InvitationDesignType.FLYER) {
    if (
      !design.flyerInitialAsset ||
      design.flyerInitialAsset.status !== FileAssetStatus.READY ||
      design.flyerInitialAsset.deletedAt !== null ||
      design.flyerInitialAsset.ownerId !== design.id
    ) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLYER_INITIAL);
    }
    if (
      !design.flyerQrAsset ||
      design.flyerQrAsset.status !== FileAssetStatus.READY ||
      design.flyerQrAsset.deletedAt !== null ||
      design.flyerQrAsset.ownerId !== design.id
    ) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLYER_QR);
    }
    addMissingActions(
      blockers,
      new Set(
        design.hotspots
          .filter((hotspot) => hotspot.visualOwnerType === HotspotVisualOwnerType.FLYER)
          .map((hotspot) => hotspot.action)
      ),
      [
        [HotspotAction.RSVP, DESIGN_READINESS_BLOCKERS.FLYER_RSVP],
        [HotspotAction.LOCATION, DESIGN_READINESS_BLOCKERS.FLYER_LOCATION],
        [HotspotAction.GIFT_REGISTRY, DESIGN_READINESS_BLOCKERS.FLYER_GIFT_REGISTRY],
        [HotspotAction.QR_AREA, DESIGN_READINESS_BLOCKERS.FLYER_QR_AREA]
      ]
    );
  } else {
    if (design.pages.length < 1 || design.pages.length > 10) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLIPBOOK_PAGES);
    }
    if (design.pages.some((page, index) => page.position !== index + 1)) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLIPBOOK_ORDER);
    }
    if (
      design.pages.some(
        (page) =>
          page.fileAsset.status !== FileAssetStatus.READY ||
          page.fileAsset.deletedAt !== null ||
          page.fileAsset.ownerId !== page.id
      )
    ) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLIPBOOK_ASSET);
    }
    const activePages = new Map(design.pages.map((page) => [page.id, page]));
    const validHotspots = design.hotspots.filter((hotspot) => {
      const page = hotspot.flipbookPage;
      return (
        hotspot.visualOwnerType === HotspotVisualOwnerType.FLIPBOOK_PAGE &&
        hotspot.flipbookPageId !== null &&
        page !== null &&
        page.deletedAt === null &&
        page.id === hotspot.flipbookPageId &&
        page.designId === design.id &&
        page.eventId === hotspot.eventId &&
        activePages.has(page.id)
      );
    });
    if (validHotspots.length !== design.hotspots.length) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLIPBOOK_HOTSPOT_OWNER);
    }
    const cover = design.pages.find((page) => page.position === 1);
    if (!cover) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLIPBOOK_COVER);
    }
    const coverActions = new Set(
      validHotspots.filter((hotspot) => hotspot.flipbookPageId === cover?.id).map((hotspot) => hotspot.action)
    );
    addMissingActions(blockers, coverActions, [
      [HotspotAction.RSVP, DESIGN_READINESS_BLOCKERS.FLIPBOOK_COVER_RSVP],
      [HotspotAction.LOCATION, DESIGN_READINESS_BLOCKERS.FLIPBOOK_COVER_LOCATION],
      [HotspotAction.GIFT_REGISTRY, DESIGN_READINESS_BLOCKERS.FLIPBOOK_COVER_GIFT_REGISTRY]
    ]);
    const qrHotspot = validHotspots.find((hotspot) => hotspot.action === HotspotAction.QR_AREA);
    if (!qrHotspot) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLIPBOOK_QR_PAGE);
    }
    const qrPageId = qrHotspot?.flipbookPageId;
    const invalidPlacement = validHotspots.some((hotspot) => {
      if (hotspot.action === HotspotAction.QR_AREA) {
        return false;
      }
      if (hotspot.action === HotspotAction.EXTERNAL_LINK) {
        return hotspot.flipbookPageId !== cover?.id && hotspot.flipbookPageId !== qrPageId;
      }
      return hotspot.flipbookPageId !== cover?.id;
    });
    if (invalidPlacement) {
      blockers.push(DESIGN_READINESS_BLOCKERS.FLIPBOOK_HOTSPOT_PLACEMENT);
    }
  }

  return {
    complete: blockers.length === 0,
    designType: design.type,
    blockers
  };
}

function addMissingActions(
  blockers: string[],
  actions: Set<HotspotAction>,
  required: ReadonlyArray<readonly [HotspotAction, string]>
): void {
  for (const [action, blocker] of required) {
    if (!actions.has(action)) {
      blockers.push(blocker);
    }
  }
}
