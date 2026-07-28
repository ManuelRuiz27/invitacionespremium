import { FileAssetStatus, InvitationDesignType, ServiceCode, type Prisma } from '../generated/prisma/client';

export const DESIGN_READINESS_BLOCKERS = {
  UNSUPPORTED_SERVICE: 'INVITATION_DESIGN_SERVICE_UNSUPPORTED',
  MISSING: 'INVITATION_DESIGN_MISSING',
  TYPE_MISMATCH: 'INVITATION_DESIGN_TYPE_MISMATCH',
  FLYER_INITIAL: 'FLYER_INITIAL_IMAGE_MISSING',
  FLYER_QR: 'FLYER_QR_IMAGE_MISSING',
  FLIPBOOK_PAGES: 'FLIPBOOK_PAGE_COUNT_INVALID',
  FLIPBOOK_ORDER: 'FLIPBOOK_PAGE_ORDER_INVALID',
  FLIPBOOK_ASSET: 'FLIPBOOK_PAGE_ASSET_INVALID',
  HOTSPOTS: 'INVITATION_DESIGN_HOTSPOT_MISSING'
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
        include: { fileAsset: true }
      },
      hotspots: {
        where: { deletedAt: null },
        select: { id: true }
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
  }
  if (design.hotspots.length < 1) {
    blockers.push(DESIGN_READINESS_BLOCKERS.HOTSPOTS);
  }

  return {
    complete: blockers.length === 0,
    designType: design.type,
    blockers
  };
}
