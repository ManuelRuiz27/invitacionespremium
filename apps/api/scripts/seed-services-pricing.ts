import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuditedMutationService, auditedResult } from '../src/audit/audited-mutation.service';
import { AuditActorType, ClientType, ServiceCode } from '../src/generated/prisma/client';
import { loadEnvironmentFiles } from '../src/config/load-environment';

const initialValidFrom = new Date('2026-07-24T00:00:00.000Z');
const initialCredits: Record<ClientType, Record<ServiceCode, number>> = {
  [ClientType.PLANNER]: {
    [ServiceCode.FLIPBOOK]: 30,
    [ServiceCode.FLYER]: 20,
    [ServiceCode.PHYSICAL_QR]: 15,
    [ServiceCode.DEMO]: 0
  },
  [ClientType.ORGANIZATION]: {
    [ServiceCode.FLIPBOOK]: 27,
    [ServiceCode.FLYER]: 17,
    [ServiceCode.PHYSICAL_QR]: 10,
    [ServiceCode.DEMO]: 0
  }
};

async function seedServicesPricing(): Promise<void> {
  loadEnvironmentFiles();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log']
  });

  try {
    const auditedMutation = app.get(AuditedMutationService);
    const operationId = randomUUID();
    const result = await auditedMutation.execute({
      actor: { type: AuditActorType.SYSTEM },
      resourceType: 'SERVICES_PRICING_SEED',
      action: 'SERVICES_PRICING_SEEDED',
      operationId,
      metadata: { source: 'idempotent_seed', initialValidFrom },
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
        const prices = Object.values(ClientType).flatMap((clientType) =>
          Object.values(ServiceCode).map((code) => ({
            serviceId: requiredServiceId(serviceIds, code),
            clientType,
            credits: initialCredits[clientType][code],
            validFrom: initialValidFrom
          }))
        );
        const createdPrices = await transaction.servicePrice.createMany({
          data: prices,
          skipDuplicates: true
        });

        return auditedResult(
          {
            services: services.length,
            pricesCreated: createdPrices.count
          },
          {
            serviceCodes: Object.values(ServiceCode),
            initialPriceCount: prices.length,
            pricesCreated: createdPrices.count
          }
        );
      }
    });

    process.stdout.write(`${JSON.stringify({ event: 'services_pricing_seeded', operationId, ...result })}\n`);
  } finally {
    await app.close();
  }
}

function requiredServiceId(serviceIds: Map<ServiceCode, string>, code: ServiceCode): string {
  const serviceId = serviceIds.get(code);

  if (!serviceId) {
    throw new Error(`Missing seeded service id for ${code}.`);
  }

  return serviceId;
}

void seedServicesPricing().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      event: 'services_pricing_seed_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError'
    })}\n`
  );
  process.exitCode = 1;
});
