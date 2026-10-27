import { EventStatus, type ManagedPlanContract } from '../generated/prisma/client';
import type { ManagedContractTermsDto, ManagedConsumptionResponseDto } from './managed-contracts.dto';
import { addContractMonths, contractDate, contractLocalDate } from './managed-contract-dates';

export interface ManagedConsumptionEvent {
  id: string;
  name: string | null;
  activatedAt: Date;
  status: EventStatus;
}

/** Read-only projection. It never reserves quota, charges money or changes activation. */
export function projectManagedConsumption(
  contract: Pick<ManagedPlanContract, 'id' | 'clientId' | 'startsOn' | 'endsOn'>,
  terms: ManagedContractTermsDto,
  activations: ManagedConsumptionEvent[],
  asOf: Date
): ManagedConsumptionResponseDto {
  const startsOn = contractDate(contract.startsOn);
  const endsOn = contractDate(contract.endsOn);
  const today = contractLocalDate(asOf);
  const periods = Array.from({ length: terms.contractMonths }, (_, offset) => ({
    index: offset + 1,
    startsOn: addContractMonths(startsOn, offset),
    endsOn: addContractMonths(startsOn, offset + 1),
    usedEvents: 0,
    includedUsedEvents: 0,
    extraordinaryEvents: 0,
    cancelledEvents: 0,
    availableEvents: 0
  }));
  const events: ManagedConsumptionResponseDto['events'] = [];
  const seen = new Set<string>();
  let includedUsedEvents = 0;
  const ordered = [...activations].sort(
    (left, right) =>
      left.activatedAt.valueOf() - right.activatedAt.valueOf() ||
      (left.id < right.id ? -1 : left.id === right.id ? 0 : 1)
  );
  for (const event of ordered) {
    if (seen.has(event.id) || event.activatedAt > asOf) continue;
    const date = contractLocalDate(event.activatedAt);
    if (date < startsOn || date >= endsOn) continue;
    const period = periods.find((item) => item.startsOn <= date && date < item.endsOn);
    if (!period) continue;
    seen.add(event.id);
    const monthlyAllowance =
      terms.includedEventsPerYear === null ? terms.includedEventsPerMonth : terms.monthlyEventLimit;
    const extraordinary =
      period.includedUsedEvents >= monthlyAllowance ||
      (terms.includedEventsPerYear !== null && includedUsedEvents >= terms.includedEventsPerYear);
    const cancelled = event.status === EventStatus.CANCELLED;
    period.usedEvents += 1;
    if (extraordinary) period.extraordinaryEvents += 1;
    else {
      period.includedUsedEvents += 1;
      includedUsedEvents += 1;
    }
    if (cancelled) period.cancelledEvents += 1;
    events.push({
      eventId: event.id,
      name: event.name,
      activatedAt: event.activatedAt.toISOString(),
      status: event.status,
      periodIndex: period.index,
      extraordinary,
      cancelled
    });
  }
  let cumulativeIncluded = 0;
  for (const period of periods) {
    cumulativeIncluded += period.includedUsedEvents;
    const monthlyAllowance =
      terms.includedEventsPerYear === null ? terms.includedEventsPerMonth : terms.monthlyEventLimit;
    period.availableEvents = Math.max(
      0,
      Math.min(
        monthlyAllowance - period.includedUsedEvents,
        terms.includedEventsPerYear === null
          ? Number.POSITIVE_INFINITY
          : terms.includedEventsPerYear - cumulativeIncluded
      )
    );
  }
  const current = periods.find((period) => period.startsOn <= today && today < period.endsOn);
  return {
    contractId: contract.id,
    clientId: contract.clientId,
    asOf: asOf.toISOString(),
    currentPeriodIndex: current?.index ?? null,
    usedEvents: events.length,
    includedUsedEvents,
    extraordinaryEvents: events.length - includedUsedEvents,
    cancelledEvents: events.filter((event) => event.cancelled).length,
    availableEvents: current?.availableEvents ?? 0,
    annualAvailableEvents:
      terms.includedEventsPerYear === null ? null : Math.max(0, terms.includedEventsPerYear - includedUsedEvents),
    periods,
    events
  };
}
