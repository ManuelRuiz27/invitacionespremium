import type { operations } from '../generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from '../api-client';

export type AdminReport =
  operations['AdminReportsController_list']['responses'][200]['content']['application/json'][number];

export interface AdminReportsClient {
  list(signal?: AbortSignal): Promise<AdminReport[]>;
  listEvent(eventId: string, signal?: AbortSignal): Promise<AdminReport[]>;
}

export function createAdminReportsClient(request: ApiRequester): AdminReportsClient {
  return {
    list: (signal) =>
      request({ path: '/admin/reports', response: 'json', ...(signal ? { signal } : {}) }, isReportArray),
    listEvent: (eventId, signal) =>
      request(
        {
          path: `/admin/reports/events/${encodeURIComponent(eventId)}`,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isReportArray
      )
  };
}

function isReport(value: unknown): value is AdminReport {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.clientId === 'string' &&
    typeof value.eventId === 'string' &&
    typeof value.requestedByUserId === 'string' &&
    reportTypes.has(value.type) &&
    reportStatuses.has(value.status) &&
    privacyModes.has(value.privacyMode) &&
    typeof value.templateVersion === 'number' &&
    typeof value.generatedAtSnapshot === 'string' &&
    typeof value.detailedUntil === 'string' &&
    typeof value.retentionUntil === 'string'
  );
}

const isReportArray = (value: unknown): value is AdminReport[] => isRecordArray(value) && value.every(isReport);
const reportTypes = new Set<unknown>(['ATTENDANCE', 'PHYSICAL_PASSES']);
const reportStatuses = new Set<unknown>(['AUTHORIZED', 'READY', 'HIDDEN', 'EXPIRED']);
const privacyModes = new Set<unknown>(['DETAILED', 'AGGREGATE']);
