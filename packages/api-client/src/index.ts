import { createRequester, type ApiClientRuntimeConfig } from './api-client';
import { createAuthClient } from './auth';
import { createEventsClient } from './events';
import { createFinanceClient } from './finance';

export { ApiError } from './api-error';
export { normalizeApiBaseUrl } from './api-client';
export type { ApiClientRuntimeConfig } from './api-client';
export type { AuthClient, AuthUser, LoginInput, LoginResult, UserRole } from './auth';
export type { Event, EventSocialType, EventsClient, EventStatus } from './events';
export type { FinanceBalance, FinanceClient, FinanceListOptions, LedgerMovement, Receipt } from './finance';

export const API_CLIENT_STATUS = 'Operational typed client generated from the API OpenAPI document.';

export function createApiClient(config: ApiClientRuntimeConfig) {
  const request = createRequester(config);
  return {
    auth: createAuthClient(request),
    events: createEventsClient(request),
    finance: createFinanceClient(request)
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
