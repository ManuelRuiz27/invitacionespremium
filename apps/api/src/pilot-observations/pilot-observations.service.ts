import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditActorFactory } from '../audit/audit-actor.factory';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { PrismaService } from '../common/database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { eventNotFound } from '../events/event-access.policy';
import { FloorplanShapeKind, type Prisma } from '../generated/prisma/client';
import {
  type PilotObservationInput,
  type PilotObservationCorrectionInput,
  type PilotObservationJournalResponseDto,
  type PilotObservationResponseDto,
  type PilotObservationSummaryDto,
  pilotObservationSchema
} from './pilot-observations.dto';

const RESOURCE_TYPE = 'PILOT_OPERATION';
const ACTION = 'PILOT_OBSERVATION_RECORDED';
const CORRECTION_ACTION = 'PILOT_OBSERVATION_CORRECTED';

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

  async correct(
    clientId: string,
    eventId: string,
    observationId: string,
    input: PilotObservationCorrectionInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<PilotObservationResponseDto> {
    return this.prisma.$transaction(async (transaction) => {
      await this.requireEvent(transaction, clientId, eventId);
      const target = await transaction.auditLog.findFirst({
        where: {
          id: observationId,
          clientId,
          eventId,
          resourceType: RESOURCE_TYPE,
          resourceId: eventId,
          action: ACTION
        },
        select: { id: true, occurredAt: true, metadata: true }
      });
      if (!target) {
        throw new DomainError('PILOT_OBSERVATION_NOT_FOUND', 'Pilot observation not found.', HttpStatus.NOT_FOUND);
      }

      await transaction.$queryRaw<Array<{ locked: boolean }>>`
        SELECT TRUE AS "locked"
        FROM pg_advisory_xact_lock(hashtextextended(${`pilot-observation:${observationId}`}, 0))
      `;
      const existing = await transaction.auditLog.findFirst({
        where: {
          clientId,
          eventId,
          resourceType: RESOURCE_TYPE,
          resourceId: eventId,
          action: CORRECTION_ACTION,
          metadata: { path: ['correctedObservationId'], equals: observationId }
        },
        select: { id: true }
      });
      if (existing) {
        throw new DomainError(
          'PILOT_OBSERVATION_ALREADY_CORRECTED',
          'Pilot observation was already corrected.',
          HttpStatus.CONFLICT
        );
      }

      const correctionId = await this.audit.record(
        {
          actor: AuditActorFactory.user(principal.userId),
          clientId,
          eventId,
          resourceType: RESOURCE_TYPE,
          resourceId: eventId,
          action: CORRECTION_ACTION,
          ...(operationId === undefined ? {} : { operationId }),
          metadata: { correctedObservationId: observationId, reason: input.reason }
        },
        transaction
      );
      const correction = await transaction.auditLog.findUniqueOrThrow({
        where: { id: correctionId },
        select: { occurredAt: true }
      });
      return toObservation(target.id, target.occurredAt, target.metadata, {
        correctedAt: correction.occurredAt,
        reason: input.reason
      });
    }, CRITICAL_TRANSACTION_OPTIONS);
  }

  private async listAll(clientId: string, eventId: string): Promise<PilotObservationResponseDto[]> {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        clientId,
        eventId,
        resourceType: RESOURCE_TYPE,
        resourceId: eventId,
        action: { in: [ACTION, CORRECTION_ACTION] }
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { id: true, occurredAt: true, action: true, metadata: true }
    });
    const corrections = new Map<string, { correctedAt: Date; reason: string }>();
    for (const entry of entries) {
      if (entry.action !== CORRECTION_ACTION) continue;
      const correction = parseCorrectionMetadata(entry.metadata);
      if (correction && !corrections.has(correction.correctedObservationId)) {
        corrections.set(correction.correctedObservationId, {
          correctedAt: entry.occurredAt,
          reason: correction.reason
        });
      }
    }
    return entries.flatMap((entry) => {
      if (entry.action !== ACTION) return [];
      const parsed = pilotObservationSchema.safeParse(entry.metadata);
      return parsed.success ? [toObservation(entry.id, entry.occurredAt, parsed.data, corrections.get(entry.id))] : [];
    });
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
    ...(input.amountMxnCents === undefined ? {} : { amountMxnCents: input.amountMxnCents }),
    count: input.count,
    ...(input.note === undefined ? {} : { note: input.note })
  };
}

function toObservation(
  id: string,
  occurredAt: Date,
  metadata: unknown,
  correction?: { correctedAt: Date; reason: string }
): PilotObservationResponseDto {
  const value = pilotObservationSchema.parse(metadata);
  return {
    id,
    createdAt: occurredAt.toISOString(),
    kind: value.kind,
    area: value.area,
    ...(value.durationMinutes === undefined ? {} : { durationMinutes: value.durationMinutes }),
    ...(value.amountMxnCents === undefined ? {} : { amountMxnCents: value.amountMxnCents }),
    count: value.count,
    ...(value.note === undefined ? {} : { note: value.note }),
    ...(correction === undefined
      ? {}
      : { correctedAt: correction.correctedAt.toISOString(), correctionReason: correction.reason })
  };
}

function parseCorrectionMetadata(metadata: unknown): { correctedObservationId: string; reason: string } | undefined {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return undefined;
  const correctedObservationId = Reflect.get(metadata, 'correctedObservationId');
  const reason = Reflect.get(metadata, 'reason');
  return typeof correctedObservationId === 'string' && typeof reason === 'string'
    ? { correctedObservationId, reason }
    : undefined;
}

function summarize(
  observations: PilotObservationResponseDto[],
  guestCount: number,
  tableCount: number
): PilotObservationSummaryDto {
  const active = observations.filter((item) => item.correctedAt === undefined);
  const sumMinutes = (predicate: (item: PilotObservationResponseDto) => boolean) =>
    active.reduce((total, item) => total + (predicate(item) ? (item.durationMinutes ?? 0) : 0), 0);
  const sumCount = (predicate: (item: PilotObservationResponseDto) => boolean) =>
    active.reduce((total, item) => total + (predicate(item) ? item.count : 0), 0);
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
