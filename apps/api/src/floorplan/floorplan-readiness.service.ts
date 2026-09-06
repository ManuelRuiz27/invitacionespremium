import type { Prisma } from '../generated/prisma/client';
import { FileAssetStatus, FloorplanSeatingMode, FloorplanShapeKind } from '../generated/prisma/client';

export const FLOORPLAN_READINESS_BLOCKERS = {
  MISSING: 'EVENT_FLOORPLAN_MISSING',
  IMAGE_NOT_READY: 'EVENT_FLOORPLAN_IMAGE_NOT_READY',
  TABLE_MISSING: 'EVENT_FLOORPLAN_TABLE_MISSING',
  INCONSISTENT: 'EVENT_FLOORPLAN_INCONSISTENT'
} as const;

export interface FloorplanReadiness {
  complete: boolean;
  blockers: string[];
}

export async function resolveFloorplanReadiness(
  transaction: Prisma.TransactionClient,
  eventId: string
): Promise<FloorplanReadiness> {
  const floorplan = await transaction.floorplan.findFirst({
    where: { eventId, deletedAt: null },
    include: {
      imageAsset: true,
      shapes: { where: { deletedAt: null }, select: { id: true, kind: true, capacity: true } },
      seats: {
        where: { deletedAt: null },
        select: { floorplanShapeId: true, isBlocked: true }
      }
    }
  });
  if (!floorplan) return { complete: false, blockers: [FLOORPLAN_READINESS_BLOCKERS.MISSING] };
  const blockers: string[] = [];
  if (floorplan.imageAsset.status !== FileAssetStatus.READY || floorplan.imageAsset.deletedAt !== null) {
    blockers.push(FLOORPLAN_READINESS_BLOCKERS.IMAGE_NOT_READY);
  }
  if (!floorplan.shapes.some(({ kind, capacity }) => kind === FloorplanShapeKind.TABLE && capacity > 0)) {
    blockers.push(FLOORPLAN_READINESS_BLOCKERS.TABLE_MISSING);
  }
  if (
    floorplan.shapes.some(
      ({ kind, capacity }) =>
        (kind === FloorplanShapeKind.TABLE && capacity <= 0) ||
        (kind === FloorplanShapeKind.DECORATIVE_ZONE && capacity !== 0)
    )
  ) {
    blockers.push(FLOORPLAN_READINESS_BLOCKERS.INCONSISTENT);
  }
  if (floorplan.seatingMode === FloorplanSeatingMode.SEAT) {
    const tables = floorplan.shapes.filter(({ kind }) => kind === FloorplanShapeKind.TABLE);
    const tableIds = new Set(tables.map(({ id }) => id));
    const activeSeats = floorplan.seats.filter((seat) => tableIds.has(seat.floorplanShapeId));
    const hasInvalidParent = floorplan.seats.some((seat) => !tableIds.has(seat.floorplanShapeId));
    const hasDivergentCapacity = tables.some(
      (table) =>
        table.capacity !== activeSeats.filter((seat) => seat.floorplanShapeId === table.id && !seat.isBlocked).length
    );
    const hasTableWithoutAvailableSeat = tables.some(
      (table) => !activeSeats.some((seat) => seat.floorplanShapeId === table.id && !seat.isBlocked)
    );
    if (hasInvalidParent || hasDivergentCapacity || hasTableWithoutAvailableSeat) {
      blockers.push(FLOORPLAN_READINESS_BLOCKERS.INCONSISTENT);
    }
  }
  return { complete: blockers.length === 0, blockers };
}
