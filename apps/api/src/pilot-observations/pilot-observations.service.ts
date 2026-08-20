import { Inject, Injectable } from '@nestjs/common';
import { AuditActorFactory } from '../audit/audit-actor.factory';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { eventNotFound } from '../events/event-access.policy';
import { FloorplanShapeKind, type Prisma } from '../generated/prisma/client';
import {
  type PilotObservationInput,
  type PilotObservationJournalResponseDto,
  type PilotObservationResponseDto,
  type PilotObservationSummaryDto,
  pilotObservationSchema
} from './pilot-observations.dto';

const RESOURCE_TYPE = 'PILOT_OPERATION';
const ACTION = 'PILOT_OBSERVATION_RECORDED';

@Injectable()
export class PilotObservationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    clientId: string,
    eventId: string,
    input: PilotObservationInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<PilotObservationResponseDto> {
    return this.prisma.$transaction(async (transaction) => {
      await this.requireEvent(transaction, clientId, eventId);
      const id = await this.audit.record(
        {
          actor: AuditActorFactory.user(principal.userId),
          clientId,
          eventId,
          resourceType: RESOURCE_TYPE,
          resourceId: eventId,
          action: ACTION,
          ...(operationId === undefined ? {} : { operationId }),
          metadata: observationMetadata(input)
        },
        transaction
      );
      const created = await transaction.auditLog.findUniqueOrThrow({
        where: { id },
        select: { id: true, occurredAt: true, metadata: true }
      });
      return toObservation(created.id, created.occurredAt, created.metadata);
    });
  }

  async get(clientId: string, eventId: string): Promise<PilotObservationJournalResponseDto> {
    await this.requireEvent(this.prisma, clientId, eventId);
    const observations = await this.listAll(clientId, eventId);
    const [guestCount, tableCount] = await Promise.all([
      this.prisma.contact.count({ where: { eventId, deletedAt: null } }),
      this.prisma.floorplanShape.count({
        where: { eventId, kind: FloorplanShapeKind.TABLE, deletedAt: null }
      })
    ]);
    return { observations, summary: summarize(observations, guestCount, tableCount) };
  }

  private async listAll(clientId: string, eventId: string): Promise<PilotObservationResponseDto[]> {
    const observations: PilotObservationResponseDto[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.audit.list({
        clientId,
        eventId,
        resourceType: RESOURCE_TYPE,
        resourceId: eventId,
        action: ACTION,
        limit: 100,
        ...(cursor ? { cursor } : {})
      });
      for (const item of page.items) {
        const parsed = pilotObservationSchema.safeParse(item.metadata);
        if (parsed.success) observations.push(toObservation(item.id, new Date(item.createdAt), parsed.data));
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return observations;
  }

  private async requireEvent(
    database: PrismaService | Prisma.TransactionClient,
    clientId: string,
    eventId: string
  ): Promise<void> {
    const event = await database.event.findFirst({
      where: { id: eventId, clientId, deletedAt: null },
      select: { id: true }
    });
    if (!event) throw eventNotFound();
  }
}

function observationMetadata(input: PilotObservationInput): Record<string, unknown> {
  return {
    kind: input.kind,
    area: input.area,
    ...(input.durationMinutes === undefined ? {} : { durationMinutes: input.durationMinutes }),
    count: input.count,
    ...(input.note === undefined ? {} : { note: input.note })
  };
}

function toObservation(id: string, occurredAt: Date, metadata: unknown): PilotObservationResponseDto {
  const value = pilotObservationSchema.parse(metadata);
  return {
    id,
    createdAt: occurredAt.toISOString(),
    kind: value.kind,
    area: value.area,
    ...(value.durationMinutes === undefined ? {} : { durationMinutes: value.durationMinutes }),
    count: value.count,
    ...(value.note === undefined ? {} : { note: value.note })
  };
}

function summarize(
  observations: PilotObservationResponseDto[],
  guestCount: number,
  tableCount: number
): PilotObservationSummaryDto {
  const sumMinutes = (predicate: (item: PilotObservationResponseDto) => boolean) =>
    observations.reduce((total, item) => total + (predicate(item) ? (item.durationMinutes ?? 0) : 0), 0);
  const sumCount = (predicate: (item: PilotObservationResponseDto) => boolean) =>
    observations.reduce((total, item) => total + (predicate(item) ? item.count : 0), 0);
  return {
    preparationMinutesTotal: sumMinutes((item) => item.kind === 'PREPARATION_TIME'),
    invitationPreparationMinutes: sumMinutes((item) => item.kind === 'PREPARATION_TIME' && item.area === 'INVITATION'),
    floorplanPreparationMinutes: sumMinutes((item) => item.kind === 'PREPARATION_TIME' && item.area === 'FLOORPLAN'),
    plannerSupportMinutes: sumMinutes((item) => item.kind === 'PLANNER_SUPPORT'),
    plannerSupportEntries: sumCount((item) => item.kind === 'PLANNER_SUPPORT'),
    incidents: sumCount((item) => item.kind === 'INCIDENT'),
    checkinIncidents: sumCount((item) => item.kind === 'INCIDENT' && item.area === 'CHECKIN'),
    lastMinuteChanges: sumCount((item) => item.kind === 'LAST_MINUTE_CHANGE'),
    manualWorkMinutes: sumMinutes((item) => item.kind === 'MANUAL_WORK'),
    manualWorkEntries: sumCount((item) => item.kind === 'MANUAL_WORK'),
    guestCount,
    tableCount
  };
}
