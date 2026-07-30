import type { components } from './generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from './api-client';

export type Event = components['schemas']['EventResponseDto'];
export type EventStatus = Event['status'];
export type EventSocialType = NonNullable<Event['socialType']>;

export interface EventsClient {
  list(signal?: AbortSignal): Promise<Event[]>;
  get(eventId: string, signal?: AbortSignal): Promise<Event>;
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
      )
  };
}

function isEventArray(value: unknown): value is Event[] {
  return isRecordArray(value) && value.every(isEvent);
}

function isEvent(value: unknown): value is Event {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.status === 'string' &&
    (value.name === null || typeof value.name === 'string') &&
    (value.timeZone === null || typeof value.timeZone === 'string') &&
    typeof value.updatedAt === 'string'
  );
}
