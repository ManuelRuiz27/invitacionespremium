import { EventAccessMode, EventStatus, ServiceCode, type Prisma } from '../generated/prisma/client';
import { resolveFloorplanReadiness } from '../floorplan/floorplan-readiness.service';

export interface AccessControlReadiness {
  complete: boolean;
  accessMode: EventAccessMode | null;
  blockers: string[];
  activeMaterialCount: number;
  capacity: number | null;
}
export interface AccessControlPreparationStatus extends AccessControlReadiness {
  status: EventStatus;
}
const preparation = new Set<EventStatus>([EventStatus.DRAFT, EventStatus.CONFIGURED, EventStatus.READY_TO_ACTIVATE]);

// The SQL predicate is also the final activation guard. Callers hold Event first;
// reads do not write preparation state or expose the underlying identities.
export async function resolveAccessControlReadiness(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<AccessControlReadiness> {
  const [result] = await tx.$queryRaw<Omit<AccessControlReadiness, 'complete'>[]>`
    SELECT access_mode AS "accessMode", blockers, active_material_count AS "activeMaterialCount", capacity
    FROM resolve_access_control_readiness(${eventId}::uuid)
  `;
  if (!result) throw new Error('Access readiness result unavailable.');
  const event = await tx.event.findUnique({ where: { id: eventId }, select: { floorplanEnabled: true } });
  const floorplan = event?.floorplanEnabled ? await resolveFloorplanReadiness(tx, eventId) : null;
  const blockers = [...new Set([...result.blockers, ...(floorplan?.blockers ?? [])])].sort();
  return { ...result, blockers, complete: blockers.length === 0 };
}

export async function recomputeAccessControlPreparationStatus(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<AccessControlPreparationStatus | null> {
  const event = await tx.event.findUnique({ where: { id: eventId }, include: { service: true } });
  if (!event || event.deletedAt || event.service?.code !== ServiceCode.ACCESS_CONTROL || !preparation.has(event.status))
    return null;
  const readiness = await resolveAccessControlReadiness(tx, eventId);
  const status = readiness.blockers.includes('EVENT_BASIC_DATA_INCOMPLETE')
    ? EventStatus.DRAFT
    : readiness.complete
      ? EventStatus.READY_TO_ACTIVATE
      : EventStatus.CONFIGURED;
  if (event.status !== status) {
    // The existing lifecycle permits READY -> CONFIGURED -> DRAFT, never READY -> DRAFT.
    if (event.status === EventStatus.READY_TO_ACTIVATE && status === EventStatus.DRAFT)
      await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.CONFIGURED } });
    if (event.status === EventStatus.DRAFT && status === EventStatus.READY_TO_ACTIVATE)
      await tx.event.update({ where: { id: eventId }, data: { status: EventStatus.CONFIGURED } });
    await tx.event.update({ where: { id: eventId }, data: { status } });
  }
  return { ...readiness, status };
}
