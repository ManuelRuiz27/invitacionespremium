import { createRequester, type ApiClientRuntimeConfig } from './api-client';
import {
  createAdminAuditClient,
  createAdminCatalogClient,
  createAdminClientsClient,
  createAdminEventsClient,
  createAdminFinanceClient,
  createAdminReportsClient
} from './admin';
import { createAuthClient } from './auth';
import { createEventsClient } from './events';
import { createFinanceClient } from './finance';
import { createPublicAlbumClient, createPublicClientsClient, createPublicInvitationClient } from './public';
import {
  createContactsClient,
  createDesignClient,
  createFileAssetsClient,
  createFloorplanClient,
  createInvitationsClient,
  createPhysicalPassesClient,
  createServicesClient
} from './wizard';
import { createScannerClient } from './scanner';

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
export type {
  ScannerSessionResponse,
  ScannerCheckInRequest,
  ScannerCheckInResponse,
  CheckInRevertResponse,
  ScannerSearchResponse,
  ScanPhysicalPassResponse,
  ScannerFloorplanResponse,
  ScannerScanResponse,
  PendingAssistant,
  CheckedInAssistant,
  ScannerInvitation,
  ScannerInvitationResult,
  FloorplanShape,
  ScannerTable,
  ScannerClient
} from './scanner';
export type { FinanceBalance, FinanceClient, FinanceListOptions, LedgerMovement, Receipt } from './finance';
export type {
  PublicAlbum,
  PublicAlbumPhoto,
  PublicInvitationView,
  PublicRsvpAssistant,
  PublicRsvpAssistantInput,
  PublicRsvpMutation
} from './public';
export type { RegisterPlannerInput, RegisterPlannerResult } from './public';
export type * from './wizard';
export type * from './admin';

export const API_CLIENT_STATUS = 'Operational typed client generated from the API OpenAPI document.';

export function createPublicRegistrationClient(config: ApiClientRuntimeConfig) {
  return createPublicClientsClient(createRequester(config));
}

export function createApiClient(config: ApiClientRuntimeConfig) {
  const request = createRequester(config);
  return {
    auth: createAuthClient(request),
    adminClients: createAdminClientsClient(request),
    adminEvents: createAdminEventsClient(request),
    adminFinance: createAdminFinanceClient(request),
    adminCatalog: createAdminCatalogClient(request),
    adminReports: createAdminReportsClient(request),
    adminAudit: createAdminAuditClient(request),
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
    publicAlbum: createPublicAlbumClient(request),
    scanner: createScannerClient(request)
  };
}

type CompleteApiClient = ReturnType<typeof createApiClient>;
export type ApiClient = Omit<CompleteApiClient, 'adminAudit'> & {
  /** Present in clients created by createApiClient; optional only for legacy test doubles. */
  adminAudit?: CompleteApiClient['adminAudit'];
};
