import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { AuditedMutationService, auditedResult } from '../audit/audited-mutation.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { AppConfigService } from '../config/app-config.service';
import {
  AuditActorType,
  type ClientType,
  CommercialChannel,
  type Prisma,
  type Promotion,
  type PromotionScope,
  ServiceCode,
  type Service,
  type ServicePrice,
  VenuePriceTier
} from '../generated/prisma/client';
import type {
  AvailableServiceResponseDto,
  ClosePriceInput,
  CreatePriceInput,
  CreatePromotionInput,
  CreateServiceInput,
  PriceResponseDto,
  PromotionResponseDto,
  PublicPricingResponseDto,
  ServiceResponseDto,
  UpdatePromotionInput,
  UpdateServiceInput
} from './services-pricing.dto';

type PriceWithService = ServicePrice & { service: Pick<Service, 'code'> };
type CurrentPriceWithService = ServicePrice & { service: Pick<Service, 'id' | 'code'> };
type PricingDatabase = PrismaService | Prisma.TransactionClient;

const PRICING_VERSION_V2 = 2;
export const COMMERCIAL_TIME_ZONE = 'America/Mexico_City';

export interface PromotionEligibilityInput {
  scope: PromotionScope;
  clientId: string;
  clientType: ClientType;
  serviceId?: string | null;
  at?: Date;
}

@Injectable()
export class ServicesPricingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService,
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  async listAvailable(principal: AuthPrincipal): Promise<AvailableServiceResponseDto[]> {
    if (principal.clientType === null || principal.clientId === null) {
      throw new BadRequestException({
        code: 'CLIENT_CONTEXT_REQUIRED',
        message: 'An operational Client session is required.'
      });
    }

    const at = new Date();
    const client = await this.requirePricingClient(this.prisma, principal.clientId);
    const channel = client.commercialChannel ?? CommercialChannel.STANDARD;
    const prices =
      channel === CommercialChannel.VENUE
        ? [await this.resolveVenuePrice(this.prisma, principal.clientId, ServiceCode.PHYSICAL_QR, at)]
        : await this.findCurrentV2Prices(this.prisma, channel, at, { activeServicesOnly: true });
    const services = new Map<string, AvailableServiceResponseDto>();
    for (const price of prices) {
      const service = services.get(price.serviceId) ?? {
        id: price.service.id,
        code: price.service.code,
        priceRules: []
      };
      service.priceRules.push({
        id: price.id,
        capacityMin: price.capacityMin,
        capacityMax: price.capacityMax,
        venueTier: price.venueTier,
        credits: price.credits,
        validFrom: price.validFrom.toISOString(),
        validUntil: price.validUntil?.toISOString() ?? null
      });
      services.set(price.serviceId, service);
    }
    return [...services.values()];
  }

  async resolveCurrentPrice(
    clientId: string,
    serviceCode: ServiceCode,
    capacity: number | null,
    at: Date = new Date()
  ): Promise<PriceResponseDto> {
    return this.resolveCurrentPriceWithDatabase(this.prisma, clientId, serviceCode, capacity, at);
  }

  async resolveCurrentPriceInTransaction(
    transaction: Prisma.TransactionClient,
    clientId: string,
    serviceCode: ServiceCode,
    capacity: number | null,
    at: Date = new Date()
  ): Promise<PriceResponseDto> {
    return this.resolveCurrentPriceWithDatabase(transaction, clientId, serviceCode, capacity, at);
  }

  private async resolveCurrentPriceWithDatabase(
    database: PricingDatabase,
    clientId: string,
    serviceCode: ServiceCode,
    capacity: number | null,
    at: Date
  ): Promise<PriceResponseDto> {
    const client = await this.requirePricingClient(database, clientId);
    const channel = client.commercialChannel ?? CommercialChannel.STANDARD;
    const price =
      channel === CommercialChannel.VENUE
        ? await this.resolveVenuePrice(database, clientId, serviceCode, at)
        : await this.resolveCapacityPrice(database, channel, serviceCode, capacity, at);

    if (!price) {
      throw new DomainError(
        'CURRENT_PRICE_NOT_FOUND',
        `No applicable ${channel} price exists for the service, capacity and requested instant.`,
        HttpStatus.NOT_FOUND,
        {
          serviceCode,
          commercialChannel: channel,
          capacity,
          at: at.toISOString()
        }
      );
    }

    return toPriceResponse(price);
  }

  async listPublicPricing(at: Date = new Date()): Promise<PublicPricingResponseDto[]> {
    const prices = await this.findCurrentV2Prices(this.prisma, CommercialChannel.STANDARD, at, {
      activeServicesOnly: true
    });
    return prices
      .filter(
        (price) => price.service.code !== ServiceCode.DEMO && price.capacityMin !== null && price.capacityMax !== null
      )
      .map((price) => ({
        serviceCode: price.service.code,
        displayName: publicServiceName(price.service.code),
        capacityMin: price.capacityMin!,
        capacityMax: price.capacityMax!,
        credits: price.credits,
        amountMxnCents: price.credits * this.config.creditUnitValueMxnCents,
        validFrom: price.validFrom.toISOString(),
        validUntil: price.validUntil?.toISOString() ?? null
      }));
  }

  async createService(
    input: CreateServiceInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ServiceResponseDto> {
    try {
      return await this.auditedMutation.execute({
        actor: userActor(principal),
        resourceType: 'SERVICE',
        action: 'SERVICE_CREATE',
        ...(operationId === undefined ? {} : { operationId }),
        mutate: async (transaction) => {
          const service = await transaction.service.create({
            data: {
              code: input.code,
              isActive: input.isActive ?? true
            }
          });

          return auditedResult(toServiceResponse(service), serviceSnapshot(service));
        }
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException({
          code: 'SERVICE_ALREADY_EXISTS',
          message: 'The service code already exists.'
        });
      }

      throw error;
    }
  }

  async updateService(
    serviceId: string,
    input: UpdateServiceInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ServiceResponseDto> {
    const current = await this.requireService(serviceId);

    return this.auditedMutation.execute({
      actor: userActor(principal),
      resourceType: 'SERVICE',
      resourceId: serviceId,
      action: 'SERVICE_UPDATE',
      beforeData: serviceSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const service = await transaction.service.update({
          where: { id: serviceId },
          data: { isActive: input.isActive }
        });

        return auditedResult(toServiceResponse(service), serviceSnapshot(service));
      }
    });
  }

  async listPrices(): Promise<PriceResponseDto[]> {
    const prices = await this.prisma.servicePrice.findMany({
      include: { service: { select: { code: true } } },
      orderBy: [
        { pricingVersion: 'desc' },
        { service: { code: 'asc' } },
        { commercialChannel: 'asc' },
        { capacityMin: 'asc' },
        { venueTier: 'asc' },
        { validFrom: 'desc' }
      ]
    });

    return prices.map(toPriceResponse);
  }

  async createPrice(
    input: CreatePriceInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<PriceResponseDto> {
    const validFrom = new Date(input.validFrom);
    const validUntil = input.validUntil == null ? null : new Date(input.validUntil);

    try {
      return await this.auditedMutation.execute({
        actor: userActor(principal),
        resourceType: 'SERVICE_PRICE',
        action: 'SERVICE_PRICE_CREATE',
        ...(operationId === undefined ? {} : { operationId }),
        metadata: { serviceId: input.serviceId, commercialChannel: input.commercialChannel },
        mutate: async (transaction) => {
          const service = await transaction.service.findUnique({ where: { id: input.serviceId } });

          if (!service) {
            throw serviceNotFound();
          }

          assertDemoPrice(service.code, input.credits);
          if (input.commercialChannel === CommercialChannel.VENUE && service.code !== ServiceCode.PHYSICAL_QR) {
            throw new BadRequestException({
              code: 'INVALID_VENUE_PRICE_SERVICE',
              message: 'Venue pricing is only available for PHYSICAL_QR.'
            });
          }

          const priorOpen = await transaction.servicePrice.findFirst({
            where: {
              serviceId: input.serviceId,
              pricingVersion: PRICING_VERSION_V2,
              commercialChannel: input.commercialChannel,
              capacityMin: input.capacityMin ?? null,
              capacityMax: input.capacityMax ?? null,
              venueTier: input.venueTier ?? null,
              validUntil: null,
              validFrom: { lt: validFrom }
            },
            orderBy: { validFrom: 'desc' }
          });

          if (priorOpen && priorOpen.validFrom <= new Date() && validFrom <= new Date()) {
            throw new ConflictException({
              code: 'PRICE_HISTORY_IMMUTABLE',
              message: 'A current price can only be superseded from a future instant.'
            });
          }

          if (priorOpen) {
            await transaction.servicePrice.update({
              where: { id: priorOpen.id },
              data: { validUntil: validFrom }
            });
          }

          const overlap = await transaction.servicePrice.findFirst({
            where: {
              serviceId: input.serviceId,
              pricingVersion: PRICING_VERSION_V2,
              commercialChannel: input.commercialChannel,
              ...(priorOpen ? { id: { not: priorOpen.id } } : {}),
              validFrom: validUntil === null ? {} : { lt: validUntil },
              OR: [{ validUntil: null }, { validUntil: { gt: validFrom } }],
              ...(input.commercialChannel === CommercialChannel.VENUE
                ? { venueTier: input.venueTier ?? null }
                : {
                    capacityMin: { lte: input.capacityMax! },
                    capacityMax: { gte: input.capacityMin! }
                  })
            },
            select: { id: true }
          });

          if (overlap) {
            throw priceOverlap();
          }

          const price = await transaction.servicePrice.create({
            data: {
              serviceId: input.serviceId,
              pricingVersion: PRICING_VERSION_V2,
              commercialChannel: input.commercialChannel,
              capacityMin: input.capacityMin ?? null,
              capacityMax: input.capacityMax ?? null,
              venueTier: input.venueTier ?? null,
              credits: input.credits,
              validFrom,
              validUntil
            },
            include: { service: { select: { code: true } } }
          });

          return auditedResult(toPriceResponse(price), {
            ...priceSnapshot(price),
            supersededPriceId: priorOpen?.id ?? null
          });
        }
      });
    } catch (error) {
      throw mapPriceMutationError(error);
    }
  }

  async closePrice(
    priceId: string,
    input: ClosePriceInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<PriceResponseDto> {
    const current = await this.prisma.servicePrice.findUnique({
      where: { id: priceId },
      include: { service: { select: { code: true } } }
    });

    if (!current) {
      throw priceNotFound();
    }

    if (current.validUntil !== null) {
      throw new ConflictException({
        code: 'PRICE_HISTORY_IMMUTABLE',
        message: 'A closed price history record cannot be modified.'
      });
    }

    const validUntil = new Date(input.validUntil);
    const minimumClose = current.validFrom > new Date() ? current.validFrom : new Date();

    if (validUntil <= minimumClose) {
      throw new BadRequestException({
        code: 'INVALID_PRICE_VALIDITY',
        message: 'validUntil must preserve all elapsed price history.'
      });
    }

    try {
      return await this.auditedMutation.execute({
        actor: userActor(principal),
        resourceType: 'SERVICE_PRICE',
        resourceId: priceId,
        action: 'SERVICE_PRICE_CLOSE',
        beforeData: priceSnapshot(current),
        ...(operationId === undefined ? {} : { operationId }),
        mutate: async (transaction) => {
          const closed = await transaction.servicePrice.updateMany({
            where: { id: priceId, validUntil: null },
            data: { validUntil }
          });

          if (closed.count !== 1) {
            throw new ConflictException({
              code: 'PRICE_HISTORY_IMMUTABLE',
              message: 'A closed price history record cannot be modified.'
            });
          }

          const price = await transaction.servicePrice.findUniqueOrThrow({
            where: { id: priceId },
            include: { service: { select: { code: true } } }
          });

          return auditedResult(toPriceResponse(price), priceSnapshot(price));
        }
      });
    } catch (error) {
      throw mapPriceMutationError(error);
    }
  }

  async listPromotions(): Promise<PromotionResponseDto[]> {
    const promotions = await this.prisma.promotion.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });

    return promotions.map(toPromotionResponse);
  }

  async createPromotion(
    input: CreatePromotionInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<PromotionResponseDto> {
    return this.auditedMutation.execute({
      actor: userActor(principal),
      resourceType: 'PROMOTION',
      action: 'PROMOTION_CREATE',
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        await assertPromotionTargets(
          transaction,
          input.clientId ?? null,
          input.clientType ?? null,
          input.serviceId ?? null
        );
        const promotion = await transaction.promotion.create({
          data: {
            name: input.name,
            scope: input.scope,
            clientId: input.clientId ?? null,
            clientType: input.clientType ?? null,
            serviceId: input.serviceId ?? null,
            validFrom: new Date(input.validFrom),
            validUntil: input.validUntil == null ? null : new Date(input.validUntil),
            allowsStacking: input.allowsStacking,
            isActive: false
          }
        });

        return auditedResult(toPromotionResponse(promotion), promotionSnapshot(promotion));
      }
    });
  }

  async updatePromotion(
    promotionId: string,
    input: UpdatePromotionInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<PromotionResponseDto> {
    const current = await this.requirePromotion(promotionId);
    const nextValidFrom = input.validFrom === undefined ? current.validFrom : new Date(input.validFrom);
    const nextValidUntil =
      input.validUntil === undefined
        ? current.validUntil
        : input.validUntil === null
          ? null
          : new Date(input.validUntil);

    if (nextValidUntil !== null && nextValidUntil <= nextValidFrom) {
      throw new BadRequestException({
        code: 'INVALID_PROMOTION_VALIDITY',
        message: 'validUntil must be after validFrom.'
      });
    }

    return this.auditedMutation.execute({
      actor: userActor(principal),
      resourceType: 'PROMOTION',
      resourceId: promotionId,
      action: 'PROMOTION_UPDATE',
      beforeData: promotionSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const clientId = input.clientId === undefined ? current.clientId : input.clientId;
        const clientType = input.clientType === undefined ? current.clientType : input.clientType;
        const serviceId = input.serviceId === undefined ? current.serviceId : input.serviceId;
        await assertPromotionTargets(transaction, clientId, clientType, serviceId);
        const promotion = await transaction.promotion.update({
          where: { id: promotionId },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.scope === undefined ? {} : { scope: input.scope }),
            ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
            ...(input.clientType === undefined ? {} : { clientType: input.clientType }),
            ...(input.serviceId === undefined ? {} : { serviceId: input.serviceId }),
            ...(input.validFrom === undefined ? {} : { validFrom: nextValidFrom }),
            ...(input.validUntil === undefined ? {} : { validUntil: nextValidUntil }),
            ...(input.allowsStacking === undefined ? {} : { allowsStacking: input.allowsStacking })
          }
        });

        return auditedResult(toPromotionResponse(promotion), promotionSnapshot(promotion));
      }
    });
  }

  async setPromotionActive(
    promotionId: string,
    isActive: boolean,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<PromotionResponseDto> {
    const current = await this.requirePromotion(promotionId);

    if (current.isActive === isActive) {
      throw new ConflictException({
        code: isActive ? 'PROMOTION_ALREADY_ACTIVE' : 'PROMOTION_ALREADY_INACTIVE',
        message: `The promotion is already ${isActive ? 'active' : 'inactive'}.`
      });
    }

    return this.auditedMutation.execute({
      actor: userActor(principal),
      resourceType: 'PROMOTION',
      resourceId: promotionId,
      action: isActive ? 'PROMOTION_ACTIVATE' : 'PROMOTION_DEACTIVATE',
      beforeData: promotionSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const promotion = await transaction.promotion.update({
          where: { id: promotionId },
          data: { isActive }
        });

        return auditedResult(toPromotionResponse(promotion), promotionSnapshot(promotion));
      }
    });
  }

  async findEligiblePromotions(input: PromotionEligibilityInput): Promise<PromotionResponseDto[]> {
    return this.findEligiblePromotionsWithDatabase(this.prisma, input);
  }

  async findEligiblePromotionsInTransaction(
    transaction: Prisma.TransactionClient,
    input: PromotionEligibilityInput
  ): Promise<PromotionResponseDto[]> {
    return this.findEligiblePromotionsWithDatabase(transaction, input);
  }

  private async findEligiblePromotionsWithDatabase(
    database: PricingDatabase,
    input: PromotionEligibilityInput
  ): Promise<PromotionResponseDto[]> {
    const at = input.at ?? new Date();
    const promotions = await database.promotion.findMany({
      where: {
        isActive: true,
        scope: input.scope,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        AND: [
          { OR: [{ clientId: null }, { clientId: input.clientId }] },
          { OR: [{ clientType: null }, { clientType: input.clientType }] },
          { OR: [{ serviceId: null }, { serviceId: input.serviceId ?? null }] }
        ]
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });

    return promotions.map(toPromotionResponse);
  }

  private async requireService(serviceId: string): Promise<Service> {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });

    if (!service) {
      throw serviceNotFound();
    }

    return service;
  }

  private findCurrentV2Prices(
    database: PricingDatabase,
    commercialChannel: CommercialChannel,
    at: Date,
    options: { serviceCode?: ServiceCode; activeServicesOnly?: boolean } = {}
  ): Promise<CurrentPriceWithService[]> {
    return database.servicePrice.findMany({
      where: {
        pricingVersion: PRICING_VERSION_V2,
        commercialChannel,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        service: {
          ...(options.serviceCode === undefined ? {} : { code: options.serviceCode }),
          ...(options.activeServicesOnly === true ? { isActive: true } : {})
        }
      },
      include: { service: { select: { id: true, code: true } } },
      orderBy: [{ service: { code: 'asc' } }, { capacityMin: 'asc' }, { venueTier: 'asc' }, { validFrom: 'desc' }]
    });
  }

  private async resolveCapacityPrice(
    database: PricingDatabase,
    channel: CommercialChannel,
    serviceCode: ServiceCode,
    capacity: number | null,
    at: Date
  ): Promise<CurrentPriceWithService | null> {
    if (capacity === null || !Number.isInteger(capacity) || capacity < 1 || capacity > 150) {
      throw new DomainError(
        'PRICE_CAPACITY_NOT_SUPPORTED',
        'Pricing requires an Event capacity between 1 and 150.',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { capacity }
      );
    }
    return database.servicePrice.findFirst({
      where: {
        pricingVersion: PRICING_VERSION_V2,
        commercialChannel: channel,
        capacityMin: { lte: capacity },
        capacityMax: { gte: capacity },
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        service: { code: serviceCode, isActive: true }
      },
      include: { service: { select: { id: true, code: true } } },
      orderBy: { validFrom: 'desc' }
    });
  }

  private async resolveVenuePrice(
    database: PricingDatabase,
    clientId: string,
    serviceCode: ServiceCode,
    at: Date
  ): Promise<CurrentPriceWithService> {
    if (serviceCode !== ServiceCode.PHYSICAL_QR) {
      throw new DomainError(
        'VENUE_SERVICE_PRICE_NOT_AVAILABLE',
        'Venue commercial pricing is only configured for PHYSICAL_QR.',
        HttpStatus.NOT_FOUND,
        { serviceCode }
      );
    }
    const volume = await this.countVenueEffectiveVolume(database, clientId, at);
    const venueTier = venueTierForVolume(volume);
    const price = await database.servicePrice.findFirst({
      where: {
        pricingVersion: PRICING_VERSION_V2,
        commercialChannel: CommercialChannel.VENUE,
        venueTier,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        service: { code: serviceCode, isActive: true }
      },
      include: { service: { select: { id: true, code: true } } },
      orderBy: { validFrom: 'desc' }
    });
    if (!price) {
      throw new DomainError(
        'CURRENT_PRICE_NOT_FOUND',
        'No current Venue price exists for the effective volume tier.',
        HttpStatus.NOT_FOUND,
        {
          serviceCode,
          commercialChannel: CommercialChannel.VENUE,
          venueTier,
          effectiveVolume: volume,
          at: at.toISOString()
        }
      );
    }
    return price;
  }

  private async countVenueEffectiveVolume(database: PricingDatabase, clientId: string, at: Date): Promise<number> {
    const [row] = await database.$queryRaw<Array<{ effectiveVolume: number }>>`
      WITH commercial_period AS (
        SELECT
          (date_trunc('month', ${at}::timestamptz AT TIME ZONE ${COMMERCIAL_TIME_ZONE}) - interval '1 month')
            AT TIME ZONE ${COMMERCIAL_TIME_ZONE} AS period_start,
          date_trunc('month', ${at}::timestamptz AT TIME ZONE ${COMMERCIAL_TIME_ZONE})
            AT TIME ZONE ${COMMERCIAL_TIME_ZONE} AS period_end
      )
      SELECT COUNT(*)::integer AS "effectiveVolume"
      FROM "event" event
      JOIN "service" service ON service."id" = event."activated_service_id"
      CROSS JOIN commercial_period period
      WHERE event."client_id" = ${clientId}::uuid
        AND event."activated_at" >= period.period_start
        AND event."activated_at" < period.period_end
        AND service."code" <> 'DEMO'
        AND event."final_cost_credits" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "ledger_entry" charged
          WHERE charged."event_id" = event."id"
            AND charged."movement_type" IN ('EVENT_ACTIVATION_CHARGE', 'CREDIT_LINE_USAGE')
        )
        AND COALESCE((
          SELECT SUM(refund."purchased_credit_delta" - refund."credit_line_used_delta")
          FROM "ledger_entry" refund
          WHERE refund."event_id" = event."id"
            AND refund."movement_type" = 'EVENT_CREDIT_REFUND'
            AND NOT EXISTS (
              SELECT 1 FROM "ledger_entry" reversal
              WHERE reversal."reverses_ledger_entry_id" = refund."id"
            )
        ), 0) < event."final_cost_credits"
    `;
    return row?.effectiveVolume ?? 0;
  }

  private async requirePricingClient(database: PricingDatabase, clientId: string) {
    const client = await database.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true, commercialChannel: true }
    });
    if (!client) {
      throw new NotFoundException({ code: 'CLIENT_NOT_FOUND', message: 'Client not found.' });
    }
    return client;
  }

  private async requirePromotion(promotionId: string): Promise<Promotion> {
    const promotion = await this.prisma.promotion.findUnique({ where: { id: promotionId } });

    if (!promotion) {
      throw new NotFoundException({
        code: 'PROMOTION_NOT_FOUND',
        message: 'Promotion not found.'
      });
    }

    return promotion;
  }
}

function toServiceResponse(service: Service): ServiceResponseDto {
  return {
    id: service.id,
    code: service.code,
    isActive: service.isActive,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString()
  };
}

function toPriceResponse(price: PriceWithService): PriceResponseDto {
  return {
    id: price.id,
    serviceId: price.serviceId,
    serviceCode: price.service.code,
    pricingVersion: price.pricingVersion,
    clientType: price.clientType,
    commercialChannel: price.commercialChannel,
    capacityMin: price.capacityMin,
    capacityMax: price.capacityMax,
    venueTier: price.venueTier,
    credits: price.credits,
    validFrom: price.validFrom.toISOString(),
    validUntil: price.validUntil?.toISOString() ?? null,
    createdAt: price.createdAt.toISOString()
  };
}

function toPromotionResponse(promotion: Promotion): PromotionResponseDto {
  return {
    id: promotion.id,
    name: promotion.name,
    scope: promotion.scope,
    clientId: promotion.clientId,
    clientType: promotion.clientType,
    serviceId: promotion.serviceId,
    validFrom: promotion.validFrom.toISOString(),
    validUntil: promotion.validUntil?.toISOString() ?? null,
    isActive: promotion.isActive,
    allowsStacking: promotion.allowsStacking,
    createdAt: promotion.createdAt.toISOString(),
    updatedAt: promotion.updatedAt.toISOString()
  };
}

function serviceSnapshot(service: Service): Record<string, unknown> {
  return {
    id: service.id,
    code: service.code,
    isActive: service.isActive
  };
}

function priceSnapshot(price: ServicePrice): Record<string, unknown> {
  return {
    id: price.id,
    serviceId: price.serviceId,
    pricingVersion: price.pricingVersion,
    clientType: price.clientType,
    commercialChannel: price.commercialChannel,
    capacityMin: price.capacityMin,
    capacityMax: price.capacityMax,
    venueTier: price.venueTier,
    credits: price.credits,
    validFrom: price.validFrom,
    validUntil: price.validUntil
  };
}

function promotionSnapshot(promotion: Promotion): Record<string, unknown> {
  return {
    id: promotion.id,
    name: promotion.name,
    scope: promotion.scope,
    clientId: promotion.clientId,
    clientType: promotion.clientType,
    serviceId: promotion.serviceId,
    validFrom: promotion.validFrom,
    validUntil: promotion.validUntil,
    isActive: promotion.isActive,
    allowsStacking: promotion.allowsStacking
  };
}

function userActor(principal: AuthPrincipal): { type: typeof AuditActorType.USER; id: string } {
  return { type: AuditActorType.USER, id: principal.userId };
}

function assertDemoPrice(code: ServiceCode, credits: number): void {
  if (code === ServiceCode.DEMO && credits !== 0) {
    throw new BadRequestException({
      code: 'DEMO_PRICE_MUST_BE_ZERO',
      message: 'DEMO service prices must be zero.'
    });
  }
}

async function assertPromotionTargets(
  transaction: Prisma.TransactionClient,
  clientId: string | null,
  clientType: ClientType | null,
  serviceId: string | null
): Promise<void> {
  if (clientId !== null) {
    const client = await transaction.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true, type: true }
    });

    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client not found.'
      });
    }

    if (clientType !== null && client.type !== clientType) {
      throw new BadRequestException({
        code: 'PROMOTION_CLIENT_TYPE_MISMATCH',
        message: 'Promotion clientType must match the selected Client type.'
      });
    }
  }

  if (serviceId !== null) {
    const service = await transaction.service.findUnique({ where: { id: serviceId }, select: { id: true } });

    if (!service) {
      throw serviceNotFound();
    }
  }
}

function serviceNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'SERVICE_NOT_FOUND',
    message: 'Service not found.'
  });
}

function priceNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'PRICE_NOT_FOUND',
    message: 'Price not found.'
  });
}

function priceOverlap(): ConflictException {
  return new ConflictException({
    code: 'PRICE_OVERLAP',
    message: 'The price validity overlaps another entry for the same commercial rule.'
  });
}

export function venueTierForVolume(volume: number): VenuePriceTier {
  if (volume >= 11) return VenuePriceTier.ELEVEN_PLUS;
  if (volume >= 6) return VenuePriceTier.SIX_TO_TEN;
  if (volume >= 3) return VenuePriceTier.THREE_TO_FIVE;
  return VenuePriceTier.ONE_TO_TWO;
}

function publicServiceName(code: ServiceCode): string {
  switch (code) {
    case ServiceCode.PHYSICAL_QR:
      return 'QR / EventOps';
    case ServiceCode.FLYER:
      return 'Flyer digital';
    case ServiceCode.FLIPBOOK:
      return 'Flipbook digital';
    case ServiceCode.DEMO:
      return 'Demo';
  }
}

function mapPriceMutationError(error: unknown): unknown {
  if (hasPrismaCode(error, 'P2002') || hasPrismaCode(error, 'P2004') || hasPrismaCode(error, 'P2034')) {
    return priceOverlap();
  }

  return error;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
