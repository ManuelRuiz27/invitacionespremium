import type { components } from './generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from './api-client';

export type StaffToken = components['schemas']['StaffTokenResponseDto'];
export type CreatedStaffToken = components['schemas']['CreatedStaffTokenResponseDto'];
export type CreateStaffTokenInput = components['schemas']['CreateStaffTokenRequestDto'];

export interface StaffTokensClient {
  list(eventId: string, signal?: AbortSignal): Promise<StaffToken[]>;
  create(eventId: string, input: CreateStaffTokenInput, signal?: AbortSignal): Promise<CreatedStaffToken>;
}

const segment = (value: string) => encodeURIComponent(value);
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
const staffTokenPattern = /^st1\.[A-Za-z0-9_-]{43}$/u;
const listedStaffTokenFields = ['alias', 'createdAt', 'eventId', 'expiredAt', 'id', 'state'] as const;
const createdStaffTokenFields = [...listedStaffTokenFields, 'sessionPath', 'token'] as const;

export function createStaffTokensClient(request: ApiRequester): StaffTokensClient {
  return {
    list: (eventId, signal) =>
      request(
        {
          path: `/events/${segment(eventId)}/staff-tokens`,
          response: 'json',
          ...withSignal(signal)
        },
        isStaffTokenArray
      ),
    create: (eventId, body, signal) =>
      request(
        {
          method: 'POST',
          path: `/events/${segment(eventId)}/staff-tokens`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        isCreatedStaffToken
      )
  };
}

function isStaffTokenArray(value: unknown): value is StaffToken[] {
  return isRecordArray(value) && value.every(isStaffToken);
}

function isStaffToken(value: unknown): value is StaffToken {
  return isRecord(value) && hasOnlyFields(value, listedStaffTokenFields) && hasStaffTokenFields(value);
}

function isCreatedStaffToken(value: unknown): value is CreatedStaffToken {
  return (
    isRecord(value) &&
    hasOnlyFields(value, createdStaffTokenFields) &&
    hasStaffTokenFields(value) &&
    typeof value.token === 'string' &&
    staffTokenPattern.test(value.token) &&
    isNonEmptyString(value.sessionPath)
  );
}

function hasOnlyFields(value: Record<string, unknown>, allowedFields: readonly string[]): boolean {
  const allowed = new Set(allowedFields);
  return Object.keys(value).every((field) => allowed.has(field));
}

function hasStaffTokenFields(value: Record<string, unknown>): boolean {
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.eventId) ||
    !isNonEmptyString(value.alias) ||
    !isDateTime(value.createdAt) ||
    (value.state !== 'ACTIVE' && value.state !== 'EXPIRED') ||
    (value.expiredAt !== null && !isDateTime(value.expiredAt))
  ) {
    return false;
  }

  return value.state === 'ACTIVE' ? value.expiredAt === null : value.expiredAt !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDateTime(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}
