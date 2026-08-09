import type { components } from './generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from './api-client';

export type Event = components['schemas']['EventResponseDto'];
export type EventStatus = Event['status'];
export type EventSocialType = NonNullable<Event['socialType']>;
export type EventServiceCode = NonNullable<Event['serviceCode']>;
export type CreateEventInput = components['schemas']['CreateEventRequestDto'];
export type UpdateEventInput = components['schemas']['UpdateEventRequestDto'];
export type EventActivation = components['schemas']['EventActivationResponseDto'];

export interface EventsClient {
  list(signal?: AbortSignal): Promise<Event[]>;
  get(eventId: string, signal?: AbortSignal): Promise<Event>;
  create(input: CreateEventInput, signal?: AbortSignal): Promise<Event>;
  update(eventId: string, input: UpdateEventInput, signal?: AbortSignal): Promise<Event>;
  activate(eventId: string, idempotencyKey: string, signal?: AbortSignal): Promise<EventActivation>;
}

export function createEventsClient(request: ApiRequester): EventsClient {
  return {
    list: (signal) => request({ path: '/events', response: 'json', ...(signal ? { signal } : {}) }, isEventArray),
    get: (eventId, signal) =>
      request(
        {
          path: `/events/${encodeURIComponent(eventId)}`,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isEvent
      ),
    create: (body, signal) =>
      request({ method: 'POST', path: '/events', body, response: 'json', ...(signal ? { signal } : {}) }, isEvent),
    update: (eventId, body, signal) =>
      request(
        {
          method: 'PATCH',
          path: `/events/${encodeURIComponent(eventId)}`,
          body,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isEvent
      ),
    activate: (eventId, idempotencyKey, signal) =>
      request<EventActivation>(
        {
          method: 'POST',
          path: `/events/${encodeURIComponent(eventId)}/activate`,
          headers: { 'Idempotency-Key': idempotencyKey },
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isEventActivation
      )
  };
}

function isEventActivation(value: unknown): value is EventActivation {
  return isRecord(value) && isEvent(value.event);
}

function isEventArray(value: unknown): value is Event[] {
  return isRecordArray(value) && value.every(isEvent);
}

function isEvent(value: unknown): value is Event {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    (value.serviceCode === null || serviceCodes.has(value.serviceCode)) &&
    (value.name === null || typeof value.name === 'string') &&
    (value.timeZone === null || typeof value.timeZone === 'string') &&
    typeof value.updatedAt === 'string'
  );
}

const serviceCodes = new Set<unknown>(['FLIPBOOK', 'FLYER', 'PHYSICAL_QR', 'DEMO']);
