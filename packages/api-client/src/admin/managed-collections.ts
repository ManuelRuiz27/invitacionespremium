import type { components } from '../generated/schema';
import { isRecord } from '../api-client';

type S = components['schemas'];
export type AdminManagedCollections = S['ManagedCollectionsResponseDto'];
export type AdminManagedObligation = S['ManagedCollectionObligationDto'];
export type AdminManagedCollectionHistoryEntry = S['ManagedCollectionHistoryEntryDto'];
export type RegisterManagedPaymentInput = S['ManagedCollectionPaymentRequestDto'];
export type ReverseManagedPaymentInput = S['ManagedCollectionReversalRequestDto'];
export type ConfirmManagedExtraordinaryInput = S['ManagedExtraordinaryChargeRequestDto'];

const text = (value: unknown) => typeof value === 'string' && value.length > 0;
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const integer = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const instant = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const date = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
  instant(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const concepts = new Set<unknown>(['IMPLEMENTATION', 'MONTHLY', 'EXTRAORDINARY']);
const methods = new Set<unknown>(['TRANSFER', 'CASH', 'CARD', 'OTHER']);

export function isManagedCollectionHistory(value: unknown): value is AdminManagedCollectionHistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        isRecord(row) &&
        text(row.id) &&
        ['PAYMENT', 'REVERSAL', 'EXTRA_CONFIRM'].includes(row.kind as string) &&
        nullableText(row.paymentId) &&
        nullableText(row.extraordinaryChargeId) &&
        text(row.obligationId) &&
        integer(row.amountMxnCents) &&
        date(row.effectiveOn) &&
        instant(row.occurredAt) &&
        text(row.actorUserId) &&
        text(row.actorLabel) &&
        (row.method === null || methods.has(row.method)) &&
        nullableText(row.reference) &&
        nullableText(row.notes) &&
        nullableText(row.reversalReason) &&
        typeof row.reversed === 'boolean'
    )
  );
}

export function isManagedCollections(value: unknown): value is AdminManagedCollections {
  if (
    !isRecord(value) ||
    !text(value.clientId) ||
    !text(value.contractId) ||
    !date(value.today) ||
    value.currency !== 'MXN' ||
    value.beforeTax !== true ||
    !isRecord(value.summary) ||
    !isRecord(value.alerts)
  )
    return false;
  const summary = value.summary;
  return (
    ['totalMxnCents', 'paidMxnCents', 'balanceMxnCents', 'overdueMxnCents', 'dueMxnCents', 'futureMxnCents'].every(
      (key) => integer(summary[key])
    ) &&
    integer(value.alerts.overdueInstallments) &&
    typeof value.alerts.endingWithin30Days === 'boolean' &&
    typeof value.alerts.expiredWithoutSuccessor === 'boolean' &&
    Array.isArray(value.obligations) &&
    value.obligations.every(
      (row) =>
        isRecord(row) &&
        text(row.id) &&
        concepts.has(row.concept) &&
        (row.installmentNumber === null || integer(row.installmentNumber)) &&
        nullableText(row.extraordinaryChargeId) &&
        nullableText(row.eventId) &&
        text(row.label) &&
        date(row.dueOn) &&
        integer(row.amountMxnCents) &&
        integer(row.paidMxnCents) &&
        integer(row.balanceMxnCents) &&
        ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].includes(row.status as string) &&
        typeof row.overdue === 'boolean'
    ) &&
    Array.isArray(value.extraordinaryCandidates) &&
    value.extraordinaryCandidates.every(
      (row) =>
        isRecord(row) &&
        text(row.eventId) &&
        nullableText(row.name) &&
        (row.eventDateTime === null || instant(row.eventDateTime)) &&
        instant(row.activatedAt) &&
        typeof row.cancelled === 'boolean' &&
        integer(row.amountMxnCents) &&
        nullableText(row.confirmedChargeId)
    ) &&
    isManagedCollectionHistory(value.history)
  );
}
