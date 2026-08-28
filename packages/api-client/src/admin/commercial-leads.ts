import { isRecord, type ApiRequester } from '../api-client';
import type { operations } from '../generated/schema';

type ListOperation = operations['AdminCommercialLeadsController_list'];
type GetOperation = operations['AdminCommercialLeadsController_get'];

export type AdminCommercialLeadFilters = NonNullable<ListOperation['parameters']['query']>;
export type AdminCommercialLeadPage = ListOperation['responses'][200]['content']['application/json'];
export type AdminCommercialLead = GetOperation['responses'][200]['content']['application/json'];

export interface AdminCommercialLeadsClient {
  list(filters?: AdminCommercialLeadFilters, signal?: AbortSignal): Promise<AdminCommercialLeadPage>;
  get(leadId: string, signal?: AbortSignal): Promise<AdminCommercialLead>;
}

export function createAdminCommercialLeadsClient(request: ApiRequester): AdminCommercialLeadsClient {
  return {
    list: (filters = {}, signal) => {
      const query = new URLSearchParams();
      if (filters.opportunityType !== undefined) query.set('opportunityType', filters.opportunityType);
      if (filters.cursor !== undefined) query.set('cursor', filters.cursor);
      if (filters.limit !== undefined) query.set('limit', String(filters.limit));
      const suffix = query.size > 0 ? `?${query.toString()}` : '';
      return request(
        { path: `/admin/commercial-leads${suffix}`, response: 'json', ...(signal ? { signal } : {}) },
        isCommercialLeadPage
      );
    },
    get: (leadId, signal) =>
      request(
        {
          path: `/admin/commercial-leads/${encodeURIComponent(leadId)}`,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isCommercialLead
      )
  };
}

function isCommercialLeadPage(value: unknown): value is AdminCommercialLeadPage {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    Array.isArray(value.items) &&
    value.items.every(isCommercialLead) &&
    (value.nextCursor === null || typeof value.nextCursor === 'string')
  );
}

function isCommercialLead(value: unknown): value is AdminCommercialLead {
  return (
    isRecord(value) &&
    Object.keys(value).length === 10 &&
    isUuid(value.id) &&
    ['PLANNER_AGENCY', 'VENUE'].includes(String(value.opportunityType)) &&
    typeof value.contactName === 'string' &&
    typeof value.businessName === 'string' &&
    typeof value.email === 'string' &&
    (value.phone === null || typeof value.phone === 'string') &&
    (value.estimatedEventsPerMonth === null || Number.isInteger(value.estimatedEventsPerMonth)) &&
    (value.notes === null || typeof value.notes === 'string') &&
    isInstant(value.privacyAcceptedAt) &&
    isInstant(value.createdAt)
  );
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
const isInstant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
