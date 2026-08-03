import type { components, operations } from '../generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from '../api-client';

export type AdminClient = operations['AdminClientsController_get']['responses'][200]['content']['application/json'];
export type AdminClientUser = components['schemas']['ClientUserResponseDto'];
export type AdminClientCreated = components['schemas']['ClientCreatedResponseDto'];
export type CreateOrganizationInput = components['schemas']['CreateOrganizationRequestDto'];
export type UpdateAdminClientInput = components['schemas']['UpdateClientRequestDto'];
export type SuspendAdminClientInput = components['schemas']['SuspendClientRequestDto'];
export type CreateAdminPlannerInput = components['schemas']['CreatePlannerUserRequestDto'];
export type UpdateAdminClientUserInput = components['schemas']['UpdateClientUserRequestDto'];

export interface AdminClientsClient {
  list(signal?: AbortSignal): Promise<AdminClient[]>;
  get(clientId: string, signal?: AbortSignal): Promise<AdminClient>;
  createOrganization(input: CreateOrganizationInput, signal?: AbortSignal): Promise<AdminClientCreated>;
  update(clientId: string, input: UpdateAdminClientInput, signal?: AbortSignal): Promise<AdminClient>;
  suspend(clientId: string, input: SuspendAdminClientInput, signal?: AbortSignal): Promise<AdminClient>;
  restore(clientId: string, signal?: AbortSignal): Promise<AdminClient>;
  listUsers(clientId: string, signal?: AbortSignal): Promise<AdminClientUser[]>;
  createPlanner(clientId: string, input: CreateAdminPlannerInput, signal?: AbortSignal): Promise<AdminClientUser>;
  updateUser(
    clientId: string,
    userId: string,
    input: UpdateAdminClientUserInput,
    signal?: AbortSignal
  ): Promise<AdminClientUser>;
}

export function createAdminClientsClient(request: ApiRequester): AdminClientsClient {
  const clientPath = (clientId: string) => `/admin/clients/${encodeURIComponent(clientId)}`;
  return {
    list: (signal) =>
      request({ path: '/admin/clients', response: 'json', ...(signal ? { signal } : {}) }, isClientArray),
    get: (clientId, signal) =>
      request({ path: clientPath(clientId), response: 'json', ...(signal ? { signal } : {}) }, isClient),
    createOrganization: (body, signal) =>
      request(
        { method: 'POST', path: '/admin/clients/organizations', body, response: 'json', ...(signal ? { signal } : {}) },
        isClientCreated
      ),
    update: (clientId, body, signal) =>
      request(
        { method: 'PATCH', path: clientPath(clientId), body, response: 'json', ...(signal ? { signal } : {}) },
        isClient
      ),
    suspend: (clientId, body, signal) =>
      request(
        {
          method: 'POST',
          path: `${clientPath(clientId)}/suspend`,
          body,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isClient
      ),
    restore: (clientId, signal) =>
      request(
        { method: 'POST', path: `${clientPath(clientId)}/restore`, response: 'json', ...(signal ? { signal } : {}) },
        isClient
      ),
    listUsers: (clientId, signal) =>
      request({ path: `${clientPath(clientId)}/users`, response: 'json', ...(signal ? { signal } : {}) }, isUserArray),
    createPlanner: (clientId, body, signal) =>
      request(
        {
          method: 'POST',
          path: `${clientPath(clientId)}/users/planner`,
          body,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isUser
      ),
    updateUser: (clientId, userId, body, signal) =>
      request(
        {
          method: 'PATCH',
          path: `${clientPath(clientId)}/users/${encodeURIComponent(userId)}`,
          body,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isUser
      )
  };
}

function isClient(value: unknown): value is AdminClient {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.type === 'PLANNER' || value.type === 'ORGANIZATION') &&
    (value.status === 'ACTIVE' || value.status === 'SUSPENDED') &&
    typeof value.createdAt === 'string'
  );
}

function isClientArray(value: unknown): value is AdminClient[] {
  return isRecordArray(value) && value.every(isClient);
}

function isUser(value: unknown): value is AdminClientUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.clientId === 'string' &&
    typeof value.email === 'string'
  );
}

function isUserArray(value: unknown): value is AdminClientUser[] {
  return isRecordArray(value) && value.every(isUser);
}

function isClientCreated(value: unknown): value is AdminClientCreated {
  return isRecord(value) && isClient(value.client) && isUser(value.user);
}
