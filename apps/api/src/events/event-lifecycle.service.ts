import { ConflictException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { AuditActorType, EventStateAction, EventStatus, Prisma, type Event } from '../generated/prisma/client';
import { EventAccessPolicy, eventNotFound } from './event-access.policy';
import type { EventResponseDto } from './events.dto';
import { eventAuditSnapshot, toEventResponse } from './events.service';

const MAX_TRANSACTION_ATTEMPTS = 20;

@Injectable()
export class EventLifecycleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly accessPolicy: EventAccessPolicy
  ) {}

  close(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<EventResponseDto> {
    return this.transition(eventId, EventStateAction.CLOSE, idempotencyKey, principal, operationId);
  }

  reopen(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string,
    at: Date = new Date()
  ): Promise<EventResponseDto> {
    return this.transition(eventId, EventStateAction.REOPEN, idempotencyKey, principal, operationId, at);
  }

  cancel(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<EventResponseDto> {
    return this.transition(eventId, EventStateAction.CANCEL, idempotencyKey, principal, operationId);
  }

  archive(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<EventResponseDto> {
    return this.transition(eventId, EventStateAction.ARCHIVE, idempotencyKey, principal, operationId);
  }

  async advanceEventsToEventDay(at: Date = new Date()): Promise<number> {
    const candidates = await this.prisma.event.findMany({
      where: {
        status: EventStatus.ACTIVE,
        eventDateTime: { not: null },
        timeZone: { not: null },
        deletedAt: null
      },
      select: {
        id: true,
        eventDateTime: true,
        timeZone: true
      },
      orderBy: { id: 'asc' }
    });
    let transitioned = 0;

    for (const candidate of candidates) {
      if (
        !candidate.eventDateTime ||
        !candidate.timeZone ||
        !isSameLocalDate(at, candidate.eventDateTime, candidate.timeZone)
      ) {
        continue;
      }
      if (await this.advanceOneToEventDay(candidate.id, at)) {
        transitioned += 1;
      }
    }

    return transitioned;
  }

  private async transition(
    eventId: string,
    action: EventStateAction,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string,
    at: Date = new Date()
  ): Promise<EventResponseDto> {
    const replayEvent = await this.findOwnedEventForReplay(this.prisma, eventId, principal);
    const prior = await this.findResult(eventId, action, idempotencyKey);
    if (prior) {
      return prior;
    }
    if (replayEvent.deletedAt !== null) {
      throw eventNotFound();
    }

    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          await lockEvent(transaction, eventId);
          const current = await this.findOwnedEventForReplay(transaction, eventId, principal);
          const repeated = await this.findResult(eventId, action, idempotencyKey, transaction);
          if (repeated) {
            return repeated;
          }
          if (current.deletedAt !== null) {
            throw eventNotFound();
          }

          const targetStatus = resolveTargetStatus(action, current, at);
          const event = await transaction.event.update({
            where: { id: eventId },
            data: { status: targetStatus }
          });
          const result = toEventResponse(event);
          await this.audit.record(
            {
              actor: { type: AuditActorType.USER, id: principal.userId },
              clientId: current.clientId,
              eventId,
              resourceType: 'EVENT',
              resourceId: eventId,
              action: auditAction(action),
              beforeData: eventAuditSnapshot(current),
              afterData: eventAuditSnapshot(event),
              ...(operationId === undefined ? {} : { operationId })
            },
            transaction
          );
          await transaction.eventStateOperation.create({
            data: {
              eventId,
              action,
              idempotencyKey,
              resultSnapshot: result as unknown as Prisma.InputJsonObject
            }
          });
          return result;
        }, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (hasPrismaCode(error, 'P2002')) {
          await this.findOwnedEventForReplay(this.prisma, eventId, principal);
          const raced = await this.findResult(eventId, action, idempotencyKey);
          if (raced) {
            return raced;
          }
        }
        if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS - 1) {
          await waitForRetry(attempt);
          continue;
        }
        throw error;
      }
    }

    throw new DomainError(
      'EVENT_STATE_TRANSITION_CONFLICT',
      'Event state transition could not be serialized.',
      HttpStatus.CONFLICT
    );
  }

  private async advanceOneToEventDay(eventId: string, at: Date): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          await lockEvent(transaction, eventId);
          const current = await transaction.event.findFirst({
            where: {
              id: eventId,
              status: EventStatus.ACTIVE,
              deletedAt: null
            }
          });
          if (
            !current?.eventDateTime ||
            !current.timeZone ||
            !isSameLocalDate(at, current.eventDateTime, current.timeZone)
          ) {
            return false;
          }

          const event = await transaction.event.update({
            where: { id: eventId },
            data: { status: EventStatus.EVENT_DAY }
          });
          const result = toEventResponse(event);
          await this.audit.record(
            {
              actor: { type: AuditActorType.SYSTEM },
              clientId: current.clientId,
              eventId,
              resourceType: 'EVENT',
              resourceId: eventId,
              action: 'EVENT_ENTER_EVENT_DAY',
              beforeData: eventAuditSnapshot(current),
              afterData: eventAuditSnapshot(event)
            },
            transaction
          );
          await transaction.eventStateOperation.create({
            data: {
              eventId,
              action: EventStateAction.EVENT_DAY,
              idempotencyKey: `system:event-day:${eventId}:${localDateKey(at, current.timeZone)}`,
              resultSnapshot: result as unknown as Prisma.InputJsonObject
            }
          });
          return true;
        }, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (hasPrismaCode(error, 'P2002')) {
          return false;
        }
        if (isRetryableTransactionError(error) && attempt < MAX_TRANSACTION_ATTEMPTS - 1) {
          await waitForRetry(attempt);
          continue;
        }
        throw error;
      }
    }

    throw new DomainError(
      'EVENT_DAY_TRANSITION_CONFLICT',
      'Automatic EVENT_DAY transition could not be serialized.',
      HttpStatus.CONFLICT
    );
  }

  private async findOwnedEventForReplay(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<Event> {
    const event = await database.event.findFirst({
      where: { id: eventId, ...this.accessPolicy.ownedWhere(principal) }
    });
    if (!event) {
      throw eventNotFound();
    }
    return event;
  }

  private async findResult(
    eventId: string,
    action: EventStateAction,
    idempotencyKey: string,
    database: PrismaService | Prisma.TransactionClient = this.prisma
  ): Promise<EventResponseDto | null> {
    const operation = await database.eventStateOperation.findUnique({
      where: { idempotencyKey },
      select: {
        eventId: true,
        action: true,
        resultSnapshot: true
      }
    });
    if (!operation) {
      return null;
    }
    if (operation.eventId !== eventId || operation.action !== action) {
      throw new DomainError(
        'EVENT_STATE_IDEMPOTENCY_CONFLICT',
        'Idempotency key is already assigned to another Event state action.',
        HttpStatus.CONFLICT
      );
    }
    return operation.resultSnapshot as unknown as EventResponseDto;
  }
}

function resolveTargetStatus(action: EventStateAction, event: Event, at: Date): EventStatus {
  switch (action) {
    case EventStateAction.CLOSE:
      if (event.status === EventStatus.ACTIVE || event.status === EventStatus.EVENT_DAY) {
        return EventStatus.CLOSED;
      }
      break;
    case EventStateAction.REOPEN:
      if (event.status === EventStatus.CLOSED && event.eventDateTime && event.timeZone) {
        return isSameLocalDate(at, event.eventDateTime, event.timeZone) ? EventStatus.EVENT_DAY : EventStatus.ACTIVE;
      }
      break;
    case EventStateAction.CANCEL:
      if (
        event.status === EventStatus.DRAFT ||
        event.status === EventStatus.CONFIGURED ||
        event.status === EventStatus.READY_TO_ACTIVATE ||
        event.status === EventStatus.ACTIVE ||
        event.status === EventStatus.EVENT_DAY
      ) {
        return EventStatus.CANCELLED;
      }
      break;
    case EventStateAction.ARCHIVE:
      if (event.status === EventStatus.CLOSED || event.status === EventStatus.ALBUM_PUBLISHED) {
        return EventStatus.ARCHIVED;
      }
      break;
    case EventStateAction.EVENT_DAY:
      break;
  }

  throw new ConflictException({
    code: 'EVENT_INVALID_STATE_TRANSITION',
    message: `Event cannot perform ${action} from ${event.status}.`
  });
}

function auditAction(action: EventStateAction): string {
  switch (action) {
    case EventStateAction.CLOSE:
      return 'EVENT_CLOSE';
    case EventStateAction.REOPEN:
      return 'EVENT_REOPEN';
    case EventStateAction.CANCEL:
      return 'EVENT_CANCEL';
    case EventStateAction.ARCHIVE:
      return 'EVENT_ARCHIVE';
    case EventStateAction.EVENT_DAY:
      return 'EVENT_ENTER_EVENT_DAY';
  }
}

async function lockEvent(transaction: Prisma.TransactionClient, eventId: string): Promise<void> {
  await transaction.$queryRaw`
    SELECT "id"
    FROM "event"
    WHERE "id" = ${eventId}::uuid
    FOR UPDATE
  `;
}

export function isSameLocalDate(left: Date, right: Date, timeZone: string): boolean {
  return localDateKey(left, timeZone) === localDateKey(right, timeZone);
}

export function localDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function isRetryableTransactionError(error: unknown): boolean {
  if (hasPrismaCode(error, 'P2034')) {
    return true;
  }
  if (!hasPrismaCode(error, 'P2010') || typeof error !== 'object' || error === null || !('meta' in error)) {
    return false;
  }
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) {
    return false;
  }
  const code = 'code' in meta ? (meta as { code?: unknown }).code : undefined;
  const driverError =
    'driverAdapterError' in meta ? String((meta as { driverAdapterError?: unknown }).driverAdapterError) : '';
  return code === '40001' || code === '40P01' || driverError.includes('TransactionWriteConflict');
}

function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.min(100, 5 * (attempt + 1)));
  });
}
