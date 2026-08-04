import { isRecord, type ApiRequester } from '../api-client';
import type { operations } from '../generated/schema';

type AuditOperation = operations['AdminAuditController_listAuditLogs'];

export type AdminAuditFilters = NonNullable<AuditOperation['parameters']['query']>;
export type AdminAuditPage = AuditOperation['responses'][200]['content']['application/json'];
export type AdminAuditLog = AdminAuditPage['items'][number];

export interface AdminAuditClient {
  listAuditLogs(filters?: AdminAuditFilters, signal?: AbortSignal): Promise<AdminAuditPage>;
}

export function createAdminAuditClient(request: ApiRequester): AdminAuditClient {
  return {
    listAuditLogs: (filters = {}, signal) => {
      const query = new URLSearchParams();
      for (const key of filterKeys) {
        const value = filters[key];
        if (value !== undefined) query.set(key, String(value));
      }
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return request(
        { path: `/admin/audit-logs${suffix}`, response: 'json', ...(signal ? { signal } : {}) },
        isAuditPage
      );
    }
  };
}

const filterKeys = [
  'clientId',
  'eventId',
  'actorType',
  'actorId',
  'resourceType',
  'resourceId',
  'action',
  'operationId',
  'createdFrom',
  'createdTo',
  'cursor',
  'limit'
] as const satisfies readonly (keyof AdminAuditFilters)[];

function isAuditPage(value: unknown): value is AdminAuditPage {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    Array.isArray(value.items) &&
    value.items.every(isAuditLog) &&
    (value.nextCursor === null || (typeof value.nextCursor === 'string' && isAuditCursor(value.nextCursor)))
  );
}

function isAuditLog(value: unknown): value is AdminAuditLog {
  if (!isRecord(value) || Object.keys(value).length !== auditLogKeys.size) return false;
  if (![...auditLogKeys].every((key) => key in value)) return false;
  if (!isUuid(value.id) || !isInstant(value.createdAt) || !actorTypes.has(value.actorType)) return false;
  if (!isNullableUuid(value.resourceId) || !isNullableUuid(value.clientId) || !isNullableUuid(value.eventId)) {
    return false;
  }
  if (
    !isNullableUuid(value.operationId) ||
    typeof value.resourceType !== 'string' ||
    typeof value.action !== 'string'
  ) {
    return false;
  }
  if (!isJsonValue(value.beforeData) || !isJsonValue(value.afterData) || !isJsonValue(value.metadata)) return false;

  switch (value.actorType) {
    case 'USER':
    case 'STAFF_TOKEN':
      return isUuid(value.actorId) && value.actorFingerprint === null;
    case 'PUBLIC_TOKEN':
      return (
        value.actorId === null &&
        typeof value.actorFingerprint === 'string' &&
        /^[a-f0-9]{64}$/i.test(value.actorFingerprint)
      );
    case 'SYSTEM':
      return value.actorId === null && value.actorFingerprint === null;
    default:
      return false;
  }
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isAuditCursor(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const base64 = value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const parsed: unknown = JSON.parse(globalThis.atob(base64));
    return (
      isRecord(parsed) &&
      Object.keys(parsed).length === 3 &&
      parsed.version === 1 &&
      isInstant(parsed.occurredAt) &&
      isUuid(parsed.id)
    );
  } catch {
    return false;
  }
}

const actorTypes = new Set<unknown>(['USER', 'STAFF_TOKEN', 'PUBLIC_TOKEN', 'SYSTEM']);
const auditLogKeys = new Set([
  'id',
  'createdAt',
  'actorType',
  'actorId',
  'actorFingerprint',
  'resourceType',
  'resourceId',
  'clientId',
  'eventId',
  'action',
  'operationId',
  'beforeData',
  'afterData',
  'metadata'
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
const isNullableUuid = (value: unknown): value is string | null => value === null || isUuid(value);
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && instantPattern.test(value) && Number.isFinite(Date.parse(value));
