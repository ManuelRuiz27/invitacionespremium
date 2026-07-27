import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuditedMutationService, auditedResult } from '../audit/audited-mutation.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { activeWhere, assertPlatformAdminRestoration } from '../common/persistence/soft-delete.repository';
import { AuditActorType, EventStatus, Prisma, UserRole, type Event } from '../generated/prisma/client';
import { EventAccessPolicy, eventNotFound } from './event-access.policy';
import { resolvePreparationStatus } from './event-status.resolver';
import type { CreateEventInput, EventResponseDto, UpdateEventInput } from './events.dto';

const PREPARATION_STATUSES: readonly EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
];
const SOFT_DELETE_STATUSES: readonly EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE,
  EventStatus.CLOSED,
  EventStatus.ARCHIVED,
  EventStatus.CANCELLED
];

@Injectable()
export class EventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly accessPolicy: EventAccessPolicy
  ) {}

  async listOwned(principal: AuthPrincipal): Promise<EventResponseDto[]> {
    const events = await this.prisma.event.findMany({
      where: activeWhere(this.accessPolicy.ownedWhere(principal)),
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });
    return events.map(toEventResponse);
  }

  async getOwned(eventId: string, principal: AuthPrincipal): Promise<EventResponseDto> {
    return toEventResponse(await this.findOwnedEvent(this.prisma, eventId, principal));
  }

  async listAdmin(): Promise<EventResponseDto[]> {
    const events = await this.prisma.event.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });
    return events.map(toEventResponse);
  }

  async getAdmin(eventId: string): Promise<EventResponseDto> {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) {
      throw eventNotFound();
    }
    return toEventResponse(event);
  }

  async create(input: CreateEventInput, principal: AuthPrincipal, operationId?: string): Promise<EventResponseDto> {
    const clientId = requireClientId(principal);
    const prepared = preparationData(input);

    return this.prisma.$transaction(async (transaction) => {
      await this.requireAvailableService(transaction, prepared.serviceId);
      const event = await transaction.event.create({
        data: {
          clientId,
          createdByUserId: principal.userId,
          ...prepared,
          status: resolvePreparationStatus(prepared)
        }
      });
      await this.audit.record(
        {
          actor: { type: AuditActorType.USER, id: principal.userId },
          clientId,
          eventId: event.id,
          resourceType: 'EVENT',
          resourceId: event.id,
          action: 'EVENT_CREATE',
          afterData: eventAuditSnapshot(event),
          ...(operationId === undefined ? {} : { operationId })
        },
        transaction
      );
      return toEventResponse(event);
    }, CRITICAL_TRANSACTION_OPTIONS);
  }

  async update(
    eventId: string,
    input: UpdateEventInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<EventResponseDto> {
    const current = await this.findOwnedEvent(this.prisma, eventId, principal);
    if (!PREPARATION_STATUSES.includes(current.status)) {
      throw invalidEventState('Only Events in preparation may be edited.');
    }

    return this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: principal.userId },
      clientId: current.clientId,
      eventId,
      resourceType: 'EVENT',
      resourceId: eventId,
      action: 'EVENT_UPDATE',
      beforeData: eventAuditSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const merged = mergePreparationData(current, input);
        await this.requireAvailableService(transaction, merged.serviceId);
        const event = await transaction.event.update({
          where: { id: eventId },
          data: {
            ...updateData(input),
            status: resolvePreparationStatus(merged)
          }
        });
        return auditedResult(toEventResponse(event), eventAuditSnapshot(event));
      }
    });
  }

  async softDelete(eventId: string, principal: AuthPrincipal, operationId?: string): Promise<void> {
    const current = await this.findOwnedEvent(this.prisma, eventId, principal);
    if (!SOFT_DELETE_STATUSES.includes(current.status)) {
      throw invalidEventState('Event cannot be deleted in its current state.');
    }

    await this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: principal.userId },
      clientId: current.clientId,
      eventId,
      resourceType: 'EVENT',
      resourceId: eventId,
      action: 'EVENT_SOFT_DELETE',
      beforeData: eventAuditSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const event = await transaction.event.update({
          where: { id: eventId },
          data: { deletedAt: new Date() }
        });
        return auditedResult(undefined, eventAuditSnapshot(event));
      }
    });
  }

  async restoreAdmin(eventId: string, principal: AuthPrincipal, operationId?: string): Promise<EventResponseDto> {
    assertPlatformAdminRestoration({
      actorType: AuditActorType.USER,
      isPlatformAdmin: principal.role === UserRole.PLATFORM_ADMIN
    });
    const current = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: { not: null } } });
    if (!current) {
      throw eventNotFound();
    }

    return this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: principal.userId },
      clientId: current.clientId,
      eventId,
      resourceType: 'EVENT',
      resourceId: eventId,
      action: 'EVENT_RESTORE',
      beforeData: eventAuditSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const event = await transaction.event.update({
          where: { id: eventId },
          data: { deletedAt: null }
        });
        return auditedResult(toEventResponse(event), eventAuditSnapshot(event));
      }
    });
  }

  async softDeleteExpiredDrafts(at: Date = new Date()): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const expired = await transaction.event.findMany({
        where: {
          status: EventStatus.DRAFT,
          eventDateTime: { lt: at },
          deletedAt: null
        }
      });
      let deleted = 0;

      for (const event of expired) {
        const result = await transaction.event.updateMany({
          where: {
            id: event.id,
            status: EventStatus.DRAFT,
            eventDateTime: { lt: at },
            deletedAt: null
          },
          data: { deletedAt: at }
        });
        if (result.count !== 1) {
          continue;
        }
        deleted += 1;
        await this.audit.record(
          {
            actor: { type: AuditActorType.SYSTEM },
            clientId: event.clientId,
            eventId: event.id,
            resourceType: 'EVENT',
            resourceId: event.id,
            action: 'EVENT_EXPIRED_DRAFT_SOFT_DELETE',
            beforeData: eventAuditSnapshot(event),
            afterData: { ...eventAuditSnapshot(event), deletedAt: at }
          },
          transaction
        );
      }

      return deleted;
    }, CRITICAL_TRANSACTION_OPTIONS);
  }

  private async findOwnedEvent(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<Event> {
    const event = await database.event.findFirst({
      where: activeWhere({ id: eventId, ...this.accessPolicy.ownedWhere(principal) })
    });
    if (!event) {
      throw eventNotFound();
    }
    return event;
  }

  private async requireAvailableService(
    database: PrismaService | Prisma.TransactionClient,
    serviceId: string | null
  ): Promise<void> {
    if (serviceId === null) {
      return;
    }
    const service = await database.service.findFirst({
      where: { id: serviceId, isActive: true },
      select: { id: true }
    });
    if (!service) {
      throw new BadRequestException({
        code: 'EVENT_SERVICE_NOT_AVAILABLE',
        message: 'Event service does not exist or is inactive.'
      });
    }
  }
}

function preparationData(input: CreateEventInput) {
  return {
    name: input.name ?? null,
    serviceId: input.serviceId ?? null,
    socialType: input.socialType ?? null,
    eventDateTime: input.eventDateTime == null ? null : new Date(input.eventDateTime),
    timeZone: input.timeZone ?? null,
    capacity: input.capacity ?? null,
    confirmationEnabled: input.confirmationEnabled ?? false,
    floorplanEnabled: input.floorplanEnabled ?? false
  };
}

function mergePreparationData(current: Event, input: UpdateEventInput) {
  return {
    name: input.name === undefined ? current.name : input.name,
    serviceId: input.serviceId === undefined ? current.serviceId : input.serviceId,
    socialType: input.socialType === undefined ? current.socialType : input.socialType,
    eventDateTime:
      input.eventDateTime === undefined
        ? current.eventDateTime
        : input.eventDateTime === null
          ? null
          : new Date(input.eventDateTime),
    timeZone: input.timeZone === undefined ? current.timeZone : input.timeZone,
    capacity: input.capacity === undefined ? current.capacity : input.capacity
  };
}

function updateData(input: UpdateEventInput): Prisma.EventUpdateInput {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.serviceId === undefined
      ? {}
      : { service: input.serviceId === null ? { disconnect: true } : { connect: { id: input.serviceId } } }),
    ...(input.socialType === undefined ? {} : { socialType: input.socialType }),
    ...(input.eventDateTime === undefined
      ? {}
      : { eventDateTime: input.eventDateTime === null ? null : new Date(input.eventDateTime) }),
    ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
    ...(input.capacity === undefined ? {} : { capacity: input.capacity }),
    ...(input.confirmationEnabled === undefined ? {} : { confirmationEnabled: input.confirmationEnabled }),
    ...(input.floorplanEnabled === undefined ? {} : { floorplanEnabled: input.floorplanEnabled })
  };
}

function requireClientId(principal: AuthPrincipal): string {
  if (!principal.clientId) {
    throw eventNotFound();
  }
  return principal.clientId;
}

function invalidEventState(message: string): ConflictException {
  return new ConflictException({ code: 'EVENT_INVALID_STATE_TRANSITION', message });
}

function eventAuditSnapshot(event: Event): Record<string, unknown> {
  return {
    id: event.id,
    clientId: event.clientId,
    createdByUserId: event.createdByUserId,
    serviceId: event.serviceId,
    name: event.name,
    socialType: event.socialType,
    status: event.status,
    eventDateTime: event.eventDateTime,
    timeZone: event.timeZone,
    capacity: event.capacity,
    confirmationEnabled: event.confirmationEnabled,
    floorplanEnabled: event.floorplanEnabled,
    deletedAt: event.deletedAt
  };
}

export function toEventResponse(event: Event): EventResponseDto {
  return {
    id: event.id,
    clientId: event.clientId,
    createdByUserId: event.createdByUserId,
    serviceId: event.serviceId,
    name: event.name,
    socialType: event.socialType,
    status: event.status,
    eventDateTime: event.eventDateTime?.toISOString() ?? null,
    timeZone: event.timeZone,
    capacity: event.capacity,
    confirmationEnabled: event.confirmationEnabled,
    floorplanEnabled: event.floorplanEnabled,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    deletedAt: event.deletedAt?.toISOString() ?? null
  };
}
