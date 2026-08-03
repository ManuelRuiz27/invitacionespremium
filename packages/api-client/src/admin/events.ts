import type { operations } from '../generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from '../api-client';

export type AdminEvent = operations['AdminEventsController_get']['responses'][200]['content']['application/json'];

export interface AdminEventsClient {
  list(signal?: AbortSignal): Promise<AdminEvent[]>;
  get(eventId: string, signal?: AbortSignal): Promise<AdminEvent>;
  restore(eventId: string, signal?: AbortSignal): Promise<AdminEvent>;
}

export function createAdminEventsClient(request: ApiRequester): AdminEventsClient {
  const eventPath = (eventId: string) => `/admin/events/${encodeURIComponent(eventId)}`;
  return {
    list: (signal) => request({ path: '/admin/events', response: 'json', ...(signal ? { signal } : {}) }, isEventArray),
    get: (eventId, signal) =>
      request({ path: eventPath(eventId), response: 'json', ...(signal ? { signal } : {}) }, isEvent),
    restore: (eventId, signal) =>
      request(
        { method: 'POST', path: `${eventPath(eventId)}/restore`, response: 'json', ...(signal ? { signal } : {}) },
        isEvent
      )
  };
}

function isEvent(value: unknown): value is AdminEvent {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.clientId === 'string' &&
    typeof value.status === 'string' &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.createdAt === 'string'
  );
}

function isEventArray(value: unknown): value is AdminEvent[] {
  return isRecordArray(value) && value.every(isEvent);
}
