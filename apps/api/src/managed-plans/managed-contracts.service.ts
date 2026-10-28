import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import {
  ClientOperatingProfile,
  ClientStatus,
  ClientType,
  type ManagedPlanContract,
  type Prisma,
  ServiceCode
} from '../generated/prisma/client';
import { addContractMonths, contractDate, contractLocalDate } from './managed-contract-dates';
import { projectManagedConsumption } from './managed-contract-consumption';
import { ManagedPlanMutationsService, requireManagedPlanProvider } from './managed-plan-mutations.service';
import { buildManagedPlanTerms } from './managed-plan-terms';
import {
  type AssignManagedContractInput,
  type ManagedConsumptionResponseDto,
  type ManagedContractResponseDto,
  parseManagedContractTerms
} from './managed-contracts.dto';

@Injectable()
export class ManagedContractsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ManagedPlanMutationsService) private readonly mutations: ManagedPlanMutationsService
  ) {}

  list(clientId: string, principal: AuthPrincipal): Promise<ManagedContractResponseDto[]> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await requireManagedPlanProvider(tx, principal);
        await requireClient(tx, clientId);
        const { now } = (await tx.$queryRaw<{ now: Date }[]>`SELECT transaction_timestamp() AS now`)[0]!;
        const rows = await tx.managedPlanContract.findMany({
          where: { clientId },
          orderBy: [{ startsOn: 'desc' }, { id: 'desc' }]
        });
        return rows.map((row) => contractResponse(row, now));
      },
      { isolationLevel: 'RepeatableRead' }
    );
  }

  async assign(
    clientId: string,
    key: string,
    input: AssignManagedContractInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ManagedContractResponseDto> {
    try {
      return await this.mutations.run(
        'CONTRACT_ASSIGN',
        key,
        principal,
        { clientId, input },
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM client WHERE id=${clientId}::uuid FOR UPDATE`;
          const client = await requireClient(tx, clientId);
          if (
            client.type !== ClientType.ORGANIZATION ||
            client.operatingProfile !== ClientOperatingProfile.MANAGED ||
            client.status !== ClientStatus.ACTIVE
          ) {
            throw new DomainError(
              'MANAGED_CONTRACT_CLIENT_NOT_ELIGIBLE',
              'A live Managed Organization is required.',
              HttpStatus.CONFLICT
            );
          }
          const version = await tx.managedPlanVersion.findUnique({
            where: { id: input.planVersionId },
            include: { plan: true }
          });
          if (!version)
            throw new DomainError(
              'MANAGED_PLAN_VERSION_NOT_FOUND',
              'Managed price version not found.',
              HttpStatus.NOT_FOUND
            );
          await tx.$queryRaw`SELECT id FROM managed_plan WHERE id=${version.planId}::uuid FOR UPDATE`;
          const current = await tx.$queryRaw<{ id: string }[]>`
          SELECT v.id FROM managed_plan_version v JOIN managed_plan p ON p.id=v.plan_id
          WHERE v.id=${version.id}::uuid AND p.is_available
          AND v.valid_from<=transaction_timestamp()
          AND (v.valid_until IS NULL OR transaction_timestamp()<v.valid_until)
        `;
          if (current.length !== 1) {
            throw new DomainError(
              'MANAGED_CONTRACT_VERSION_NOT_CURRENT',
              'Accept the currently available price version.',
              HttpStatus.CONFLICT
            );
          }
          const endsOn = addContractMonths(input.startsOn, version.contractMonths);
          if (!/^\d{4}-\d{2}-\d{2}$/u.test(endsOn)) {
            throw new DomainError(
              'VALIDATION_ERROR',
              'The contract dates are outside the supported calendar range.',
              HttpStatus.BAD_REQUEST
            );
          }
          const start = new Date(`${input.startsOn}T00:00:00.000Z`),
            end = new Date(`${endsOn}T00:00:00.000Z`);
          const overlapping = await tx.managedPlanContract.findFirst({
            where: { clientId, startsOn: { lt: end }, endsOn: { gt: start } },
            select: { id: true }
          });
          if (overlapping) throw contractOverlap();
          const terms = buildManagedPlanTerms(version, version.plan);
          const row = await tx.managedPlanContract.create({
            data: {
              clientId,
              planVersionId: version.id,
              startsOn: start,
              endsOn: end,
              terms: terms as Prisma.InputJsonObject,
              createdByUserId: principal.userId
            }
          });
          const result = contractResponse(row, row.acceptedAt);
          return {
            result,
            audit: {
              clientId,
              resourceType: 'MANAGED_CONTRACT',
              resourceId: row.id,
              action: 'MANAGED_CONTRACT_ASSIGN',
              afterData: { ...result },
              metadata: { paymentAndRenewal: 'MANUAL', cancellationResolution: 'MANUAL' }
            }
          };
        },
        operationId
      );
    } catch (error) {
      if (String(error).includes('managed_plan_contract_no_overlap')) throw contractOverlap();
      throw error;
    }
  }

  consumption(clientId: string, contractId: string, principal: AuthPrincipal): Promise<ManagedConsumptionResponseDto> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await requireManagedPlanProvider(tx, principal);
        await requireClient(tx, clientId);
        const contract = await tx.managedPlanContract.findFirst({ where: { id: contractId, clientId } });
        if (!contract)
          throw new DomainError('MANAGED_CONTRACT_NOT_FOUND', 'Managed contract not found.', HttpStatus.NOT_FOUND);
        return managedContractConsumption(tx, contract);
      },
      { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 10_000 }
    );
  }
}

async function requireClient(tx: Prisma.TransactionClient, clientId: string) {
  const client = await tx.client.findFirst({ where: { id: clientId, deletedAt: null } });
  if (!client) throw new DomainError('CLIENT_NOT_FOUND', 'Client not found.', HttpStatus.NOT_FOUND);
  return client;
}

function contractResponse(row: ManagedPlanContract, now: Date): ManagedContractResponseDto {
  const startsOn = contractDate(row.startsOn),
    endsOn = contractDate(row.endsOn),
    today = contractLocalDate(now);
  const terms = parseManagedContractTerms(row.terms);
  if (terms.planVersionId !== row.planVersionId || addContractMonths(startsOn, terms.contractMonths) !== endsOn) {
    throw new DomainError(
      'MANAGED_CONTRACT_INCONSISTENT',
      'Managed contract terms are unavailable.',
      HttpStatus.CONFLICT
    );
  }
  return {
    id: row.id,
    clientId: row.clientId,
    planVersionId: row.planVersionId,
    startsOn,
    endsOn,
    acceptedAt: row.acceptedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    status: today < startsOn ? 'FUTURE' : today >= endsOn ? 'EXPIRED' : 'CURRENT',
    terms
  };
}

function contractOverlap() {
  return new DomainError(
    'MANAGED_CONTRACT_OVERLAP',
    'The contract overlaps another assignment for this Organization.',
    HttpStatus.CONFLICT
  );
}

// Shared by PR02 reads and PR03 confirmation in the caller's transaction.
export async function managedContractConsumption(
  tx: Prisma.TransactionClient,
  contract: ManagedPlanContract
): Promise<ManagedConsumptionResponseDto> {
  const { now, start, end } = (
    await tx.$queryRaw<{ now: Date; start: Date; end: Date }[]>`
        SELECT transaction_timestamp() AS "now",
        (${contractDate(contract.startsOn)}::date::timestamp AT TIME ZONE 'America/Mexico_City') AS "start",
        (${contractDate(contract.endsOn)}::date::timestamp AT TIME ZONE 'America/Mexico_City') AS "end"
      `
  )[0]!;
  const rows = await tx.event.findMany({
    where: {
      clientId: contract.clientId,
      activatedAt: { gte: start, lt: end, lte: now },
      activatedService: { code: ServiceCode.ACCESS_CONTROL }
    },
    select: { id: true, name: true, activatedAt: true, status: true },
    orderBy: [{ activatedAt: 'asc' }, { id: 'asc' }]
  });
  // Deliberately include cancelled/soft-deleted activations: no automatic quota refund.
  return projectManagedConsumption(
    contract,
    parseManagedContractTerms(contract.terms),
    rows.map((row) => ({ ...row, activatedAt: row.activatedAt! })),
    now
  );
}
