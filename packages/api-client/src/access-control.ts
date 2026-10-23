import type { components } from './generated/schema';
import { isRecord, type ApiRequester } from './api-client';

type S = components['schemas'];
export type AccessControlReadiness = S['AccessControlReadinessResponseDto'];
export type NominalAccessCredential = S['NominalAccessCredentialResponseDto'];
export type NominalAccessRevokeInput = S['RevokeNominalAccessRequestDto'];
export type PhysicalPassRevokeInput = S['RevokePhysicalPassRequestDto'];
export type PhysicalPassRevokeResult = S['RevokePhysicalPassResponseDto'];

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
