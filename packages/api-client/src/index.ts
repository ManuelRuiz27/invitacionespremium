import { createRequester, type ApiClientRuntimeConfig } from './api-client';
import { createAuthClient } from './auth';
import { createEventsClient } from './events';
import { createFinanceClient } from './finance';
import { createPublicAlbumClient, createPublicInvitationClient } from './public';
import {
  createContactsClient,
  createDesignClient,
  createFileAssetsClient,
  createFloorplanClient,
  createInvitationsClient,
  createPhysicalPassesClient,
  createServicesClient
} from './wizard';

export { ApiError } from './api-error';
export { normalizeApiBaseUrl } from './api-client';
export type { ApiClientRuntimeConfig } from './api-client';
export type { AuthClient, AuthUser, LoginInput, LoginResult, UserRole } from './auth';
export type {
  CreateEventInput,
  Event,
  EventActivation,
  EventSocialType,
  EventsClient,
  EventStatus,
  UpdateEventInput
} from './events';
export type { FinanceBalance, FinanceClient, FinanceListOptions, LedgerMovement, Receipt } from './finance';
export type {
  PublicAlbum,
  PublicAlbumPhoto,
  PublicInvitationView,
  PublicRsvpAssistant,
  PublicRsvpAssistantInput,
  PublicRsvpMutation
} from './public';
export type * from './wizard';

export const API_CLIENT_STATUS = 'Operational typed client generated from the API OpenAPI document.';

export function createApiClient(config: ApiClientRuntimeConfig) {
  const request = createRequester(config);
  return {
    auth: createAuthClient(request),
    events: createEventsClient(request),
    finance: createFinanceClient(request),
    services: createServicesClient(request),
    contacts: createContactsClient(request),
    invitations: createInvitationsClient(request),
    fileAssets: createFileAssetsClient(request),
    design: createDesignClient(request),
    floorplan: createFloorplanClient(request),
    physicalPasses: createPhysicalPassesClient(request),
    publicInvitation: createPublicInvitationClient(request),
    publicAlbum: createPublicAlbumClient(request)
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
