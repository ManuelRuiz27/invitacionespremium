import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import {
  AssistantResponseStatus,
  AuditActorType,
  EventStatus,
  FloorplanSeatingMode,
  FloorplanShapeKind,
  InvitationResponseStatus,
  Prisma,
  type CheckIn
} from '../generated/prisma/client';
import { InvitationQrService } from '../public-rsvp/invitation-qr.service';
import { StaffTokenResolverService, type StaffResolution } from '../staff-access/staff-access.service';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { z } from 'zod';
import type {
  CheckInRevertResponseDto,
  PendingAssistantDto,
  ScannerCheckInInput,
  ScannerCheckInResponseDto,
  ScannerInvitationResultDto,
  ScannerScanInput,
  ScannerScanResponseDto,
  ScannerSearchInput,
  ScannerSearchResponseDto
} from './scanner.dto';

const REVERTIBLE = new Set<EventStatus>([EventStatus.ACTIVE, EventStatus.EVENT_DAY, EventStatus.CLOSED]);
const MAX_ATTEMPTS = 20;
const LOCKED_READ_TRANSACTION_OPTIONS = {
  ...CRITICAL_TRANSACTION_OPTIONS,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
} as const;

const scannerInvitationInclude = {
  contact: true,
  assistants: {
    where: {
      deletedAt: null,
      anonymizedAt: null,
      name: { not: null },
      responseStatus: AssistantResponseStatus.CONFIRMED
    },
    include: {
      checkIns: { where: { revertedAt: null }, select: { id: true } },
      floorplanShape: { select: { id: true, name: true } }
    },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }]
  }
} satisfies Prisma.InvitationInclude;

type ScannerInvitation = Prisma.InvitationGetPayload<{ include: typeof scannerInvitationInclude }>;
const checkInResultSnapshotSchema = z
  .object({
    status: z.literal('CHECKED_IN'),
    invitationId: z.string().uuid(),
    checkedIn: z.array(
      z
        .object({
          checkInId: z.string().uuid(),
          assistantId: z.string().uuid(),
          name: z.string().min(1).max(160),
          checkedInAt: z.iso.datetime(),
          table: z
            .object({ id: z.string().uuid(), name: z.string().min(1).max(120) })
            .strict()
            .nullable()
        })
        .strict()
    ),
    remainingPendingAssistants: z.array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string().min(1).max(160),
          isPrimary: z.boolean(),
          table: z
            .object({ id: z.string().uuid(), name: z.string().min(1).max(120) })
            .strict()
            .nullable()
        })
        .strict()
    ),
    remainingPendingCount: z.number().int().nonnegative()
  })
  .strict()
  .refine(({ remainingPendingAssistants, remainingPendingCount }) => {
    return remainingPendingAssistants.length === remainingPendingCount;
  });

@Injectable()
export class ScannerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StaffTokenResolverService) private readonly staffTokens: StaffTokenResolverService,
    @Inject(InvitationQrService) private readonly invitationQr: InvitationQrService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly eventAccess: EventAccessPolicy,
    @Inject(RealtimePublisherService) private readonly realtime: RealtimePublisherService
  ) {}

  async scan(rawStaffToken: string, input: ScannerScanInput): Promise<ScannerScanResponseDto> {
    return this.lockedRead(async (tx) => {
      const resolution = await this.requireStaff(tx, rawStaffToken);
      const resolvedQr = await this.invitationQr.resolveQrTokenInTransaction(
        tx,
        input.qrToken,
        resolution.staff.eventId
      );
      if (!resolvedQr) throw scannerQrNotFound();
      const invitation = await this.loadScannerInvitation(tx, resolvedQr.invitationId, resolution.staff.eventId);
      if (!invitation) throw scannerQrNotFound();
      const result = projectInvitation(invitation);
      return { status: result.pendingCount > 0 ? 'AVAILABLE' : 'NO_PENDING', ...result };
    });
  }

  async search(rawStaffToken: string, input: ScannerSearchInput): Promise<ScannerSearchResponseDto> {
    return this.lockedRead(async (tx) => {
      const resolution = await this.requireStaff(tx, rawStaffToken);
      const invitations = await tx.invitation.findMany({
        where: {
          eventId: resolution.staff.eventId,
          deletedAt: null,
          cancelledAt: null,
          responseStatus: InvitationResponseStatus.CONFIRMED,
          contact: { deletedAt: null },
          OR: [
            { contact: { name: { equals: input.query, mode: 'insensitive' }, deletedAt: null } },
            {
              assistants: {
                some: {
                  name: { equals: input.query, mode: 'insensitive' },
                  deletedAt: null,
                  anonymizedAt: null
                }
              }
            }
          ]
        },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      });
      const ids = invitations.map(({ id }) => id);
      if (ids.length > 0) {
        await tx.$queryRaw`
          SELECT "id" FROM "invitation"
          WHERE "id" = ANY(ARRAY[${Prisma.join(ids)}]::uuid[])
          ORDER BY "id" FOR SHARE
        `;
      }
      const results: ScannerInvitationResultDto[] = [];
      for (const { id } of invitations) {
        const invitation = await this.loadScannerInvitation(tx, id, resolution.staff.eventId);
        if (invitation) results.push(projectInvitation(invitation));
      }
      return { status: results.length > 0 ? 'MATCHES' : 'NO_MATCHES', results };
    });
  }

  async checkIn(
    rawStaffToken: string,
    idempotencyKey: string,
    input: ScannerCheckInInput,
    operationId?: string
  ): Promise<ScannerCheckInResponseDto> {
    const effectiveOperationId = operationId ?? randomUUID();
    const sortedIds = [...input.assistantIds].sort();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction(async (tx) => {
          const resolution = await this.requireStaff(tx, rawStaffToken);
          const signature = requestSignature(
            resolution.staff.id,
            resolution.staff.eventId,
            input.invitationId,
            sortedIds
          );
          const prior = await tx.checkIn.findUnique({ where: { idempotencyKey } });
          if (prior) {
            if (prior.requestSignature !== signature || prior.staffTokenId !== resolution.staff.id) {
              throw idempotencyConflict();
            }
            return {
              response: this.responseFromSnapshot(prior),
              realtime: null
            };
          }

          await tx.$queryRaw`SELECT "id" FROM "invitation" WHERE "id" = ${input.invitationId}::uuid FOR UPDATE`;
          const invitation = await tx.invitation.findFirst({
            where: {
              id: input.invitationId,
              eventId: resolution.staff.eventId,
              deletedAt: null,
              cancelledAt: null,
              responseStatus: InvitationResponseStatus.CONFIRMED,
              contact: { deletedAt: null }
            },
            select: { id: true, eventId: true }
          });
          if (!invitation) throw scannerSelectionNotFound();

          await tx.$queryRaw`
            SELECT "id" FROM "assistant"
            WHERE "id" = ANY(ARRAY[${Prisma.join(sortedIds)}]::uuid[])
            ORDER BY "id"
            FOR UPDATE
          `;
          const assistants = await tx.assistant.findMany({
            where: {
              id: { in: sortedIds },
              eventId: invitation.eventId,
              invitationId: invitation.id,
              deletedAt: null,
              anonymizedAt: null,
              name: { not: null },
              responseStatus: AssistantResponseStatus.CONFIRMED
            },
            include: { floorplanShape: { select: { id: true, name: true } }, floorplanSeat: { select: { id: true, label: true, x: true, y: true } } },
            orderBy: { id: 'asc' }
          });
          if (assistants.length !== sortedIds.length) throw scannerSelectionNotFound();

          if (resolution.event.floorplanEnabled) {
            const floorplan = await tx.floorplan.findFirst({ where: { eventId: invitation.eventId, deletedAt: null }, select: { seatingMode: true } });
            const tableIds = [
              ...new Set(
                assistants.map(({ floorplanShapeId }) => floorplanShapeId).filter((id): id is string => id !== null)
              )
            ].sort();
            if (tableIds.length === 0 || assistants.some(({ floorplanShapeId }) => floorplanShapeId === null)) {
              throw scannerTableAssignmentRequired();
            }
            await tx.$queryRaw`
              SELECT "id" FROM "floorplan_shape"
              WHERE "id" = ANY(ARRAY[${Prisma.join(tableIds)}]::uuid[])
              ORDER BY "id"
              FOR UPDATE
            `;
            const validTables = await tx.floorplanShape.count({
              where: {
                id: { in: tableIds },
                eventId: invitation.eventId,
                kind: FloorplanShapeKind.TABLE,
                deletedAt: null,
                floorplan: { eventId: invitation.eventId, deletedAt: null }
              }
            });
            if (validTables !== tableIds.length) throw scannerTableAssignmentRequired();
            if (floorplan?.seatingMode === FloorplanSeatingMode.SEAT) {
              const assignedSeats = await tx.floorplanSeat.count({
                where: { id: { in: assistants.map(({ floorplanSeatId }) => floorplanSeatId).filter((id): id is string => id !== null) }, eventId: invitation.eventId, deletedAt: null, isBlocked: false }
              });
              if (assignedSeats !== assistants.length || assistants.some(({ floorplanSeatId }) => floorplanSeatId === null)) throw scannerSeatAssignmentRequired();
            }
          }

          await tx.$queryRaw`
            SELECT "id" FROM "check_in"
            WHERE "assistant_id" = ANY(ARRAY[${Prisma.join(sortedIds)}]::uuid[]) AND "reverted_at" IS NULL
            ORDER BY "assistant_id"
            FOR UPDATE
          `;
          const activeCount = await tx.checkIn.count({
            where: { assistantId: { in: sortedIds }, revertedAt: null }
          });
          if (activeCount > 0) throw assistantAlreadyCheckedIn();

          const timestampRows = await tx.$queryRaw<Array<{ checkedInAt: Date }>>`
            SELECT clock_timestamp() AS "checkedInAt"
          `;
          const checkedInAt = timestampRows[0]?.checkedInAt;
          if (!checkedInAt) throw new Error('PostgreSQL did not return a check-in timestamp.');
          const remaining = await tx.assistant.findMany({
            where: {
              invitationId: invitation.id,
              eventId: invitation.eventId,
              id: { notIn: sortedIds },
              deletedAt: null,
              anonymizedAt: null,
              name: { not: null },
              responseStatus: AssistantResponseStatus.CONFIRMED,
              checkIns: { none: { revertedAt: null } }
            },
            select: { id: true, name: true, isPrimary: true, floorplanShape: { select: { id: true, name: true } } },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }]
          });
          const checkedIn = assistants.map((assistant) => ({
            checkInId: randomUUID(),
            assistantId: assistant.id,
            name: requireAssistantName(assistant.name),
            checkedInAt: checkedInAt.toISOString(),
            table: assistant.floorplanShape
          }));
          const snapshot: ScannerCheckInResponseDto = {
            status: 'CHECKED_IN',
            invitationId: invitation.id,
            checkedIn,
            remainingPendingAssistants: remaining.map(({ id, name, isPrimary, floorplanShape }) => ({
              id,
              name: requireAssistantName(name),
              isPrimary,
              table: floorplanShape
            })),
            remainingPendingCount: remaining.length
          };
          const firstCheckIn = checkedIn[0];
          if (!firstCheckIn) throw new Error('Check-in selection cannot be empty.');
          const batchHash = createHash('sha256').update(`${idempotencyKey}\0${signature}`, 'utf8').digest('hex');
          for (const [index, item] of checkedIn.entries()) {
            await tx.checkIn.create({
              data: {
                id: item.checkInId,
                eventId: invitation.eventId,
                invitationId: invitation.id,
                assistantId: item.assistantId,
                staffTokenId: resolution.staff.id,
                checkedInAt,
                createdAt: checkedInAt,
                idempotencyKey: index === 0 ? idempotencyKey : `ci:${batchHash}:${index}`,
                requestSignature: signature,
                resultSnapshot: snapshot as unknown as Prisma.InputJsonObject
              }
            });
          }
          await this.audit.record(
            {
              actor: { type: AuditActorType.STAFF_TOKEN, id: resolution.staff.id },
              clientId: resolution.event.clientId,
              eventId: invitation.eventId,
              resourceType: 'CHECK_IN',
              resourceId: firstCheckIn.checkInId,
              action: 'CHECK_IN_CREATE',
              afterData: {
                invitationId: invitation.id,
                assistantIds: sortedIds,
                checkInIds: checkedIn.map(({ checkInId }) => checkInId),
                count: checkedIn.length,
                checkedInAt: checkedInAt.toISOString(),
                status: 'CHECKED_IN'
              },
              operationId: effectiveOperationId
            },
            tx
          );
          return {
            response: snapshot,
            realtime: {
              eventId: invitation.eventId,
              invitationId: invitation.id,
              operationId: effectiveOperationId,
              occurredAt: checkedInAt.toISOString(),
              checkIns: checkedIn.map(({ checkInId, assistantId, table }) => ({
                checkInId,
                assistantId,
                tableId: table?.id ?? null
              }))
            }
          };
        }, CRITICAL_TRANSACTION_OPTIONS);
        if (outcome.realtime) {
          await this.realtime.publishCheckInCreated(outcome.realtime);
        }
        return outcome.response;
      } catch (error) {
        if (isActiveCheckInUniqueError(error)) throw assistantAlreadyCheckedIn();
        if (isCheckInFloorplanTableError(error)) throw scannerTableAssignmentRequired();
        if (isRetryable(error) && attempt < MAX_ATTEMPTS - 1) continue;
        if (isIdempotencyUniqueError(error) && attempt < MAX_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new DomainError(
      'CHECK_IN_CONCURRENCY_CONFLICT',
      'The check-in operation could not be serialized.',
      HttpStatus.CONFLICT
    );
  }

  async revert(
    eventId: string,
    checkInId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<CheckInRevertResponseDto> {
    const effectiveOperationId = operationId ?? randomUUID();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
          const event = await tx.event.findFirst({
            where: { id: eventId, deletedAt: null, ...this.eventAccess.ownedWhere(principal) }
          });
          if (!event) throw eventNotFound();
          if (!REVERTIBLE.has(event.status)) {
            throw new DomainError(
              'CHECK_IN_REVERT_EVENT_NOT_ALLOWED',
              'Check-in cannot be reverted in the current Event state.',
              HttpStatus.CONFLICT
            );
          }
          const keyOwner = await tx.checkIn.findUnique({ where: { revertIdempotencyKey: idempotencyKey } });
          if (keyOwner && keyOwner.id !== checkInId) throw revertIdempotencyConflict();

          await tx.$queryRaw`SELECT "id" FROM "check_in" WHERE "id" = ${checkInId}::uuid FOR UPDATE`;
          const checkIn = await tx.checkIn.findFirst({ where: { id: checkInId, eventId } });
          if (!checkIn) throw checkInNotFound();
          if (checkIn.revertedAt) {
            if (checkIn.revertIdempotencyKey !== idempotencyKey) throw checkInAlreadyReverted();
            return {
              response: toRevertResponse(checkIn),
              realtime: null
            };
          }
          const timestampRows = await tx.$queryRaw<Array<{ revertedAt: Date }>>`
            SELECT clock_timestamp() AS "revertedAt"
          `;
          const revertedAt = timestampRows[0]?.revertedAt;
          if (!revertedAt) throw new Error('PostgreSQL did not return a reversal timestamp.');
          const updated = await tx.checkIn.update({
            where: { id: checkIn.id },
            data: { revertedAt, revertedByUserId: principal.userId, revertIdempotencyKey: idempotencyKey }
          });
          await this.audit.record(
            {
              actor: { type: AuditActorType.USER, id: principal.userId },
              clientId: event.clientId,
              eventId,
              resourceType: 'CHECK_IN',
              resourceId: checkIn.id,
              action: 'CHECK_IN_REVERT',
              beforeData: { checkInId: checkIn.id, assistantId: checkIn.assistantId, status: 'ACTIVE' },
              afterData: {
                checkInId: checkIn.id,
                assistantId: checkIn.assistantId,
                status: 'REVERTED',
                revertedAt: revertedAt.toISOString()
              },
              operationId: effectiveOperationId
            },
            tx
          );
          return {
            response: toRevertResponse(updated),
            realtime: {
              eventId,
              invitationId: checkIn.invitationId,
              operationId: effectiveOperationId,
              occurredAt: revertedAt.toISOString(),
              checkInId: checkIn.id,
              assistantId: checkIn.assistantId
            }
          };
        }, CRITICAL_TRANSACTION_OPTIONS);
        if (outcome.realtime) {
          await this.realtime.publishCheckInReverted(outcome.realtime);
        }
        return outcome.response;
      } catch (error) {
        if ((isRetryable(error) || isRevertKeyUniqueError(error)) && attempt < MAX_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new DomainError(
      'CHECK_IN_REVERT_CONCURRENCY_CONFLICT',
      'The check-in reversal could not be serialized.',
      HttpStatus.CONFLICT
    );
  }

  private async requireStaff(
    tx: Prisma.TransactionClient,
    rawToken: string
  ): Promise<Extract<StaffResolution, { kind: 'AVAILABLE' }>> {
    const result = await this.staffTokens.resolveStaffTokenInTransaction(tx, rawToken);
    if (result.kind === 'INVALID') {
      throw new UnauthorizedException({
        code: 'STAFF_TOKEN_INVALID_OR_EXPIRED',
        message: 'StaffToken is invalid or expired.'
      });
    }
    if (result.kind === 'EVENT_NOT_OPERATIONAL') {
      throw new ConflictException({
        code: 'STAFF_EVENT_NOT_OPERATIONAL',
        message: 'The StaffToken Event is not operational.'
      });
    }
    return result;
  }

  private loadScannerInvitation(
    tx: Prisma.TransactionClient,
    invitationId: string,
    eventId: string
  ): Promise<ScannerInvitation | null> {
    return tx.invitation.findFirst({
      where: {
        id: invitationId,
        eventId,
        deletedAt: null,
        cancelledAt: null,
        responseStatus: InvitationResponseStatus.CONFIRMED,
        contact: { deletedAt: null }
      },
      include: scannerInvitationInclude
    });
  }

  private responseFromSnapshot(checkIn: CheckIn): ScannerCheckInResponseDto {
    const parsed = checkInResultSnapshotSchema.safeParse(checkIn.resultSnapshot);
    if (!parsed.success) throw new Error('Invalid persisted check-in result snapshot.');
    return parsed.data;
  }

  private async lockedRead<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, LOCKED_READ_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isRetryable(error) && attempt < MAX_ATTEMPTS - 1) continue;
        throw error;
      }
    }
    throw new DomainError(
      'SCANNER_CONCURRENCY_CONFLICT',
      'The Scanner operation could not be serialized.',
      HttpStatus.CONFLICT
    );
  }
}

function projectInvitation(invitation: ScannerInvitation): ScannerInvitationResultDto {
  const pendingAssistants: PendingAssistantDto[] = invitation.assistants
    .filter(({ checkIns }) => checkIns.length === 0)
    .map(({ id, name, isPrimary, floorplanShape }) => ({
      id,
      name: name as string,
      isPrimary,
      table: floorplanShape
    }));
  return {
    invitation: { id: invitation.id, mode: invitation.mode },
    pendingAssistants,
    confirmedCount: invitation.assistants.length,
    pendingCount: pendingAssistants.length,
    checkedInCount: invitation.assistants.length - pendingAssistants.length
  };
}

function requestSignature(staffTokenId: string, eventId: string, invitationId: string, assistantIds: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ staffTokenId, eventId, invitationId, assistantIds }), 'utf8')
    .digest('hex');
}

function requireAssistantName(name: string | null): string {
  if (!name) throw scannerSelectionNotFound();
  return name;
}

function scannerQrNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SCANNER_QR_NOT_FOUND', message: 'Scanner QR not found.' });
}

function scannerSelectionNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SCANNER_SELECTION_NOT_FOUND', message: 'Scanner selection not found.' });
}

function checkInNotFound(): NotFoundException {
  return new NotFoundException({ code: 'CHECK_IN_NOT_FOUND', message: 'Check-in not found.' });
}

function assistantAlreadyCheckedIn(): DomainError {
  return new DomainError('ASSISTANT_ALREADY_CHECKED_IN', 'Assistant is already checked in.', HttpStatus.CONFLICT);
}

function scannerTableAssignmentRequired(): DomainError {
  return new DomainError(
    'SCANNER_TABLE_ASSIGNMENT_REQUIRED',
    'All selected Assistants require an active table assignment.',
    HttpStatus.CONFLICT
  );
}

function scannerSeatAssignmentRequired(): DomainError {
  return new DomainError('SCANNER_SEAT_ASSIGNMENT_REQUIRED', 'All selected Assistants require an active detailed seat assignment.', HttpStatus.CONFLICT);
}

function idempotencyConflict(): DomainError {
  return new DomainError(
    'CHECK_IN_IDEMPOTENCY_CONFLICT',
    'Idempotency-Key is already associated with another check-in request.',
    HttpStatus.CONFLICT
  );
}

function revertIdempotencyConflict(): DomainError {
  return new DomainError(
    'CHECK_IN_REVERT_IDEMPOTENCY_CONFLICT',
    'Idempotency-Key is already associated with another check-in reversal.',
    HttpStatus.CONFLICT
  );
}

function checkInAlreadyReverted(): DomainError {
  return new DomainError('CHECK_IN_ALREADY_REVERTED', 'Check-in was already reverted.', HttpStatus.CONFLICT);
}

function toRevertResponse(checkIn: CheckIn): CheckInRevertResponseDto {
  if (!checkIn.revertedAt) throw new Error('Reverted CheckIn requires revertedAt.');
  return {
    status: 'REVERTED',
    checkInId: checkIn.id,
    assistantId: checkIn.assistantId,
    revertedAt: checkIn.revertedAt.toISOString()
  };
}

function isRetryable(error: unknown): boolean {
  const code = prismaCode(error);
  return code === 'P2034' || String(error).includes('40001') || String(error).includes('40P01');
}

function prismaCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function isActiveCheckInUniqueError(error: unknown): boolean {
  return prismaCode(error) === 'P2002' && String(error).includes('assistant');
}

function isCheckInFloorplanTableError(error: unknown): boolean {
  if (String(error).includes('check_in_floorplan_table_required')) return true;
  if (typeof error !== 'object' || error === null || !('meta' in error)) return false;
  return String((error as { meta?: unknown }).meta).includes('check_in_floorplan_table_required');
}

function isIdempotencyUniqueError(error: unknown): boolean {
  return prismaCode(error) === 'P2002' && String(error).includes('idempotency');
}

function isRevertKeyUniqueError(error: unknown): boolean {
  return prismaCode(error) === 'P2002' && String(error).includes('revert');
}
