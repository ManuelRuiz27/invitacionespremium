import type { ManagedPlan, ManagedPlanVersion } from '../generated/prisma/client';
import type { ManagedPlanVersionResponseDto } from './managed-plans.dto';

export function toManagedPlanVersionResponse(version: ManagedPlanVersion, now: Date): ManagedPlanVersionResponseDto {
  return {
    ...version,
    validFrom: version.validFrom.toISOString(),
    validUntil: version.validUntil?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    status:
      version.validFrom > now
        ? 'FUTURE'
        : version.validUntil !== null && version.validUntil <= now
          ? 'EXPIRED'
          : 'CURRENT'
  };
}

export function buildManagedPlanTerms(version: ManagedPlanVersion, plan: ManagedPlan) {
  return {
    planId: plan.id,
    planVersionId: version.id,
    modality: plan.modality,
    tier: plan.tier,
    commercialName: version.commercialName,
    monthlyAmountMxnCents: version.monthlyAmountMxnCents,
    initialFeeMxnCents: version.initialFeeMxnCents,
    extraEventAmountMxnCents: version.extraEventAmountMxnCents,
    contractMonths: version.contractMonths,
    includedEventsPerMonth: version.includedEventsPerMonth,
    monthlyEventLimit: version.monthlyEventLimit,
    includedEventsPerYear: version.includedEventsPerYear,
    eventCapacity: version.eventCapacity,
    validFrom: version.validFrom.toISOString(),
    validUntil: version.validUntil?.toISOString() ?? null,
    currency: 'MXN' as const,
    beforeTax: true as const
  };
}
