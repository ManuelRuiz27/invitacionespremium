import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../common/database/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { eventNotFound } from '../events/event-access.policy';
import { CommercialChannel, LedgerMovementType } from '../generated/prisma/client';
import type { PilotObservationResponseDto } from '../pilot-observations/pilot-observations.dto';
import { PilotObservationsService } from '../pilot-observations/pilot-observations.service';
import { emptyOperatorMinutesByArea, type UnitEconomicsResponseDto } from './unit-economics.dto';

const COST_KINDS = new Set(['DESIGNER_COST', 'EXTERNAL_COST', 'TECHNOLOGY_COST']);

@Injectable()
export class UnitEconomicsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(PilotObservationsService) private readonly observations: PilotObservationsService
  ) {}

  async getEvent(clientId: string, eventId: string): Promise<UnitEconomicsResponseDto> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, clientId, deletedAt: null },
      select: {
        id: true,
        clientId: true,
        name: true,
        status: true,
        capacity: true,
        activatedAt: true,
        finalCostCredits: true,
        commercialChannelSnapshot: true,
        commercialCapacityMinSnapshot: true,
        commercialCapacityMaxSnapshot: true,
        commercialVenueTierSnapshot: true,
        service: { select: { code: true } },
        activatedService: { select: { code: true } },
        client: { select: { commercialChannel: true } }
      }
    });
    if (!event) throw eventNotFound();

    const [journal, refunds] = await Promise.all([
      this.observations.get(clientId, eventId),
      this.prisma.ledgerEntry.findMany({
        where: { eventId, movementType: LedgerMovementType.EVENT_CREDIT_REFUND },
        select: { purchasedCreditDelta: true, debtDelta: true }
      })
    ]);
    const activeObservations = journal.observations.filter((observation) => observation.correctedAt === undefined);
    const grossRevenueCredits = event.finalCostCredits ?? 0;
    const refundCredits = refunds.reduce(
      (total, refund) => total + Math.max(0, refund.purchasedCreditDelta) + Math.max(0, -refund.debtDelta),
      0
    );
    if (refundCredits > grossRevenueCredits) {
      throw new DomainError(
        'UNIT_ECONOMICS_REFUND_INVARIANT_VIOLATION',
        'Event refunds exceed gross revenue.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
    const netRevenueCredits = grossRevenueCredits - refundCredits;
    const creditUnitValueMxnCents = this.config.creditUnitValueMxnCents;
    const grossRevenueMxnCents = safeMultiply(grossRevenueCredits, creditUnitValueMxnCents);
    const refundMxnCents = safeMultiply(refundCredits, creditUnitValueMxnCents);
    const netRevenueMxnCents = safeMultiply(netRevenueCredits, creditUnitValueMxnCents);
    const designerCostMxnCents = sumAmounts(activeObservations, 'DESIGNER_COST');
    const externalCostMxnCents = sumAmounts(activeObservations, 'EXTERNAL_COST');
    const technologyCostMxnCents = sumAmounts(activeObservations, 'TECHNOLOGY_COST');
    const directCostMxnCents = designerCostMxnCents + externalCostMxnCents + technologyCostMxnCents;
    const designRounds = activeObservations.reduce(
      (total, observation) => total + (observation.kind === 'DESIGN_ROUND' ? observation.count : 0),
      0
    );
    const operatorMinutesByArea = emptyOperatorMinutesByArea();
    let operatorMinutesTotal = 0;
    for (const observation of activeObservations) {
      if (COST_KINDS.has(observation.kind) || observation.durationMinutes === undefined) continue;
      operatorMinutesTotal += observation.durationMinutes;
      operatorMinutesByArea[observation.area] += observation.durationMinutes;
    }
    const operatorHourlyRateMxnCents = this.config.unitEconomicsOperatorHourlyRateMxnCents ?? null;
    const operatorShadowCostMxnCents =
      operatorHourlyRateMxnCents === null ? null : Math.round((operatorMinutesTotal * operatorHourlyRateMxnCents) / 60);
    const contributionMarginMxnCents = netRevenueMxnCents - directCostMxnCents;
    const contributionAfterOperatorShadowMxnCents =
      operatorShadowCostMxnCents === null ? null : contributionMarginMxnCents - operatorShadowCostMxnCents;
    const commercial = event.commercialChannelSnapshot
      ? { commercialChannel: event.commercialChannelSnapshot, commercialChannelSource: 'SNAPSHOT' as const }
      : {
          commercialChannel: event.client.commercialChannel ?? CommercialChannel.STANDARD,
          commercialChannelSource: 'CURRENT_CLIENT' as const
        };

    return {
      eventId: event.id,
      clientId: event.clientId,
      eventName: event.name,
      eventStatus: event.status,
      serviceCode: event.activatedService?.code ?? event.service?.code ?? null,
      ...commercial,
      capacity: event.capacity,
      capacityMin: event.commercialCapacityMinSnapshot,
      capacityMax: event.commercialCapacityMaxSnapshot,
      venueTier: event.commercialVenueTierSnapshot,
      activatedAt: event.activatedAt?.toISOString() ?? null,
      grossRevenueCredits,
      refundCredits,
      netRevenueCredits,
      creditUnitValueMxnCents,
      grossRevenueMxnCents,
      refundMxnCents,
      netRevenueMxnCents,
      designerCostMxnCents,
      externalCostMxnCents,
      technologyCostMxnCents,
      directCostMxnCents,
      designRounds,
      operatorMinutesTotal,
      operatorMinutesByArea,
      operatorHourlyRateMxnCents,
      operatorShadowCostMxnCents,
      contributionMarginMxnCents,
      contributionMarginPct: percentage(contributionMarginMxnCents, netRevenueMxnCents),
      contributionAfterOperatorShadowMxnCents,
      contributionAfterOperatorShadowPct:
        contributionAfterOperatorShadowMxnCents === null
          ? null
          : percentage(contributionAfterOperatorShadowMxnCents, netRevenueMxnCents)
    };
  }
}

function sumAmounts(observations: PilotObservationResponseDto[], kind: PilotObservationResponseDto['kind']): number {
  return observations.reduce(
    (total, observation) => total + (observation.kind === kind ? (observation.amountMxnCents ?? 0) : 0),
    0
  );
}

function safeMultiply(value: number, multiplier: number): number {
  const result = value * multiplier;
  if (!Number.isSafeInteger(result)) {
    throw new DomainError(
      'UNIT_ECONOMICS_VALUE_OUT_OF_RANGE',
      'Unit economics value exceeds the safe numeric range.',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
  return result;
}

function percentage(value: number, revenue: number): number | null {
  return revenue === 0 ? null : Math.round((value / revenue) * 10_000) / 100;
}
