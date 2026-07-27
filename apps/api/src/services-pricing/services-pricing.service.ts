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
import {
  AuditActorType,
  type ClientType,
  type Prisma,
  type Promotion,
  type PromotionScope,
  ServiceCode,
  type Service,
  type ServicePrice
} from '../generated/prisma/client';
import type {
  AvailableServiceResponseDto,
  ClosePriceInput,
  CreatePriceInput,
  CreatePromotionInput,
  CreateServiceInput,
  PriceResponseDto,
  PromotionResponseDto,
  ServiceResponseDto,
  UpdatePromotionInput,
  UpdateServiceInput
} from './services-pricing.dto';

type PriceWithService = ServicePrice & { service: Pick<Service, 'code'> };
type CurrentPriceWithService = ServicePrice & { service: Pick<Service, 'id' | 'code'> };
type PricingDatabase = PrismaService | Prisma.TransactionClient;

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
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService
  ) {}

  async listAvailable(principal: AuthPrincipal): Promise<AvailableServiceResponseDto[]> {
    if (principal.clientType === null || principal.clientId === null) {
      throw new BadRequestException({
        code: 'CLIENT_CONTEXT_REQUIRED',
        message: 'An operational Client session is required.'
      });
    }

    const prices = await this.findCurrentPrices(this.prisma, principal.clientType, new Date(), {
      activeServicesOnly: true
    });

    return prices.map((price) => ({
      id: price.service.id,
      code: price.service.code,
      credits: price.credits,
      validFrom: price.validFrom.toISOString(),
      validUntil: price.validUntil?.toISOString() ?? null
    }));
  }

  async resolveCurrentPrice(
    serviceCode: ServiceCode,
    clientType: ClientType,
    at: Date = new Date()
  ): Promise<PriceResponseDto> {
    return this.resolveCurrentPriceWithDatabase(this.prisma, serviceCode, clientType, at);
  }

  async resolveCurrentPriceInTransaction(
    transaction: Prisma.TransactionClient,
    serviceCode: ServiceCode,
    clientType: ClientType,
    at: Date = new Date()
  ): Promise<PriceResponseDto> {
    return this.resolveCurrentPriceWithDatabase(transaction, serviceCode, clientType, at);
  }

  private async resolveCurrentPriceWithDatabase(
    database: PricingDatabase,
    serviceCode: ServiceCode,
    clientType: ClientType,
    at: Date
  ): Promise<PriceResponseDto> {
    const prices = await this.findCurrentPrices(database, clientType, at, { serviceCode });
    const price = prices[0];

    if (!price) {
      throw new DomainError(
        'CURRENT_PRICE_NOT_FOUND',
        'No current price exists for the service and Client type at the requested instant.',
        HttpStatus.NOT_FOUND,
        {
          serviceCode,
          clientType,
          at: at.toISOString()
        }
      );
    }

    return toPriceResponse(price);
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
      orderBy: [{ service: { code: 'asc' } }, { clientType: 'asc' }, { validFrom: 'desc' }]
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
        metadata: { serviceId: input.serviceId, clientType: input.clientType },
        mutate: async (transaction) => {
          const service = await transaction.service.findUnique({ where: { id: input.serviceId } });

          if (!service) {
            throw serviceNotFound();
          }

          assertDemoPrice(service.code, input.credits);

          const priorOpen = await transaction.servicePrice.findFirst({
            where: {
              serviceId: input.serviceId,
              clientType: input.clientType,
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
              clientType: input.clientType,
              ...(priorOpen ? { id: { not: priorOpen.id } } : {}),
              validFrom: validUntil === null ? {} : { lt: validUntil },
              OR: [{ validUntil: null }, { validUntil: { gt: validFrom } }]
            },
            select: { id: true }
          });

          if (overlap) {
            throw priceOverlap();
          }

          const price = await transaction.servicePrice.create({
            data: {
              serviceId: input.serviceId,
              clientType: input.clientType,
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
    const at = input.at ?? new Date();
    const promotions = await this.prisma.promotion.findMany({
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

  private findCurrentPrices(
    database: PricingDatabase,
    clientType: ClientType,
    at: Date,
    options: { serviceCode?: ServiceCode; activeServicesOnly?: boolean } = {}
  ): Promise<CurrentPriceWithService[]> {
    return database.servicePrice.findMany({
      where: {
        clientType,
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gt: at } }],
        service: {
          ...(options.serviceCode === undefined ? {} : { code: options.serviceCode }),
          ...(options.activeServicesOnly === true ? { isActive: true } : {})
        }
      },
      include: { service: { select: { id: true, code: true } } },
      orderBy: [{ service: { code: 'asc' } }, { validFrom: 'desc' }]
    });
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
    clientType: price.clientType,
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
    clientType: price.clientType,
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
    message: 'The price validity overlaps another price for the service and Client type.'
  });
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
