import type { components } from './generated/schema';
import { isRecord, type ApiRequester } from './api-client';

export type ConfirmationState = components['schemas']['ConfirmationStateResponseDto'];
export type RsvpAssistantInput = components['schemas']['RsvpAssistantInputDto'];
export type RsvpOverrideInput = components['schemas']['RsvpOverrideRequestDto'];
export type RsvpMutation = components['schemas']['RsvpMutationResponseDto'];

export interface EventConfirmationClient {
  get(eventId: string, signal?: AbortSignal): Promise<ConfirmationState>;
  close(eventId: string, signal?: AbortSignal): Promise<ConfirmationState>;
  reopen(eventId: string, signal?: AbortSignal): Promise<ConfirmationState>;
  override(
    eventId: string,
    invitationId: string,
    input: RsvpOverrideInput,
    signal?: AbortSignal
  ): Promise<RsvpMutation>;
}

const segment = (value: string) => encodeURIComponent(value);
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export function createEventConfirmationClient(request: ApiRequester): EventConfirmationClient {
  const base = (eventId: string) => `/events/${segment(eventId)}/confirmation`;
  return {
    get: (eventId, signal) =>
      request({ path: base(eventId), response: 'json', ...withSignal(signal) }, isConfirmationState),
    close: (eventId, signal) =>
      request(
        { method: 'POST', path: `${base(eventId)}/close`, response: 'json', ...withSignal(signal) },
        isConfirmationState
      ),
    reopen: (eventId, signal) =>
      request(
        { method: 'POST', path: `${base(eventId)}/reopen`, response: 'json', ...withSignal(signal) },
        isConfirmationState
      ),
    override: (eventId, invitationId, body, signal) =>
      request(
        {
          method: 'PUT',
          path: `/events/${segment(eventId)}/invitations/${segment(invitationId)}/confirmation`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        isRsvpMutation
      )
  };
}

function isConfirmationState(value: unknown): value is ConfirmationState {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    typeof value.open === 'boolean' &&
    (value.closedAt === null || isDateTime(value.closedAt)) &&
    (value.closedByUserId === null || typeof value.closedByUserId === 'string')
  );
}

function isRsvpMutation(value: unknown): value is RsvpMutation {
  return (
    isRecord(value) &&
    typeof value.invitationId === 'string' &&
    ['PENDING', 'CONFIRMED', 'REJECTED'].includes(String(value.responseStatus)) &&
    Array.isArray(value.assistants) &&
    value.assistants.every(isRsvpAssistant)
  );
}

function isRsvpAssistant(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.isPrimary === 'boolean' &&
    ['PENDING', 'CONFIRMED', 'REJECTED'].includes(String(value.responseStatus))
  );
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
