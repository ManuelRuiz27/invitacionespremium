import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { AppConfigService } from '../config/app-config.service';
import {
  AuditActorType,
  CommercialChannel,
  CreditLineStatus,
  EventStatus,
  FileAssetType,
  Prisma,
  PromotionScope,
  ServiceCode,
  type Event
} from '../generated/prisma/client';
import { ServicesPricingService } from '../services-pricing/services-pricing.service';
import type { PriceResponseDto } from '../services-pricing/services-pricing.dto';
import type { EventCommercialResponseDto } from './event-commercial.dto';

const PREPARATION_STATUSES: readonly EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
];
const INVITATION_FILE_TYPES: readonly FileAssetType[] = [
  FileAssetType.FLYER_INITIAL_IMAGE,
  FileAssetType.FLYER_QR_IMAGE,
  FileAssetType.FLIPBOOK_PAGE_IMAGE
];

type CommercialEvent = Event & {
  service: { id: string; code: ServiceCode; isActive: boolean } | null;
  client: { commercialChannel: CommercialChannel | null };
};

@Injectable()
export class EventCommercialService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ServicesPricingService) private readonly pricing: ServicesPricingService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  async quote(clientId: string, eventId: string): Promise<EventCommercialResponseDto> {
    return this.runTransaction(async (transaction) => {
      const event = await this.requireTarget(transaction, clientId, eventId);
      const context = await this.resolveCurrentTerms(transaction, event);
      return this.response(transaction, event, context.price, context.channel);
    });
  }

  async authorize(
    clientId: string,
    eventId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<EventCommercialResponseDto> {
    return this.runTransaction(async (transaction) => {
      await this.lockEvent(transaction, eventId);
      const event = await this.requireTarget(transaction, clientId, eventId);
      this.assertPreparation(event);
      if (await this.lockMatchesCurrentContext(transaction, event)) {
        return this.responseFromLock(transaction, event);
      }
      if (event.designKickoffAt !== null || (await this.hasCustomWork(transaction, eventId))) {
        throw commercialError(
          'EVENT_COMMERCIAL_REQUOTE_REQUIRED',
          'Personalized work already exists; an explicit commercial requote is required.'
        );
      }
      const context = await this.resolveCurrentTerms(transaction, event);
      const coverage = await this.requireCoverage(transaction, clientId, context.price.credits);
      const at = new Date();
      const updated = await transaction.event.update({
        where: { id: eventId },
        include: {
          service: { select: { id: true, code: true, isActive: true } },
          client: { select: { commercialChannel: true } }
        },
        data: commercialLockData(context.price, context.channel, event.capacity!, principal.userId, at)
      });
      await this.audit.record(
        {
          actor: { type: AuditActorType.USER, id: principal.userId },
          clientId,
          eventId,
          resourceType: 'EVENT',
          resourceId: eventId,
          action: 'EVENT_COMMERCIAL_AUTHORIZE',
          beforeData: commercialSnapshot(event),
          afterData: commercialSnapshot(updated),
          metadata: { coverage },
          ...(operationId === undefined ? {} : { operationId })
        },
        transaction
      );
      return this.responseFromLock(transaction, updated);
    });
  }

  async kickoff(
    clientId: string,
    eventId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<EventCommercialResponseDto> {
    return this.runTransaction(async (transaction) => {
      await this.lockEvent(transaction, eventId);
      const event = await this.requireTarget(transaction, clientId, eventId);
      this.assertPreparation(event);
      if (!isDigital(event.service?.code)) {
        throw commercialError(
          'EVENT_DESIGN_KICKOFF_NOT_APPLICABLE',
          'Design kickoff applies only to Flyer or Flipbook.'
        );
      }
      await this.assertValidLock(transaction, event);
      if (event.designKickoffAt !== null) return this.responseFromLock(transaction, event);
      const at = new Date();
      const updated = await transaction.event.update({
        where: { id: eventId },
        include: {
          service: { select: { id: true, code: true, isActive: true } },
          client: { select: { commercialChannel: true } }
        },
        data: { designKickoffAt: at, designKickoffByUserId: principal.userId }
      });
      await this.audit.record(
        {
          actor: { type: AuditActorType.USER, id: principal.userId },
          clientId,
          eventId,
          resourceType: 'EVENT',
          resourceId: eventId,
          action: 'EVENT_DESIGN_KICKOFF',
          beforeData: commercialSnapshot(event),
          afterData: commercialSnapshot(updated),
          ...(operationId === undefined ? {} : { operationId })
        },
        transaction
      );
      return this.responseFromLock(transaction, updated);
    });
  }

  async assertDesignMutationAllowed(
    database: PrismaService | Prisma.TransactionClient,
    clientId: string,
    eventId: string
  ): Promise<void> {
    const event = await this.requireTarget(database, clientId, eventId);
    if (!isDigital(event.service?.code)) {
      throw commercialError(
        'EVENT_DESIGN_KICKOFF_NOT_APPLICABLE',
        'Personalized invitation work requires Flyer or Flipbook.'
      );
    }
    await this.assertValidLock(database, event);
    if (event.designKickoffAt === null) {
      throw commercialError(
        'EVENT_DESIGN_KICKOFF_REQUIRED',
        'Authorize the commercial terms and start design before editing the invitation.'
      );
    }
  }

  async assertActivationLock(
    transaction: Prisma.TransactionClient,
    event: Event
  ): Promise<{
    servicePriceId: string;
    baseCostCredits: number;
    promotionDiscountCredits: 0;
    finalCostCredits: number;
  }> {
    await this.assertValidLock(transaction, event);
    return {
      servicePriceId: event.commercialServicePriceId!,
      baseCostCredits: event.commercialBaseCostCredits!,
      promotionDiscountCredits: 0,
      finalCostCredits: event.commercialFinalCostCredits!
    };
  }

  async invalidateForGenericChange(
    transaction: Prisma.TransactionClient,
    event: CommercialEvent,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<void> {
    if (event.designKickoffAt !== null || (await this.hasCustomWork(transaction, event.id))) {
      throw commercialError(
        'EVENT_COMMERCIAL_REQUOTE_REQUIRED',
        'SKU or capacity changes after personalized work require an explicit commercial requote.'
      );
    }
    if (event.commercialAuthorizedAt === null) return;
    await transaction.event.update({ where: { id: event.id }, data: clearCommercialLockData() });
    await this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        clientId: event.clientId,
        eventId: event.id,
        resourceType: 'EVENT',
        resourceId: event.id,
        action: 'EVENT_COMMERCIAL_TERMS_INVALIDATE',
        beforeData: commercialSnapshot(event),
        afterData: { authorizedAt: null, reason: 'SERVICE_OR_CAPACITY_CHANGED' },
        ...(operationId === undefined ? {} : { operationId })
      },
      transaction
    );
  }

  async hasCustomWork(database: PrismaService | Prisma.TransactionClient, eventId: string): Promise<boolean> {
    const [design, asset] = await Promise.all([
      database.invitationDesign.findFirst({ where: { eventId, deletedAt: null }, select: { id: true } }),
      database.fileAsset.findFirst({
        where: { eventId, deletedAt: null, fileType: { in: [...INVITATION_FILE_TYPES] } },
        select: { id: true }
      })
    ]);
    return design !== null || asset !== null;
  }

  async lockCurrentTermsInTransaction(
    transaction: Prisma.TransactionClient,
    event: CommercialEvent,
    principal: AuthPrincipal
  ): Promise<Prisma.EventUncheckedUpdateInput> {
    const context = await this.resolveCurrentTerms(transaction, event);
    await this.requireCoverage(transaction, event.clientId, context.price.credits);
    return commercialLockData(context.price, context.channel, event.capacity!, principal.userId, new Date());
  }

  responseForLockedEvent(
    database: PrismaService | Prisma.TransactionClient,
    event: CommercialEvent
  ): Promise<EventCommercialResponseDto> {
    return this.responseFromLock(database, event);
  }

  async requireTarget(
    database: PrismaService | Prisma.TransactionClient,
    clientId: string,
    eventId: string
  ): Promise<CommercialEvent> {
    const event = await database.event.findFirst({
      where: { id: eventId, clientId, deletedAt: null },
      include: {
        service: { select: { id: true, code: true, isActive: true } },
        client: { select: { commercialChannel: true } }
      }
    });
    if (!event) throw new DomainError('EVENT_NOT_FOUND', 'Event was not found.', HttpStatus.NOT_FOUND);
    return event;
  }

  private async resolveCurrentTerms(transaction: Prisma.TransactionClient, event: CommercialEvent) {
    this.assertPreparation(event);
    if (
      !event.service ||
      !event.service.isActive ||
      event.service.code === ServiceCode.DEMO ||
      event.capacity === null
    ) {
      throw commercialError(
        'EVENT_COMMERCIAL_CONFIGURATION_INCOMPLETE',
        'A paid active service and capacity are required.'
      );
    }
    const client = await transaction.client.findFirst({
      where: { id: event.clientId, deletedAt: null },
      select: { type: true, commercialChannel: true }
    });
    if (!client) throw new DomainError('CLIENT_NOT_FOUND', 'Client was not found.', HttpStatus.NOT_FOUND);
    const channel = client.commercialChannel ?? CommercialChannel.STANDARD;
    const at = new Date();
    const price = await this.pricing.resolveCurrentPriceInTransaction(
      transaction,
      event.clientId,
      event.service.code,
      event.capacity,
      at
    );
    await this.pricing.findEligiblePromotionsInTransaction(transaction, {
      scope: PromotionScope.EVENT_ACTIVATION,
      clientId: event.clientId,
      clientType: client.type,
      serviceId: event.service.id,
      at
    });
    return { price, channel };
  }

  private async requireCoverage(database: Prisma.TransactionClient, clientId: string, credits: number) {
    const [balance, line] = await Promise.all([
      database.financeBalance.findUnique({ where: { clientId } }),
      database.creditLine.findUnique({ where: { clientId } })
    ]);
    const now = new Date();
    const purchasedCredits = balance?.purchasedCredits ?? 0;
    const creditLineAvailableCredits =
      line?.status === CreditLineStatus.ACTIVE && (line.expiresAt === null || line.expiresAt > now)
        ? Math.max(0, line.limitCredits - (balance?.creditLineUsed ?? 0))
        : 0;
    const coverage = {
      purchasedCredits,
      creditLineAvailableCredits,
      totalAvailableCredits: purchasedCredits + creditLineAvailableCredits,
      sufficient: purchasedCredits + creditLineAvailableCredits >= credits
    };
    if (!coverage.sufficient) {
      throw new DomainError(
        'EVENT_COMMERCIAL_FINANCIAL_COVERAGE_INSUFFICIENT',
        'Current purchased credits and approved credit line do not cover the quoted Event.',
        HttpStatus.CONFLICT,
        coverage
      );
    }
    return coverage;
  }

  private async coverage(database: PrismaService | Prisma.TransactionClient, clientId: string, credits: number) {
    const [balance, line] = await Promise.all([
      database.financeBalance.findUnique({ where: { clientId } }),
      database.creditLine.findUnique({ where: { clientId } })
    ]);
    const purchasedCredits = balance?.purchasedCredits ?? 0;
    const lineAvailable =
      line?.status === CreditLineStatus.ACTIVE && (line.expiresAt === null || line.expiresAt > new Date())
        ? Math.max(0, line.limitCredits - (balance?.creditLineUsed ?? 0))
        : 0;
    return {
      purchasedCredits,
      creditLineAvailableCredits: lineAvailable,
      totalAvailableCredits: purchasedCredits + lineAvailable,
      sufficient: purchasedCredits + lineAvailable >= credits
    };
  }

  private async response(
    database: PrismaService | Prisma.TransactionClient,
    event: CommercialEvent,
    price: PriceResponseDto,
    channel: CommercialChannel
  ): Promise<EventCommercialResponseDto> {
    const client = await database.client.findUniqueOrThrow({ where: { id: event.clientId }, select: { name: true } });
    return {
      eventId: event.id,
      clientId: event.clientId,
      clientName: client.name,
      commercialChannel: channel,
      serviceId: event.service!.id,
      serviceCode: event.service!.code,
      capacity: event.capacity!,
      servicePriceId: price.id,
      capacityMin: price.capacityMin,
      capacityMax: price.capacityMax,
      venueTier: price.venueTier,
      baseCostCredits: price.credits,
      promotionDiscountCredits: 0,
      finalCostCredits: price.credits,
      amountMxnCents: price.credits * this.config.creditUnitValueMxnCents,
      lockedServicePriceId: event.commercialServicePriceId,
      lockedBaseCostCredits: event.commercialBaseCostCredits,
      lockedPromotionDiscountCredits: event.commercialPromotionDiscountCredits,
      lockedFinalCostCredits: event.commercialFinalCostCredits,
      lockedAmountMxnCents:
        event.commercialFinalCostCredits === null
          ? null
          : event.commercialFinalCostCredits * this.config.creditUnitValueMxnCents,
      coverage: await this.coverage(database, event.clientId, price.credits),
      authorizedAt: event.commercialAuthorizedAt?.toISOString() ?? null,
      priceLockedAt: event.commercialPriceLockedAt?.toISOString() ?? null,
      designKickoffAt: event.designKickoffAt?.toISOString() ?? null,
      lockMatchesCurrentContext: await this.lockMatchesCurrentContext(database, event),
      customWorkExists: await this.hasCustomWork(database, event.id)
    };
  }

  private async responseFromLock(
    database: PrismaService | Prisma.TransactionClient,
    event: CommercialEvent
  ): Promise<EventCommercialResponseDto> {
    if (event.commercialServicePriceId === null) {
      throw commercialError('EVENT_COMMERCIAL_AUTHORIZATION_REQUIRED', 'Commercial authorization is required.');
    }
    const price = await database.servicePrice.findUniqueOrThrow({
      where: { id: event.commercialServicePriceId },
      include: { service: { select: { code: true } } }
    });
    return this.response(
      database,
      event,
      {
        id: price.id,
        serviceId: price.serviceId,
        serviceCode: price.service.code,
        pricingVersion: price.pricingVersion,
        clientType: price.clientType,
        commercialChannel: price.commercialChannel,
        capacityMin: event.commercialCapacityMinSnapshot,
        capacityMax: event.commercialCapacityMaxSnapshot,
        venueTier: event.commercialVenueTierSnapshot,
        credits: event.commercialBaseCostCredits!,
        validFrom: price.validFrom.toISOString(),
        validUntil: price.validUntil?.toISOString() ?? null,
        createdAt: price.createdAt.toISOString()
      },
      event.commercialChannelSnapshot!
    );
  }

  private async assertValidLock(database: PrismaService | Prisma.TransactionClient, event: Event) {
    if (event.commercialAuthorizedAt === null) {
      throw commercialError('EVENT_COMMERCIAL_AUTHORIZATION_REQUIRED', 'Commercial authorization is required.');
    }
    if (!(await this.lockMatchesCurrentContext(database, event))) {
      throw commercialError(
        'EVENT_COMMERCIAL_TERMS_STALE',
        'Locked commercial terms no longer match the Event or Client.'
      );
    }
  }

  private async lockMatchesCurrentContext(database: PrismaService | Prisma.TransactionClient, event: Event) {
    if (
      event.commercialAuthorizedAt === null ||
      event.commercialServicePriceId === null ||
      event.serviceId === null ||
      event.capacity === null ||
      event.commercialCapacitySnapshot !== event.capacity
    )
      return false;
    const [client, price] = await Promise.all([
      database.client.findUnique({ where: { id: event.clientId }, select: { commercialChannel: true } }),
      database.servicePrice.findUnique({ where: { id: event.commercialServicePriceId } })
    ]);
    const channel = client?.commercialChannel ?? CommercialChannel.STANDARD;
    return (
      price !== null &&
      price.pricingVersion === 2 &&
      price.serviceId === event.serviceId &&
      channel === event.commercialChannelSnapshot &&
      price.commercialChannel === event.commercialChannelSnapshot &&
      price.credits === event.commercialBaseCostCredits &&
      price.capacityMin === event.commercialCapacityMinSnapshot &&
      price.capacityMax === event.commercialCapacityMaxSnapshot &&
      price.venueTier === event.commercialVenueTierSnapshot &&
      event.commercialPromotionDiscountCredits === 0 &&
      event.commercialFinalCostCredits === event.commercialBaseCostCredits
    );
  }

  private assertPreparation(event: Event) {
    if (!PREPARATION_STATUSES.includes(event.status)) {
      throw commercialError(
        'EVENT_INVALID_STATE_TRANSITION',
        'Commercial preparation requires an Event in preparation.'
      );
    }
  }

  private async lockEvent(transaction: Prisma.TransactionClient, eventId: string) {
    await transaction.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
  }

  private async runTransaction<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt === 19) throw error;
        await waitForRetry(attempt);
      }
    }
    throw commercialError('EVENT_COMMERCIAL_CONCURRENCY_CONFLICT', 'Commercial terms could not be serialized.');
  }
}

function commercialLockData(
  price: PriceResponseDto,
  channel: CommercialChannel,
  capacity: number,
  actorUserId: string,
  at: Date
): Prisma.EventUncheckedUpdateInput {
  return {
    commercialAuthorizedAt: at,
    commercialAuthorizedByUserId: actorUserId,
    commercialPriceLockedAt: at,
    commercialServicePriceId: price.id,
    commercialBaseCostCredits: price.credits,
    commercialPromotionDiscountCredits: 0,
    commercialFinalCostCredits: price.credits,
    commercialChannelSnapshot: channel,
    commercialCapacitySnapshot: capacity,
    commercialCapacityMinSnapshot: price.capacityMin,
    commercialCapacityMaxSnapshot: price.capacityMax,
    commercialVenueTierSnapshot: price.venueTier
  };
}

export function clearCommercialLockData(): Prisma.EventUncheckedUpdateInput {
  return {
    commercialAuthorizedAt: null,
    commercialAuthorizedByUserId: null,
    commercialPriceLockedAt: null,
    commercialServicePriceId: null,
    commercialBaseCostCredits: null,
    commercialPromotionDiscountCredits: null,
    commercialFinalCostCredits: null,
    commercialChannelSnapshot: null,
    commercialCapacitySnapshot: null,
    commercialCapacityMinSnapshot: null,
    commercialCapacityMaxSnapshot: null,
    commercialVenueTierSnapshot: null
  };
}

function commercialSnapshot(event: Event) {
  return {
    authorizedAt: event.commercialAuthorizedAt,
    servicePriceId: event.commercialServicePriceId,
    baseCostCredits: event.commercialBaseCostCredits,
    promotionDiscountCredits: event.commercialPromotionDiscountCredits,
    finalCostCredits: event.commercialFinalCostCredits,
    channel: event.commercialChannelSnapshot,
    capacity: event.commercialCapacitySnapshot,
    capacityMin: event.commercialCapacityMinSnapshot,
    capacityMax: event.commercialCapacityMaxSnapshot,
    venueTier: event.commercialVenueTierSnapshot,
    designKickoffAt: event.designKickoffAt
  };
}

function isDigital(code: ServiceCode | undefined): boolean {
  return code === ServiceCode.FLYER || code === ServiceCode.FLIPBOOK;
}

function commercialError(code: string, message: string): DomainError {
  return new DomainError(code, message, HttpStatus.CONFLICT);
}

function isRetryableTransactionError(error: unknown): boolean {
  const text = String(error);
  return (
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2034') ||
    text.includes('40001') ||
    text.includes('40P01') ||
    text.includes('TransactionWriteConflict')
  );
}

function waitForRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(5 * 2 ** attempt, 100)));
}
