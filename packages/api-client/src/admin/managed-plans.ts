import type { components } from '../generated/schema';
import { isRecord, type ApiRequester } from '../api-client';
import {
  isManagedCollections,
  isManagedCollectionHistory,
  type RegisterManagedPaymentInput,
  type ReverseManagedPaymentInput,
  type ConfirmManagedExtraordinaryInput
} from './managed-collections';
export type * from './managed-collections';

type S = components['schemas'];
export type AdminManagedPlan = S['ManagedPlanResponseDto'];
export type AdminManagedPlanVersion = S['ManagedPlanVersionResponseDto'];
export type CreateManagedPlanVersionInput = S['CreateManagedPlanVersionRequestDto'];
export type SetManagedPlanAvailabilityInput = S['SetManagedPlanAvailabilityRequestDto'];
export type AdminManagedContract = S['ManagedContractResponseDto'];
export type AdminManagedContractTerms = S['ManagedContractTermsDto'];
export type AssignManagedContractInput = S['AssignManagedContractRequestDto'];
export type AdminManagedConsumption = S['ManagedConsumptionResponseDto'];
export type AdminManagedConsumptionPeriod = S['ManagedConsumptionPeriodDto'];
export type AdminManagedConsumedEvent = S['ManagedConsumedEventDto'];

export function createAdminManagedPlansClient(request: ApiRequester) {
  const id = encodeURIComponent;
  const plans = '/admin/managed-plans';
  const contracts = (clientId: string) => `/admin/clients/${id(clientId)}/managed-contracts`;
  const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
  return {
    list: (signal?: AbortSignal) => request({ path: plans, response: 'json', ...withSignal(signal) }, isPlanArray),
    createVersion: (planId: string, body: CreateManagedPlanVersionInput, key: string, signal?: AbortSignal) =>
      request(
        {
          method: 'POST',
          path: `${plans}/${id(planId)}/versions`,
          body,
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isVersion
      ),
    setAvailability: (planId: string, body: SetManagedPlanAvailabilityInput, key: string, signal?: AbortSignal) =>
      request(
        {
          method: 'POST',
          path: `${plans}/${id(planId)}/availability`,
          body,
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isPlan
      ),
    listContracts: (clientId: string, signal?: AbortSignal) =>
      request({ path: contracts(clientId), response: 'json', ...withSignal(signal) }, isContractArray),
    assignContract: (clientId: string, body: AssignManagedContractInput, key: string, signal?: AbortSignal) =>
      request(
        {
          method: 'POST',
          path: contracts(clientId),
          body,
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isContract
      ),
    getConsumption: (clientId: string, contractId: string, signal?: AbortSignal) =>
      request(
        { path: `${contracts(clientId)}/${id(contractId)}/consumption`, response: 'json', ...withSignal(signal) },
        isConsumption
      ),
    getCollections: (clientId: string, contractId: string, signal?: AbortSignal) =>
      request(
        { path: `${contracts(clientId)}/${id(contractId)}/collections`, response: 'json', ...withSignal(signal) },
        isManagedCollections
      ),
    getCollectionHistory: (clientId: string, contractId: string, signal?: AbortSignal) =>
      request(
        {
          path: `${contracts(clientId)}/${id(contractId)}/collections/history`,
          response: 'json',
          ...withSignal(signal)
        },
        isManagedCollectionHistory
      ),
    registerPayment: (
      clientId: string,
      contractId: string,
      body: RegisterManagedPaymentInput,
      key: string,
      signal?: AbortSignal
    ) =>
      request(
        {
          method: 'POST',
          path: `${contracts(clientId)}/${id(contractId)}/collections/payments`,
          body,
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isManagedCollections
      ),
    reversePayment: (
      clientId: string,
      contractId: string,
      paymentId: string,
      body: ReverseManagedPaymentInput,
      key: string,
      signal?: AbortSignal
    ) =>
      request(
        {
          method: 'POST',
          path: `${contracts(clientId)}/${id(contractId)}/collections/payments/${id(paymentId)}/reverse`,
          body,
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isManagedCollections
      ),
    confirmExtraordinary: (
      clientId: string,
      contractId: string,
      body: ConfirmManagedExtraordinaryInput,
      key: string,
      signal?: AbortSignal
    ) =>
      request(
        {
          method: 'POST',
          path: `${contracts(clientId)}/${id(contractId)}/collections/extraordinary-charges`,
          body,
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isManagedCollections
      )
  };
}

const statuses = new Set<unknown>(['CURRENT', 'FUTURE', 'EXPIRED']);
const modalities = new Set<unknown>(['STANDARD', 'PRIVATE']);
const tiers = new Set<unknown>(['ESSENTIAL', 'FREQUENT', 'INTENSIVE']);
const eventStatuses = new Set<unknown>([
  'DRAFT',
  'CONFIGURED',
  'READY_TO_ACTIVATE',
  'ACTIVE',
  'EVENT_DAY',
  'CLOSED',
  'ALBUM_PUBLISHED',
  'ARCHIVED',
  'CANCELLED'
]);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const positive = (value: unknown): value is number => integer(value) && value > 0;
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
  instant(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const string = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const nullableString = (value: unknown) => value === null || string(value);
const unique = (values: string[]) => new Set(values).size === values.length;

function isTerms(value: unknown): value is AdminManagedContractTerms {
  return (
    isRecord(value) &&
    string(value.planId) &&
    string(value.planVersionId) &&
    modalities.has(value.modality) &&
    tiers.has(value.tier) &&
    value.currency === 'MXN' &&
    value.beforeTax === true &&
    isVersionTerms(value)
  );
}
function isVersionTerms(value: Record<string, unknown>) {
  return (
    string(value.commercialName) &&
    positive(value.monthlyAmountMxnCents) &&
    integer(value.initialFeeMxnCents) &&
    positive(value.extraEventAmountMxnCents) &&
    value.contractMonths === 12 &&
    positive(value.includedEventsPerMonth) &&
    positive(value.monthlyEventLimit) &&
    value.includedEventsPerMonth <= value.monthlyEventLimit &&
    (value.includedEventsPerYear === null || positive(value.includedEventsPerYear)) &&
    positive(value.eventCapacity) &&
    value.eventCapacity <= 150 &&
    instant(value.validFrom) &&
    (value.validUntil === null ||
      (instant(value.validUntil) && Date.parse(value.validFrom) < Date.parse(value.validUntil)))
  );
}
function isVersion(value: unknown): value is AdminManagedPlanVersion {
  return (
    isRecord(value) &&
    string(value.id) &&
    string(value.planId) &&
    isVersionTerms(value) &&
    nullableString(value.createdByUserId) &&
    instant(value.createdAt) &&
    statuses.has(value.status)
  );
}
function isPlan(value: unknown): value is AdminManagedPlan {
  return (
    isRecord(value) &&
    string(value.id) &&
    modalities.has(value.modality) &&
    tiers.has(value.tier) &&
    typeof value.isAvailable === 'boolean' &&
    nullableString(value.currentVersionId) &&
    instant(value.createdAt) &&
    instant(value.updatedAt) &&
    Array.isArray(value.versions) &&
    value.versions.every(isVersion) &&
    value.versions.every((version) => version.planId === value.id) &&
    unique(value.versions.map((version) => version.id)) &&
    (value.currentVersionId === null ||
      value.versions.some((version) => version.id === value.currentVersionId && version.status === 'CURRENT'))
  );
}
function isPlanArray(value: unknown): value is AdminManagedPlan[] {
  return (
    Array.isArray(value) &&
    value.every(isPlan) &&
    unique(value.map((plan) => plan.id)) &&
    unique(value.map((plan) => `${plan.modality}:${plan.tier}`))
  );
}
function isContract(value: unknown): value is AdminManagedContract {
  return (
    isRecord(value) &&
    string(value.id) &&
    string(value.clientId) &&
    string(value.planVersionId) &&
    date(value.startsOn) &&
    date(value.endsOn) &&
    value.startsOn < value.endsOn &&
    instant(value.acceptedAt) &&
    instant(value.createdAt) &&
    string(value.createdByUserId) &&
    statuses.has(value.status) &&
    isTerms(value.terms) &&
    value.terms.planVersionId === value.planVersionId
  );
}
function isContractArray(value: unknown): value is AdminManagedContract[] {
  return Array.isArray(value) && value.every(isContract) && unique(value.map((contract) => contract.id));
}
function isPeriod(value: unknown): value is AdminManagedConsumptionPeriod {
  return (
    isRecord(value) &&
    positive(value.index) &&
    date(value.startsOn) &&
    date(value.endsOn) &&
    value.startsOn < value.endsOn &&
    integer(value.usedEvents) &&
    integer(value.includedUsedEvents) &&
    integer(value.extraordinaryEvents) &&
    integer(value.availableEvents) &&
    integer(value.cancelledEvents) &&
    value.usedEvents === value.includedUsedEvents + value.extraordinaryEvents &&
    value.cancelledEvents <= value.usedEvents
  );
}
function isConsumedEvent(value: unknown): value is AdminManagedConsumedEvent {
  return (
    isRecord(value) &&
    string(value.eventId) &&
    nullableString(value.name) &&
    instant(value.activatedAt) &&
    eventStatuses.has(value.status) &&
    positive(value.periodIndex) &&
    typeof value.extraordinary === 'boolean' &&
    typeof value.cancelled === 'boolean'
  );
}
function isConsumption(value: unknown): value is AdminManagedConsumption {
  if (
    !isRecord(value) ||
    !string(value.contractId) ||
    !string(value.clientId) ||
    !instant(value.asOf) ||
    !(value.currentPeriodIndex === null || positive(value.currentPeriodIndex)) ||
    !integer(value.usedEvents) ||
    !integer(value.includedUsedEvents) ||
    !integer(value.extraordinaryEvents) ||
    !integer(value.cancelledEvents) ||
    !integer(value.availableEvents) ||
    !(value.annualAvailableEvents === null || integer(value.annualAvailableEvents)) ||
    !Array.isArray(value.periods) ||
    !value.periods.every(isPeriod) ||
    !Array.isArray(value.events) ||
    !value.events.every(isConsumedEvent)
  )
    return false;
  return (
    unique(value.events.map((event) => event.eventId)) &&
    unique(value.periods.map((period) => String(period.index))) &&
    value.usedEvents === value.events.length &&
    value.usedEvents === value.includedUsedEvents + value.extraordinaryEvents &&
    value.includedUsedEvents === value.events.filter((event) => !event.extraordinary).length &&
    value.cancelledEvents === value.events.filter((event) => event.cancelled).length &&
    value.usedEvents === value.periods.reduce((total, period) => total + period.usedEvents, 0) &&
    value.extraordinaryEvents === value.periods.reduce((total, period) => total + period.extraordinaryEvents, 0) &&
    (value.currentPeriodIndex === null
      ? value.availableEvents === 0
      : value.periods.some((period) => period.index === value.currentPeriodIndex))
  );
}
