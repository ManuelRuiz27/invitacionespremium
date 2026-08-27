import type { components, operations } from '../generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from '../api-client';

export type AdminEvent = operations['AdminEventsController_get']['responses'][200]['content']['application/json'];
export type AdminEventIntakeQuote = components['schemas']['EventIntakeQuoteResponseDto'];
export type AdminEventIntakeInput = components['schemas']['AdminEventIntakeRequestDto'];
export type AdminEventAssignmentInput = components['schemas']['AdminEventAssignmentRequestDto'];
export interface AdminEventIntakeQuoteInput {
  serviceCode: 'FLYER' | 'FLIPBOOK' | 'PHYSICAL_QR';
  capacity: number;
}

export interface AdminEventsClient {
  list(signal?: AbortSignal): Promise<AdminEvent[]>;
  get(eventId: string, signal?: AbortSignal): Promise<AdminEvent>;
  restore(eventId: string, signal?: AbortSignal): Promise<AdminEvent>;
  quoteIntake(
    clientId: string,
    input: AdminEventIntakeQuoteInput,
    signal?: AbortSignal
  ): Promise<AdminEventIntakeQuote>;
  createForClient(clientId: string, input: AdminEventIntakeInput, signal?: AbortSignal): Promise<AdminEvent>;
  updateAssignment(
    clientId: string,
    eventId: string,
    input: AdminEventAssignmentInput,
    signal?: AbortSignal
  ): Promise<AdminEvent>;
}

export function createAdminEventsClient(request: ApiRequester): AdminEventsClient {
  const eventPath = (eventId: string) => `/admin/events/${encodeURIComponent(eventId)}`;
  const clientEventsPath = (clientId: string) => `/admin/clients/${encodeURIComponent(clientId)}/events`;
  return {
    list: (signal) => request({ path: '/admin/events', response: 'json', ...(signal ? { signal } : {}) }, isEventArray),
    get: (eventId, signal) =>
      request({ path: eventPath(eventId), response: 'json', ...(signal ? { signal } : {}) }, isEvent),
    restore: (eventId, signal) =>
      request(
        { method: 'POST', path: `${eventPath(eventId)}/restore`, response: 'json', ...(signal ? { signal } : {}) },
        isEvent
      ),
    quoteIntake: (clientId, input, signal) => {
      const query = new URLSearchParams({ serviceCode: input.serviceCode, capacity: String(input.capacity) });
      return request(
        {
          path: `${clientEventsPath(clientId)}/intake-quote?${query.toString()}`,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isIntakeQuote
      );
    },
    createForClient: (clientId, body, signal) =>
      request(
        {
          method: 'POST',
          path: clientEventsPath(clientId),
          body,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isEvent
      ),
    updateAssignment: (clientId, eventId, body, signal) =>
      request(
        {
          method: 'PATCH',
          path: `${clientEventsPath(clientId)}/${encodeURIComponent(eventId)}/assignment`,
          body,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isEvent
      )
  };
}

function isEvent(value: unknown): value is AdminEvent {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.clientId === 'string' &&
    (value.assignedPlannerUserId === null || typeof value.assignedPlannerUserId === 'string') &&
    typeof value.status === 'string' &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.createdAt === 'string'
  );
}

function isIntakeQuote(value: unknown): value is AdminEventIntakeQuote {
  return (
    isRecord(value) &&
    typeof value.clientId === 'string' &&
    typeof value.clientName === 'string' &&
    typeof value.serviceId === 'string' &&
    ['FLYER', 'FLIPBOOK', 'PHYSICAL_QR'].includes(String(value.serviceCode)) &&
    typeof value.servicePriceId === 'string' &&
    typeof value.finalCostCredits === 'number' &&
    isRecord(value.coverage) &&
    typeof value.coverage.sufficient === 'boolean'
  );
}

function isEventArray(value: unknown): value is AdminEvent[] {
  return isRecordArray(value) && value.every(isEvent);
}
