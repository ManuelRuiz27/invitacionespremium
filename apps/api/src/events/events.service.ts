import { BadRequestException, ConflictException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuditedMutationService, auditedResult } from '../audit/audited-mutation.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { activeWhere, assertPlatformAdminRestoration } from '../common/persistence/soft-delete.repository';
import {
  AuditActorType,
  ClientStatus,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  InvitationDesignType,
  Prisma,
  ServiceCode,
  UserRole,
  type Event
} from '../generated/prisma/client';
import { FinanceService } from '../finance/finance.service';
import { resolveDesignReadiness } from '../invitation-design/invitation-design.readiness';
import { resolveFloorplanReadiness } from '../floorplan/floorplan-readiness.service';
import {
  recomputePhysicalPassPreparationStatus,
  resolvePhysicalPassReadiness
} from '../physical-passes/physical-pass-readiness.service';
import { ServicesPricingService } from '../services-pricing/services-pricing.service';
import { EventAccessPolicy, eventNotFound } from './event-access.policy';
import { recomputeDigitalEventPreparationStatus } from './digital-event-readiness.service';
import { resolvePreparationStatus } from './event-status.resolver';
import type { CreateEventInput, EventActivationResponseDto, EventResponseDto, UpdateEventInput } from './events.dto';

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
export const EVENT_SERVICE_INCLUDE = {
  service: { select: { code: true } }
} satisfies Prisma.EventInclude;
type EventWithService = Prisma.EventGetPayload<{ include: typeof EVENT_SERVICE_INCLUDE }>;

@Injectable()
export class EventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly accessPolicy: EventAccessPolicy,
    @Inject(FinanceService) private readonly finance: FinanceService,
    @Inject(ServicesPricingService) private readonly pricing: ServicesPricingService
  ) {}

  async listOwned(principal: AuthPrincipal): Promise<EventResponseDto[]> {
    const events = await this.prisma.event.findMany({
      where: activeWhere(this.accessPolicy.ownedWhere(principal)),
      include: EVENT_SERVICE_INCLUDE,
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
      include: EVENT_SERVICE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });
    return events.map(toEventResponse);
  }

  async getAdmin(eventId: string): Promise<EventResponseDto> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: EVENT_SERVICE_INCLUDE
    });
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
      const created = await transaction.event.create({
        data: {
          clientId,
          createdByUserId: principal.userId,
          ...prepared,
          status: resolvePreparationStatus(prepared)
        }
      });
      await recomputeDigitalEventPreparationStatus(transaction, created.id);
      await recomputePhysicalPassPreparationStatus(transaction, created.id);
      const event = await transaction.event.findUniqueOrThrow({
        where: { id: created.id },
        include: EVENT_SERVICE_INCLUDE
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
        await transaction.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
        const locked = await this.findOwnedEvent(transaction, eventId, principal);
        if (!PREPARATION_STATUSES.includes(locked.status)) {
          throw invalidEventState('Only Events in preparation may be edited.');
        }
        const merged = mergePreparationData(locked, input);
        await this.requireAvailableService(transaction, merged.serviceId);
        await this.resetIncompatibleDigitalDesign(transaction, locked, merged.serviceId, input, principal, operationId);
        await transaction.event.update({
          where: { id: eventId },
          data: {
            ...updateData(input),
            status: resolvePreparationStatus(merged)
          }
        });
        await recomputeDigitalEventPreparationStatus(transaction, eventId);
        await recomputePhysicalPassPreparationStatus(transaction, eventId);
        const event = await transaction.event.findUniqueOrThrow({
          where: { id: eventId },
          include: EVENT_SERVICE_INCLUDE
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

  async activate(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<EventActivationResponseDto> {
    const replayEvent = await this.findOwnedEventForReplay(this.prisma, eventId, principal);
    const prior = await this.findActivationResult(eventId, idempotencyKey);
    if (prior) {
      return prior;
    }
    if (replayEvent.deletedAt !== null) {
      throw eventNotFound();
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          await transaction.$queryRaw`
            SELECT "id"
            FROM "event"
            WHERE "id" = ${eventId}::uuid
            FOR UPDATE
          `;
          let current = await this.findOwnedEventForReplay(transaction, eventId, principal);
          const repeated = await this.findActivationResult(eventId, idempotencyKey, transaction);
          if (repeated) {
            return repeated;
          }
          if (current.deletedAt !== null) {
            throw eventNotFound();
          }
          const client = await transaction.client.findFirst({
            where: { id: current.clientId, deletedAt: null },
            select: { type: true, status: true }
          });
          if (!client || client.status !== ClientStatus.ACTIVE) {
            throw new DomainError(
              'CLIENT_NOT_ACTIVE',
              'Event activation requires an active Client.',
              HttpStatus.CONFLICT
            );
          }
          if (!current.serviceId) {
            throw new DomainError(
              'EVENT_SERVICE_NOT_AVAILABLE',
              'Event activation requires an active service.',
              HttpStatus.CONFLICT
            );
          }
          const service = await transaction.service.findFirst({
            where: { id: current.serviceId, isActive: true },
            select: { id: true, code: true }
          });
          if (!service) {
            throw new DomainError(
              'EVENT_SERVICE_NOT_AVAILABLE',
              'Event service does not exist or is inactive.',
              HttpStatus.CONFLICT
            );
          }
          if (service.code === ServiceCode.DEMO) {
            throw new DomainError(
              'EVENT_DEMO_NOT_ACTIVATABLE',
              'Demo service cannot be activated as a real Event.',
              HttpStatus.CONFLICT
            );
          }
          if (
            (service.code === ServiceCode.FLYER || service.code === ServiceCode.FLIPBOOK) &&
            PREPARATION_STATUSES.includes(current.status)
          ) {
            await recomputeDigitalEventPreparationStatus(transaction, eventId);
            current = await this.findOwnedEventForReplay(transaction, eventId, principal);
          }
          if (service.code === ServiceCode.PHYSICAL_QR && PREPARATION_STATUSES.includes(current.status)) {
            await recomputePhysicalPassPreparationStatus(transaction, eventId);
            current = await this.findOwnedEventForReplay(transaction, eventId, principal);
          }
          if (current.status !== EventStatus.READY_TO_ACTIVATE) {
            throw invalidEventState('Only a ready Event may be activated.');
          }
          if (service.code === ServiceCode.FLYER || service.code === ServiceCode.FLIPBOOK) {
            const designReadiness = await resolveDesignReadiness(transaction, eventId, service.code);
            if (!designReadiness.complete) {
              throw new DomainError(
                'EVENT_INVITATION_DESIGN_INCOMPLETE',
                'Event invitation design is incomplete.',
                HttpStatus.CONFLICT,
                { blockers: designReadiness.blockers }
              );
            }
            const activeInvitation = await transaction.invitation.findFirst({
              where: { eventId, deletedAt: null, cancelledAt: null, contact: { deletedAt: null } },
              select: { id: true }
            });
            const publicInvitationBlockers = [
              ...(current.confirmationEnabled ? [] : ['EVENT_CONFIRMATION_NOT_ENABLED']),
              ...(current.locationUrl ? [] : ['EVENT_LOCATION_URL_MISSING']),
              ...(current.giftRegistryUrl ? [] : ['EVENT_GIFT_REGISTRY_URL_MISSING']),
              ...(activeInvitation ? [] : ['EVENT_ACTIVE_INVITATION_MISSING'])
            ];
            if (publicInvitationBlockers.length > 0) {
              throw new DomainError(
                'EVENT_PUBLIC_INVITATION_PREFLIGHT_INCOMPLETE',
                'Event public invitation configuration is incomplete.',
                HttpStatus.CONFLICT,
                { blockers: publicInvitationBlockers }
              );
            }
          }
          if (service.code === ServiceCode.PHYSICAL_QR) {
            const physicalPassReadiness = await resolvePhysicalPassReadiness(transaction, eventId);
            if (!physicalPassReadiness.complete) {
              throw new DomainError(
                'EVENT_PHYSICAL_PASSES_INCOMPLETE',
                'Event physical passes are incomplete.',
                HttpStatus.CONFLICT,
                { blockers: physicalPassReadiness.blockers }
              );
            }
          }
          if (current.floorplanEnabled) {
            const floorplanReadiness = await resolveFloorplanReadiness(transaction, eventId);
            if (!floorplanReadiness.complete) {
              throw new DomainError(
                'EVENT_FLOORPLAN_INCOMPLETE',
                'Event Floorplan is incomplete.',
                HttpStatus.CONFLICT,
                { blockers: floorplanReadiness.blockers }
              );
            }
          }

          const activatedAt = new Date();
          const price = await this.pricing.resolveCurrentPriceInTransaction(
            transaction,
            service.code,
            client.type,
            activatedAt
          );
          const baseCostCredits = price.credits;
          const promotionDiscountCredits = 0 as const;
          const finalCostCredits = baseCostCredits;
          const financial = await this.finance.consumeEventActivation(transaction, {
            clientId: current.clientId,
            eventId,
            actorUserId: principal.userId,
            serviceId: service.id,
            servicePriceId: price.id,
            baseCostCredits,
            promotionDiscountCredits,
            finalCostCredits,
            idempotencyKey,
            at: activatedAt
          });
          const event = await transaction.event.update({
            where: { id: eventId },
            include: EVENT_SERVICE_INCLUDE,
            data: {
              status: EventStatus.ACTIVE,
              activatedAt,
              activatedByUserId: principal.userId,
              activatedServiceId: service.id,
              activatedServicePriceId: price.id,
              baseCostCredits,
              promotionDiscountCredits,
              finalCostCredits,
              purchasedCreditsUsed: financial.purchasedCreditsUsed,
              creditLineCreditsUsed: financial.creditLineCreditsUsed,
              creditUnitValueMxnCentsSnapshot: financial.creditUnitValueMxnCentsSnapshot,
              activationReceiptId: financial.receipt.id,
              activationIdempotencyKey: idempotencyKey
            }
          });
          const result: EventActivationResponseDto = {
            event: toEventResponse(event),
            baseCostCredits,
            promotionDiscountCredits,
            finalCostCredits,
            purchasedCreditsUsed: financial.purchasedCreditsUsed,
            creditLineCreditsUsed: financial.creditLineCreditsUsed,
            movements: financial.movements,
            receipt: financial.receipt,
            balance: financial.balance
          };
          await transaction.receipt.update({
            where: { id: financial.receipt.id },
            data: { resultSnapshot: result as unknown as Prisma.InputJsonObject }
          });
          await this.audit.record(
            {
              actor: { type: AuditActorType.USER, id: principal.userId },
              clientId: current.clientId,
              eventId,
              resourceType: 'EVENT',
              resourceId: eventId,
              action: 'EVENT_ACTIVATE',
              beforeData: eventAuditSnapshot(current),
              afterData: eventAuditSnapshot(event),
              ...(operationId === undefined ? {} : { operationId })
            },
            transaction
          );
          return result;
        }, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (hasPrismaCode(error, 'P2002')) {
          await this.findOwnedEventForReplay(this.prisma, eventId, principal);
          const raced = await this.findActivationResult(eventId, idempotencyKey);
          if (raced) {
            return raced;
          }
        }
        if (isRetryableTransactionError(error) && attempt < 19) {
          await waitForRetry(attempt);
          continue;
        }
        throw error;
      }
    }

    throw new DomainError(
      'EVENT_ACTIVATION_CONFLICT',
      'Event activation could not be serialized.',
      HttpStatus.CONFLICT
    );
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
          include: EVENT_SERVICE_INCLUDE,
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
  ): Promise<EventWithService> {
    const event = await database.event.findFirst({
      where: activeWhere({ id: eventId, ...this.accessPolicy.ownedWhere(principal) }),
      include: EVENT_SERVICE_INCLUDE
    });
    if (!event) {
      throw eventNotFound();
    }
    return event;
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

  private async resetIncompatibleDigitalDesign(
    transaction: Prisma.TransactionClient,
    current: EventWithService,
    targetServiceId: string | null,
    input: UpdateEventInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<void> {
    if (!input.serviceId || input.serviceId === current.serviceId || !isDigitalService(current.service?.code)) return;
    const target = await transaction.service.findFirst({
      where: { id: targetServiceId ?? '', isActive: true },
      select: { code: true }
    });
    if (!target || !isDigitalService(target.code) || target.code === current.service?.code) return;

    const design = await transaction.invitationDesign.findFirst({
      where: { eventId: current.id, deletedAt: null },
      include: { pages: { where: { deletedAt: null }, orderBy: { position: 'asc' } } }
    });
    const targetType = target.code === ServiceCode.FLYER ? InvitationDesignType.FLYER : InvitationDesignType.FLIPBOOK;
    if (!design || design.type === targetType) return;
    if (input.resetInvitationDesign !== true) {
      throw new DomainError(
        'EVENT_INVITATION_DESIGN_RESET_REQUIRED',
        'Changing the digital service requires explicit consent to reset the incompatible invitation design.',
        HttpStatus.CONFLICT
      );
    }

    const at = new Date();
    const assets = [
      ...(design.flyerInitialAssetId
        ? [{ id: design.flyerInitialAssetId, ownerType: FileAssetOwnerType.FLYER, ownerId: design.id }]
        : []),
      ...(design.flyerQrAssetId
        ? [{ id: design.flyerQrAssetId, ownerType: FileAssetOwnerType.FLYER, ownerId: design.id }]
        : []),
      ...design.pages.map((page) => ({
        id: page.fileAssetId,
        ownerType: FileAssetOwnerType.FLIPBOOK_PAGE,
        ownerId: page.id
      }))
    ];
    await transaction.hotspot.updateMany({ where: { designId: design.id, deletedAt: null }, data: { deletedAt: at } });
    await transaction.flipbookPage.updateMany({
      where: { designId: design.id, deletedAt: null },
      data: { deletedAt: at }
    });
    await transaction.invitationDesign.update({ where: { id: design.id }, data: { deletedAt: at } });

    for (const reference of assets) {
      await transaction.$queryRaw`SELECT "id" FROM "file_asset" WHERE "id" = ${reference.id}::uuid FOR UPDATE`;
      const asset = await transaction.fileAsset.findUnique({ where: { id: reference.id } });
      if (
        !asset ||
        asset.deletedAt !== null ||
        asset.status !== FileAssetStatus.READY ||
        asset.ownerType !== reference.ownerType ||
        asset.ownerId !== reference.ownerId
      ) {
        continue;
      }
      const hidden = await transaction.fileAsset.update({
        where: { id: asset.id },
        data: { status: FileAssetStatus.HIDDEN }
      });
      await this.audit.record(
        {
          actor: { type: AuditActorType.USER, id: principal.userId },
          clientId: hidden.clientId,
          eventId: current.id,
          resourceType: 'FILE_ASSET',
          resourceId: hidden.id,
          action: 'FILE_ASSET_HIDE',
          afterData: {
            id: hidden.id,
            ownerType: hidden.ownerType,
            ownerId: hidden.ownerId,
            fileType: hidden.fileType,
            status: hidden.status
          },
          ...(operationId === undefined ? {} : { operationId })
        },
        transaction
      );
    }

    await this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        clientId: current.clientId,
        eventId: current.id,
        resourceType: 'INVITATION_DESIGN',
        resourceId: design.id,
        action: 'INVITATION_DESIGN_RESET_FOR_SERVICE_CHANGE',
        beforeData: { id: design.id, type: design.type, deletedAt: null },
        afterData: { id: design.id, type: design.type, deletedAt: at, targetService: target.code },
        ...(operationId === undefined ? {} : { operationId })
      },
      transaction
    );
  }

  private async findActivationResult(
    eventId: string,
    idempotencyKey: string,
    database: PrismaService | Prisma.TransactionClient = this.prisma
  ): Promise<EventActivationResponseDto | null> {
    const receipt = await database.receipt.findUnique({
      where: { idempotencyKey },
      select: {
        operationType: true,
        operationReference: true,
        resultSnapshot: true
      }
    });
    if (!receipt) {
      return null;
    }
    if (receipt.operationType !== 'EVENT_ACTIVATION' || receipt.operationReference !== eventId) {
      throw new DomainError(
        'EVENT_ACTIVATION_IDEMPOTENCY_CONFLICT',
        'Idempotency key is already assigned to another operation or Event.',
        HttpStatus.CONFLICT
      );
    }
    return receipt.resultSnapshot as unknown as EventActivationResponseDto;
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
    locationUrl: input.locationUrl ?? null,
    giftRegistryUrl: input.giftRegistryUrl ?? null,
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
    capacity: input.capacity === undefined ? current.capacity : input.capacity,
    confirmationEnabled:
      input.confirmationEnabled === undefined ? current.confirmationEnabled : input.confirmationEnabled,
    locationUrl: input.locationUrl === undefined ? current.locationUrl : input.locationUrl,
    giftRegistryUrl: input.giftRegistryUrl === undefined ? current.giftRegistryUrl : input.giftRegistryUrl
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
    ...(input.locationUrl === undefined ? {} : { locationUrl: input.locationUrl }),
    ...(input.giftRegistryUrl === undefined ? {} : { giftRegistryUrl: input.giftRegistryUrl }),
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

function isDigitalService(code: ServiceCode | undefined): code is Extract<ServiceCode, 'FLYER' | 'FLIPBOOK'> {
  return code === ServiceCode.FLYER || code === ServiceCode.FLIPBOOK;
}

export function eventAuditSnapshot(event: Event): Record<string, unknown> {
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
    confirmationClosedAt: event.confirmationClosedAt,
    confirmationClosedByUserId: event.confirmationClosedByUserId,
    floorplanEnabled: event.floorplanEnabled,
    activatedAt: event.activatedAt,
    activatedByUserId: event.activatedByUserId,
    activatedServiceId: event.activatedServiceId,
    activatedServicePriceId: event.activatedServicePriceId,
    baseCostCredits: event.baseCostCredits,
    promotionDiscountCredits: event.promotionDiscountCredits,
    finalCostCredits: event.finalCostCredits,
    purchasedCreditsUsed: event.purchasedCreditsUsed,
    creditLineCreditsUsed: event.creditLineCreditsUsed,
    creditUnitValueMxnCentsSnapshot: event.creditUnitValueMxnCentsSnapshot,
    activationReceiptId: event.activationReceiptId,
    activationIdempotencyKey: event.activationIdempotencyKey,
    deletedAt: event.deletedAt
  };
}

export function toEventResponse(event: EventWithService): EventResponseDto {
  return {
    id: event.id,
    clientId: event.clientId,
    createdByUserId: event.createdByUserId,
    serviceId: event.serviceId,
    serviceCode: event.service?.code ?? null,
    name: event.name,
    socialType: event.socialType,
    status: event.status,
    eventDateTime: event.eventDateTime?.toISOString() ?? null,
    timeZone: event.timeZone,
    capacity: event.capacity,
    confirmationEnabled: event.confirmationEnabled,
    locationUrl: event.locationUrl,
    giftRegistryUrl: event.giftRegistryUrl,
    confirmationClosedAt: event.confirmationClosedAt?.toISOString() ?? null,
    confirmationClosedByUserId: event.confirmationClosedByUserId,
    floorplanEnabled: event.floorplanEnabled,
    activatedAt: event.activatedAt?.toISOString() ?? null,
    activatedByUserId: event.activatedByUserId,
    activatedServiceId: event.activatedServiceId,
    activatedServicePriceId: event.activatedServicePriceId,
    baseCostCredits: event.baseCostCredits,
    promotionDiscountCredits: event.promotionDiscountCredits,
    finalCostCredits: event.finalCostCredits,
    purchasedCreditsUsed: event.purchasedCreditsUsed,
    creditLineCreditsUsed: event.creditLineCreditsUsed,
    creditUnitValueMxnCentsSnapshot: event.creditUnitValueMxnCentsSnapshot,
    activationReceiptId: event.activationReceiptId,
    activationIdempotencyKey: event.activationIdempotencyKey,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    deletedAt: event.deletedAt?.toISOString() ?? null
  };
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
