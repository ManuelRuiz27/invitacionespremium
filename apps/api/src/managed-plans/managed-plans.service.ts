import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { ManagedPlanTier, type ManagedPlan, type Prisma } from '../generated/prisma/client';
import { ManagedPlanMutationsService, requireManagedPlanProvider } from './managed-plan-mutations.service';
import { toManagedPlanVersionResponse } from './managed-plan-terms';
import type {
  CreateManagedPlanVersionInput,
  ManagedPlanResponseDto,
  ManagedPlanVersionResponseDto,
  SetManagedPlanAvailabilityInput
} from './managed-plans.dto';

@Injectable()
export class ManagedPlansService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ManagedPlanMutationsService) private readonly mutations: ManagedPlanMutationsService
  ) {}

  async list(principal: AuthPrincipal): Promise<ManagedPlanResponseDto[]> {
    return this.prisma.$transaction(
      async (tx) => {
        await requireManagedPlanProvider(tx, principal);
        const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT transaction_timestamp() AS now`)[0]!.now;
        const rows = await tx.managedPlan.findMany({
          include: { versions: { orderBy: [{ validFrom: 'desc' }, { id: 'desc' }] } },
          orderBy: [{ modality: 'asc' }, { tier: 'asc' }]
        });
        return rows.map((plan) => planResponse(plan, now!));
      },
      { isolationLevel: 'RepeatableRead' }
    );
  }

  createVersion(
    planId: string,
    input: CreateManagedPlanVersionInput,
    key: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ManagedPlanVersionResponseDto> {
    return this.mutations.run(
      'VERSION_CREATE',
      key,
      principal,
      { planId, input },
      async (tx) => {
        const plan = await lockPlan(tx, planId);
        if ((plan.tier === ManagedPlanTier.FREQUENT) !== (input.includedEventsPerYear !== null))
          throw invalid('Only the Frequent plan uses an annual event allowance.');
        if (plan.tier !== ManagedPlanTier.FREQUENT && input.monthlyEventLimit !== input.includedEventsPerMonth)
          throw invalid('Monthly-only plans use their monthly included allowance as their monthly limit.');
        const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT transaction_timestamp() AS now`)[0]!.now;
        const from = input.validFrom ? new Date(input.validFrom) : now!;
        const until = input.validUntil ? new Date(input.validUntil) : null;
        if (from < now! || (until !== null && until <= from))
          throw invalid('Price validity cannot rewrite elapsed history.');
        const overlaps = await tx.managedPlanVersion.findMany({
          where: {
            planId,
            ...(until ? { validFrom: { lt: until } } : {}),
            OR: [{ validUntil: null }, { validUntil: { gt: from } }]
          }
        });
        const previous = overlaps.find((version) => version.validUntil === null && version.validFrom < from);
        if (overlaps.some((version) => version.id !== previous?.id))
          throw new DomainError(
            'MANAGED_PLAN_VERSION_OVERLAP',
            'The requested validity overlaps another price version.',
            HttpStatus.CONFLICT
          );
        if (previous) await tx.managedPlanVersion.update({ where: { id: previous.id }, data: { validUntil: from } });
        const version = await tx.managedPlanVersion.create({
          data: {
            ...input,
            planId,
            validFrom: from,
            validUntil: until,
            createdByUserId: principal.userId
          }
        });
        const result = toManagedPlanVersionResponse(version, now!);
        return {
          result,
          audit: {
            resourceType: 'MANAGED_PLAN_VERSION',
            resourceId: version.id,
            action: 'MANAGED_PLAN_VERSION_CREATE',
            ...(previous ? { beforeData: { previousVersionId: previous.id, previousValidUntil: null } } : {}),
            afterData: { ...result },
            metadata: { planId, closedPreviousVersionId: previous?.id ?? null }
          }
        };
      },
      operationId
    );
  }

  setAvailability(
    planId: string,
    input: SetManagedPlanAvailabilityInput,
    key: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ManagedPlanResponseDto> {
    return this.mutations.run(
      'AVAILABILITY_SET',
      key,
      principal,
      { planId, input },
      async (tx) => {
        const previous = await lockPlan(tx, planId);
        const plan = await tx.managedPlan.update({
          where: { id: planId },
          data: { isAvailable: input.isAvailable },
          include: { versions: { orderBy: [{ validFrom: 'desc' }, { id: 'desc' }] } }
        });
        const now = (await tx.$queryRaw<{ now: Date }[]>`SELECT transaction_timestamp() AS now`)[0]!.now;
        return {
          result: planResponse(plan, now!),
          audit: {
            resourceType: 'MANAGED_PLAN',
            resourceId: planId,
            action: 'MANAGED_PLAN_AVAILABILITY_SET',
            beforeData: { isAvailable: previous.isAvailable },
            afterData: { isAvailable: plan.isAvailable }
          }
        };
      },
      operationId
    );
  }
}

async function lockPlan(tx: Prisma.TransactionClient, planId: string): Promise<ManagedPlan> {
  await tx.$queryRaw`SELECT id FROM managed_plan WHERE id=${planId}::uuid FOR UPDATE`;
  const plan = await tx.managedPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new DomainError('MANAGED_PLAN_NOT_FOUND', 'Managed plan not found.', HttpStatus.NOT_FOUND);
  return plan;
}

function planResponse(
  plan: Prisma.ManagedPlanGetPayload<{ include: { versions: true } }>,
  now: Date
): ManagedPlanResponseDto {
  const versions = plan.versions.map((version) => toManagedPlanVersionResponse(version, now));
  return {
    id: plan.id,
    modality: plan.modality,
    tier: plan.tier,
    isAvailable: plan.isAvailable,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    currentVersionId: versions.find((version) => version.status === 'CURRENT')?.id ?? null,
    versions
  };
}
function invalid(message: string) {
  return new DomainError('MANAGED_PLAN_INVALID_CONFIGURATION', message, HttpStatus.BAD_REQUEST);
}
