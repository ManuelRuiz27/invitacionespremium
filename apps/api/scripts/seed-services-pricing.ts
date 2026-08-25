import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuditedMutationService, auditedResult } from '../src/audit/audited-mutation.service';
import { AuditActorType, CommercialChannel, ServiceCode, VenuePriceTier } from '../src/generated/prisma/client';
import { loadEnvironmentFiles } from '../src/config/load-environment';

const initialValidFrom = new Date('2026-08-24T00:00:00.000Z');
const configuredPrices = [
  capacityPrice(ServiceCode.PHYSICAL_QR, CommercialChannel.STANDARD, 1, 50, 125),
  capacityPrice(ServiceCode.PHYSICAL_QR, CommercialChannel.STANDARD, 51, 100, 150),
  capacityPrice(ServiceCode.PHYSICAL_QR, CommercialChannel.STANDARD, 101, 150, 175),
  capacityPrice(ServiceCode.FLYER, CommercialChannel.STANDARD, 1, 50, 225),
  capacityPrice(ServiceCode.FLYER, CommercialChannel.STANDARD, 51, 100, 275),
  capacityPrice(ServiceCode.FLYER, CommercialChannel.STANDARD, 101, 150, 325),
  capacityPrice(ServiceCode.FLIPBOOK, CommercialChannel.STANDARD, 1, 50, 300),
  capacityPrice(ServiceCode.FLIPBOOK, CommercialChannel.STANDARD, 51, 100, 350),
  capacityPrice(ServiceCode.FLIPBOOK, CommercialChannel.STANDARD, 101, 150, 400),
  capacityPrice(ServiceCode.PHYSICAL_QR, CommercialChannel.PARTNER, 1, 100, 120),
  capacityPrice(ServiceCode.FLYER, CommercialChannel.PARTNER, 1, 100, 215),
  capacityPrice(ServiceCode.FLIPBOOK, CommercialChannel.PARTNER, 1, 100, 275),
  venuePrice(VenuePriceTier.ONE_TO_TWO, 120),
  venuePrice(VenuePriceTier.THREE_TO_FIVE, 110),
  venuePrice(VenuePriceTier.SIX_TO_TEN, 100),
  venuePrice(VenuePriceTier.ELEVEN_PLUS, 90)
] as const;

export async function seedServicesPricing(auditedMutation: AuditedMutationService): Promise<void> {
  const operationId = randomUUID();
  const result = await auditedMutation.execute({
    actor: { type: AuditActorType.SYSTEM },
    resourceType: 'SERVICES_PRICING_SEED',
    action: 'SERVICES_PRICING_V2_SEEDED',
    operationId,
    metadata: { source: 'idempotent_seed', initialValidFrom, pricingVersion: 2 },
    mutate: async (transaction) => {
      const services = await Promise.all(
        Object.values(ServiceCode).map((code) =>
          transaction.service.upsert({
            where: { code },
            create: { code, isActive: true },
            update: {},
            select: { id: true, code: true }
          })
        )
      );
      const serviceIds = new Map(services.map((service) => [service.code, service.id]));
      let pricesCreated = 0;
      for (const configured of configuredPrices) {
        const serviceId = requiredServiceId(serviceIds, configured.serviceCode);
        const existing = await transaction.servicePrice.findFirst({
          where: {
            serviceId,
            pricingVersion: 2,
            commercialChannel: configured.commercialChannel,
            capacityMin: configured.capacityMin,
            capacityMax: configured.capacityMax,
            venueTier: configured.venueTier
          },
          select: { id: true }
        });
        if (existing) continue;
        await transaction.servicePrice.create({
          data: {
            serviceId,
            pricingVersion: 2,
            commercialChannel: configured.commercialChannel,
            capacityMin: configured.capacityMin,
            capacityMax: configured.capacityMax,
            venueTier: configured.venueTier,
            credits: configured.credits,
            validFrom: initialValidFrom
          }
        });
        pricesCreated += 1;
      }
      return auditedResult(
        { services: services.length, pricesCreated },
        { serviceCodes: Object.values(ServiceCode), configuredPriceCount: configuredPrices.length, pricesCreated }
      );
    }
  });
  process.stdout.write(`${JSON.stringify({ event: 'services_pricing_seeded', operationId, ...result })}\n`);
}

function capacityPrice(
  serviceCode: ServiceCode,
  commercialChannel: CommercialChannel,
  capacityMin: number,
  capacityMax: number,
  credits: number
) {
  return { serviceCode, commercialChannel, capacityMin, capacityMax, venueTier: null, credits };
}

function venuePrice(venueTier: VenuePriceTier, credits: number) {
  return {
    serviceCode: ServiceCode.PHYSICAL_QR,
    commercialChannel: CommercialChannel.VENUE,
    capacityMin: null,
    capacityMax: null,
    venueTier,
    credits
  };
}

async function runStandaloneSeed(): Promise<void> {
  loadEnvironmentFiles();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    await seedServicesPricing(app.get(AuditedMutationService));
  } finally {
    await app.close();
  }
}

function requiredServiceId(serviceIds: Map<ServiceCode, string>, code: ServiceCode): string {
  const serviceId = serviceIds.get(code);
  if (!serviceId) throw new Error(`Missing seeded service id for ${code}.`);
  return serviceId;
}

if (require.main === module) {
  void runStandaloneSeed().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ event: 'services_pricing_seed_failed', errorName: error instanceof Error ? error.name : 'UnknownError' })}\n`
    );
    process.exitCode = 1;
  });
}
