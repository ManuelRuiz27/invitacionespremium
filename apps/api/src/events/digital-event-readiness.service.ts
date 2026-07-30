import { EventStatus, ServiceCode, type Prisma } from '../generated/prisma/client';
import { resolveFloorplanReadiness } from '../floorplan/floorplan-readiness.service';
import { resolveDesignReadiness } from '../invitation-design/invitation-design.readiness';

export const DIGITAL_EVENT_READINESS_BLOCKERS = {
  BASIC_DATA_INCOMPLETE: 'EVENT_BASIC_DATA_INCOMPLETE',
  DESIGN_INCOMPLETE: 'EVENT_INVITATION_DESIGN_INCOMPLETE',
  ACTIVE_INVITATION_MISSING: 'EVENT_ACTIVE_INVITATION_MISSING',
  CONFIRMATION_NOT_ENABLED: 'EVENT_CONFIRMATION_NOT_ENABLED',
  LOCATION_URL_MISSING: 'EVENT_LOCATION_URL_MISSING',
  GIFT_REGISTRY_URL_MISSING: 'EVENT_GIFT_REGISTRY_URL_MISSING',
  FLOORPLAN_INCOMPLETE: 'EVENT_FLOORPLAN_INCOMPLETE'
} as const;

export interface DigitalEventReadiness {
  complete: boolean;
  blockers: string[];
  activeInvitationCount: number;
}

export interface DigitalEventPreparationStatus extends DigitalEventReadiness {
  status: EventStatus;
}

const PREPARATION_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
]);

export async function resolveDigitalEventReadiness(
  transaction: Prisma.TransactionClient,
  eventId: string
): Promise<DigitalEventReadiness> {
  const event = await transaction.event.findUnique({
    where: { id: eventId },
    include: { service: { select: { code: true } } }
  });
  const activeInvitationCount = await transaction.invitation.count({
    where: {
      eventId,
      deletedAt: null,
      cancelledAt: null,
      contact: { deletedAt: null }
    }
  });
  if (
    !event ||
    !event.service ||
    (event.service.code !== ServiceCode.FLYER && event.service.code !== ServiceCode.FLIPBOOK)
  ) {
    return {
      complete: false,
      blockers: [DIGITAL_EVENT_READINESS_BLOCKERS.BASIC_DATA_INCOMPLETE],
      activeInvitationCount
    };
  }

  const blockers: string[] = [];
  if (!hasCompleteBasicData(event)) {
    blockers.push(DIGITAL_EVENT_READINESS_BLOCKERS.BASIC_DATA_INCOMPLETE);
  }
  const design = await resolveDesignReadiness(transaction, eventId, event.service.code);
  if (!design.complete) {
    blockers.push(DIGITAL_EVENT_READINESS_BLOCKERS.DESIGN_INCOMPLETE);
  }
  if (activeInvitationCount === 0) {
    blockers.push(DIGITAL_EVENT_READINESS_BLOCKERS.ACTIVE_INVITATION_MISSING);
  }
  if (!event.confirmationEnabled) {
    blockers.push(DIGITAL_EVENT_READINESS_BLOCKERS.CONFIRMATION_NOT_ENABLED);
  }
  if (!event.locationUrl) {
    blockers.push(DIGITAL_EVENT_READINESS_BLOCKERS.LOCATION_URL_MISSING);
  }
  if (!event.giftRegistryUrl) {
    blockers.push(DIGITAL_EVENT_READINESS_BLOCKERS.GIFT_REGISTRY_URL_MISSING);
  }
  if (event.floorplanEnabled && !(await resolveFloorplanReadiness(transaction, eventId)).complete) {
    blockers.push(DIGITAL_EVENT_READINESS_BLOCKERS.FLOORPLAN_INCOMPLETE);
  }
  return { complete: blockers.length === 0, blockers, activeInvitationCount };
}

export async function recomputeDigitalEventPreparationStatus(
  transaction: Prisma.TransactionClient,
  eventId: string
): Promise<DigitalEventPreparationStatus | null> {
  const event = await transaction.event.findUnique({
    where: { id: eventId },
    include: { service: { select: { code: true } } }
  });
  if (
    !event ||
    event.deletedAt !== null ||
    !PREPARATION_STATUSES.has(event.status) ||
    !event.service ||
    (event.service.code !== ServiceCode.FLYER && event.service.code !== ServiceCode.FLIPBOOK)
  ) {
    return null;
  }

  const readiness = await resolveDigitalEventReadiness(transaction, eventId);
  const status = !hasCompleteBasicData(event)
    ? EventStatus.DRAFT
    : readiness.complete
      ? EventStatus.READY_TO_ACTIVATE
      : EventStatus.CONFIGURED;
  if (status !== event.status) {
    await transaction.event.update({
      where: { id: eventId },
      data: { status }
    });
  }
  return { ...readiness, status };
}

function hasCompleteBasicData(event: {
  name: string | null;
  serviceId: string | null;
  socialType: unknown;
  eventDateTime: Date | null;
  timeZone: string | null;
  capacity: number | null;
}): boolean {
  return (
    event.name !== null &&
    event.name.trim().length > 0 &&
    event.serviceId !== null &&
    event.socialType !== null &&
    event.eventDateTime !== null &&
    event.timeZone !== null &&
    event.timeZone.trim().length > 0 &&
    event.capacity !== null &&
    event.capacity > 0
  );
}
