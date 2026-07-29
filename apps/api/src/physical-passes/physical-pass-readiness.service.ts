import type { Prisma } from '../generated/prisma/client';
import { EventStatus, FileAssetStatus, FloorplanShapeKind, ServiceCode } from '../generated/prisma/client';

export const PHYSICAL_PASS_READINESS_BLOCKERS = {
  SERVICE_MISMATCH: 'PHYSICAL_PASS_SERVICE_MISMATCH',
  BASIC_DATA: 'EVENT_BASIC_DATA_INCOMPLETE',
  CAPACITY: 'PHYSICAL_PASS_CAPACITY_EXCEEDED',
  MISSING: 'PHYSICAL_PASS_MISSING',
  NUMBERING: 'PHYSICAL_PASS_NUMBERING_INCONSISTENT',
  PREACTIVATION_USE: 'PHYSICAL_PASS_USED_BEFORE_ACTIVATION',
  FLOORPLAN: 'EVENT_FLOORPLAN_INCOMPLETE',
  TABLE: 'PHYSICAL_PASS_TABLE_INVALID'
} as const;

export interface PhysicalPassReadiness {
  complete: boolean;
  blockers: string[];
  activePassCount: number;
}

const PHYSICAL_PASS_PREPARATION_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
]);

export async function recomputePhysicalPassPreparationStatus(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<EventStatus | null> {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: { service: { select: { code: true } } }
  });
  if (
    !event ||
    event.service?.code !== ServiceCode.PHYSICAL_QR ||
    !PHYSICAL_PASS_PREPARATION_STATUSES.has(event.status)
  ) {
    return event?.status ?? null;
  }

  const target = !hasCompletePhysicalPassBasicData(event)
    ? EventStatus.DRAFT
    : (await resolvePhysicalPassReadiness(tx, eventId)).complete
      ? EventStatus.READY_TO_ACTIVATE
      : EventStatus.CONFIGURED;
  if (target !== event.status) {
    await tx.event.update({ where: { id: eventId }, data: { status: target } });
  }
  return target;
}

export async function resolvePhysicalPassReadiness(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<PhysicalPassReadiness> {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    include: { service: { select: { code: true } } }
  });
  if (!event) return { complete: false, blockers: [PHYSICAL_PASS_READINESS_BLOCKERS.BASIC_DATA], activePassCount: 0 };
  const passes = await tx.physicalPass.findMany({
    where: { eventId, deletedAt: null },
    select: { passNumber: true, floorplanShapeId: true, usedAt: true },
    orderBy: { passNumber: 'asc' }
  });
  const blockers: string[] = [];
  if (event.service?.code !== ServiceCode.PHYSICAL_QR) blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.SERVICE_MISMATCH);
  if (!hasCompletePhysicalPassBasicData(event)) {
    blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.BASIC_DATA);
  }
  if (passes.length === 0) blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.MISSING);
  if (event.capacity !== null && passes.length > event.capacity)
    blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.CAPACITY);
  if (passes.some(({ passNumber }, index) => passNumber !== index + 1)) {
    blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.NUMBERING);
  }
  if (!event.activatedAt && passes.some(({ usedAt }) => usedAt !== null)) {
    blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.PREACTIVATION_USE);
  }
  if (event.floorplanEnabled) {
    const floorplan = await tx.floorplan.findFirst({
      where: { eventId, deletedAt: null },
      include: {
        imageAsset: true,
        shapes: {
          where: { deletedAt: null, kind: FloorplanShapeKind.TABLE },
          select: { id: true, capacity: true }
        }
      }
    });
    if (
      !floorplan ||
      floorplan.imageAsset.status !== FileAssetStatus.READY ||
      floorplan.imageAsset.deletedAt !== null ||
      floorplan.shapes.length === 0
    ) {
      blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.FLOORPLAN);
    } else {
      const tables = new Map(floorplan.shapes.map((shape) => [shape.id, shape.capacity]));
      if (passes.some(({ floorplanShapeId }) => floorplanShapeId === null || !tables.has(floorplanShapeId))) {
        blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.TABLE);
      }
      for (const [tableId, capacity] of tables) {
        const assistants = await tx.assistant.count({ where: { floorplanShapeId: tableId, deletedAt: null } });
        const physicalPasses = passes.filter(({ floorplanShapeId }) => floorplanShapeId === tableId).length;
        if (assistants + physicalPasses > capacity) blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.CAPACITY);
      }
    }
  } else if (passes.some(({ floorplanShapeId }) => floorplanShapeId !== null)) {
    blockers.push(PHYSICAL_PASS_READINESS_BLOCKERS.TABLE);
  }
  return { complete: blockers.length === 0, blockers: [...new Set(blockers)], activePassCount: passes.length };
}

function hasCompletePhysicalPassBasicData(event: {
  name: string | null;
  socialType: unknown;
  eventDateTime: Date | null;
  timeZone: string | null;
  capacity: number | null;
}): boolean {
  return Boolean(
    event.name?.trim() &&
    event.socialType &&
    event.eventDateTime &&
    event.timeZone &&
    event.capacity !== null &&
    event.capacity > 0
  );
}
