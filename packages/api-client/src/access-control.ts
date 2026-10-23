import type { components } from './generated/schema';
import { isRecord, type ApiRequester } from './api-client';

type S = components['schemas'];
export type AccessControlReadiness = S['AccessControlReadinessResponseDto'];
export type NominalAccessCredential = S['NominalAccessCredentialResponseDto'];
export type NominalAccessRevokeInput = S['RevokeNominalAccessRequestDto'];
export type PhysicalPassRevokeInput = S['RevokePhysicalPassRequestDto'];
export type PhysicalPassRevokeResult = S['RevokePhysicalPassResponseDto'];
export type AccessOperationalSummary = S['AccessOperationalSummaryDto'];
export type NominalAccessOperations = S['NominalAccessOperationsDto'];
export type AnonymousAccessOperations = S['AnonymousAccessOperationsDto'];
export type AccessOperations = NominalAccessOperations | AnonymousAccessOperations;

const summaryKeys = [
  'eventId',
  'accessMode',
  'eventStatus',
  'capacity',
  'issuedHistorical',
  'revokedHistorical',
  'activeRights',
  'entered',
  'pending',
  'availableCapacity',
  'asOf',
  'tables'
];
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function counters(value: Record<string, unknown>, nullable = false): boolean {
  return (
    integer(value.activeRights) &&
    integer(value.entered) &&
    integer(value.pending) &&
    value.activeRights === value.entered + value.pending &&
    ((nullable && value.capacity === null && value.availableCapacity === null && value.activeRights === 0) ||
      (integer(value.capacity) &&
        integer(value.availableCapacity) &&
        value.availableCapacity === value.capacity - value.activeRights))
  );
}
function summary(value: unknown): value is AccessOperationalSummary {
  return (
    isRecord(value) &&
    typeof value.eventId === 'string' &&
    (value.accessMode === 'NOMINAL' || value.accessMode === 'ANONYMOUS') &&
    ['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE', 'ACTIVE', 'EVENT_DAY', 'CLOSED', 'CANCELLED', 'ARCHIVED'].includes(
      String(value.eventStatus)
    ) &&
    counters(value, true) &&
    Number(value.activeRights) <= 150 &&
    (value.capacity === null || Number(value.capacity) > 0) &&
    integer(value.issuedHistorical) &&
    integer(value.revokedHistorical) &&
    value.revokedHistorical + Number(value.activeRights) <= value.issuedHistorical &&
    date(value.asOf) &&
    Array.isArray(value.tables) &&
    value.tables.every(
      (table) =>
        isRecord(table) &&
        exact(table, ['tableId', 'tableName', 'capacity', 'activeRights', 'entered', 'pending', 'availableCapacity']) &&
        typeof table.tableId === 'string' &&
        typeof table.tableName === 'string' &&
        counters(table)
    ) &&
    new Set(value.tables.map((table) => table.tableId)).size === value.tables.length &&
    (value.tables.length === 0 ||
      (value.tables.reduce((sum, table) => sum + table.activeRights, 0) === value.activeRights &&
        value.tables.reduce((sum, table) => sum + table.entered, 0) === value.entered))
  );
}
export function isAccessOperationalSummary(value: unknown): value is AccessOperationalSummary {
  return summary(value) && exact(value as unknown as Record<string, unknown>, summaryKeys);
}
export function isAccessOperations(value: unknown): value is AccessOperations {
  if (!summary(value)) return false;
  const record = value as unknown as Record<string, unknown>;
  if (
    !exact(record, [...summaryKeys, 'detailPage', 'detailPageSize', 'detailTotal', 'details']) ||
    !integer(record.detailPage) ||
    record.detailPage < 1 ||
    record.detailPageSize !== 150 ||
    !integer(record.detailTotal) ||
    record.detailTotal !== (value.accessMode === 'NOMINAL' ? value.activeRights : value.issuedHistorical) ||
    !Array.isArray(record.details) ||
    record.details.length !== Math.min(150, Math.max(0, record.detailTotal - (record.detailPage - 1) * 150))
  )
    return false;
  const table = (item: unknown) =>
    item === null ||
    (isRecord(item) && exact(item, ['id', 'name']) && typeof item.id === 'string' && typeof item.name === 'string');
  if (value.accessMode === 'NOMINAL')
    return (
      record.details.every(
        (item) =>
          isRecord(item) &&
          exact(item, ['assistantId', 'name', 'group', 'table', 'seat', 'status', 'enteredAt']) &&
          typeof item.assistantId === 'string' &&
          typeof item.name === 'string' &&
          (item.group === null || typeof item.group === 'string') &&
          table(item.table) &&
          (item.seat === null ||
            (isRecord(item.seat) &&
              exact(item.seat, ['id', 'label']) &&
              typeof item.seat.id === 'string' &&
              typeof item.seat.label === 'string')) &&
          ((item.status === 'PENDING' && item.enteredAt === null) ||
            (item.status === 'ENTERED' && date(item.enteredAt)))
      ) && new Set(record.details.map((item) => item.assistantId)).size === record.details.length
    );
  return record.details.every(
    (item, index, items) =>
      isRecord(item) &&
      exact(item, ['passNumber', 'table', 'status', 'usedAt']) &&
      integer(item.passNumber) &&
      item.passNumber > 0 &&
      table(item.table) &&
      ((item.status === 'USED' && date(item.usedAt)) ||
        ((item.status === 'UNUSED' || item.status === 'REVOKED') && item.usedAt === null)) &&
      (index === 0 || item.passNumber > items[index - 1].passNumber)
  );
}

const id = encodeURIComponent;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const reason = (value: unknown): value is string => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value);

export function isPhysicalPassGenerationResult(value: unknown): value is S['GeneratePhysicalPassesResponseDto'] {
  if (
    !isRecord(value) ||
    typeof value.eventId !== 'string' ||
    typeof value.generationOperationId !== 'string' ||
    !Number.isInteger(value.quantity) ||
    Number(value.quantity) < 1 ||
    !Number.isInteger(value.firstPassNumber) ||
    Number(value.firstPassNumber) < 1 ||
    !Number.isInteger(value.lastPassNumber) ||
    Number(value.lastPassNumber) - Number(value.firstPassNumber) + 1 !== value.quantity ||
    !Array.isArray(value.passes) ||
    value.passes.length !== value.quantity
  )
    return false;
  const table = (item: unknown) =>
    item === null || (isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string');
  if (!table(value.table)) return false;
  return (
    value.passes.every(
      (pass, index) =>
        isRecord(pass) &&
        typeof pass.id === 'string' &&
        pass.eventId === value.eventId &&
        pass.passNumber === Number(value.firstPassNumber) + index &&
        pass.status === 'UNUSED' &&
        pass.usedAt === null &&
        date(pass.createdAt) &&
        table(pass.table)
    ) && new Set(value.passes.map((pass) => pass.id)).size === value.quantity
  );
}

export function isAccessControlReadiness(value: unknown): value is AccessControlReadiness {
  return (
    isRecord(value) &&
    typeof value.complete === 'boolean' &&
    (value.accessMode === 'NOMINAL' || value.accessMode === 'ANONYMOUS' || value.accessMode === null) &&
    Array.isArray(value.blockers) &&
    value.blockers.every((item) => typeof item === 'string') &&
    Number.isInteger(value.activeMaterialCount) &&
    Number(value.activeMaterialCount) >= 0 &&
    (value.capacity === null || (Number.isInteger(value.capacity) && Number(value.capacity) > 0))
  );
}

function isCredential(value: unknown): value is NominalAccessCredential {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.eventId === 'string' &&
    typeof value.assistantId === 'string' &&
    typeof value.hasActiveCheckIn === 'boolean' &&
    date(value.issuedAt) &&
    ((value.status === 'ISSUED' && value.revokedAt === null && value.revocationReasonCode === null) ||
      (value.status === 'REVOKED' && date(value.revokedAt) && reason(value.revocationReasonCode)))
  );
}

export function isPhysicalPassRevokeResult(value: unknown): value is PhysicalPassRevokeResult {
  return (
    isRecord(value) &&
    value.status === 'REVOKED' &&
    typeof value.physicalPassId === 'string' &&
    Number.isInteger(value.passNumber) &&
    Number(value.passNumber) > 0 &&
    date(value.revokedAt) &&
    reason(value.revocationReasonCode)
  );
}

export function createNominalAccessCredentialsClient(request: ApiRequester) {
  const base = (eventId: string) => `/events/${id(eventId)}/nominal-access-credentials`;
  return {
    list: (eventId: string, signal?: AbortSignal) =>
      request<NominalAccessCredential[]>(
        { path: base(eventId), response: 'json', ...withSignal(signal) },
        (value): value is NominalAccessCredential[] => Array.isArray(value) && value.every(isCredential)
      ),
    issue: (eventId: string, assistantId: string, key: string, signal?: AbortSignal) =>
      request<NominalAccessCredential>(
        {
          method: 'POST',
          path: `${base(eventId)}/assistants/${id(assistantId)}/issue`,
          body: {},
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isCredential
      ),
    svg: (eventId: string, credentialId: string, signal?: AbortSignal) =>
      request<string>({ path: `${base(eventId)}/${id(credentialId)}/svg`, response: 'text', ...withSignal(signal) }),
    revoke: (
      eventId: string,
      credentialId: string,
      body: NominalAccessRevokeInput,
      key: string,
      signal?: AbortSignal
    ) =>
      request<NominalAccessCredential>(
        {
          method: 'POST',
          path: `${base(eventId)}/${id(credentialId)}/revoke`,
          body,
          headers: { 'Idempotency-Key': key },
          response: 'json',
          ...withSignal(signal)
        },
        isCredential
      )
  };
}
