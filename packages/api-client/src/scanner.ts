import type { components } from './generated/schema';
import { isRecord, type ApiRequester } from './api-client';

export type ScannerSessionResponse = components['schemas']['ScannerSessionResponseDto'];
export type ScannerCheckInRequest = components['schemas']['ScannerCheckInRequestDto'];
export type ScannerCheckInResponse = components['schemas']['ScannerCheckInResponseDto'];
export type CheckInRevertResponse = components['schemas']['CheckInRevertResponseDto'];
export type ScannerSearchResponse = components['schemas']['ScannerSearchResponseDto'];
export type ScanPhysicalPassResponse = components['schemas']['ScanPhysicalPassResponseDto'];
export type ScannerFloorplanResponse = components['schemas']['ScannerFloorplanResponseDto'];
export type ScannerScanResponse = components['schemas']['ScannerScanResponseDto'];
export type PendingAssistant = components['schemas']['PendingAssistantDto'];
export type CheckedInAssistant = components['schemas']['CheckedInAssistantDto'];
export type ScannerInvitation = components['schemas']['ScannerInvitationDto'];
export type ScannerInvitationResult = components['schemas']['ScannerInvitationResultDto'];
export type FloorplanShape = components['schemas']['FloorplanShapeResponseDto'];
export type ScannerTable = components['schemas']['ScannerTableDto'];

export interface ScannerClient {
  getSession(staffToken: string, signal?: AbortSignal): Promise<ScannerSessionResponse>;
  scan(staffToken: string, qrToken: string, signal?: AbortSignal): Promise<ScannerScanResponse>;
  search(staffToken: string, query: string, signal?: AbortSignal): Promise<ScannerSearchResponse>;
  checkIn(
    staffToken: string,
    idempotencyKey: string,
    payload: ScannerCheckInRequest,
    signal?: AbortSignal
  ): Promise<ScannerCheckInResponse>;
  scanPhysicalPass(
    staffToken: string,
    idempotencyKey: string,
    qrToken: string,
    signal?: AbortSignal
  ): Promise<ScanPhysicalPassResponse>;
  getFloorplan(staffToken: string, signal?: AbortSignal): Promise<ScannerFloorplanResponse>;
}

const segment = (value: string) => encodeURIComponent(value);
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export function createScannerClient(request: ApiRequester): ScannerClient {
  return {
    getSession: (staffToken, signal) =>
      request(
        {
          path: `/api/v1/scanner/${segment(staffToken)}/session`,
          credentials: 'omit',
          response: 'json',
          ...withSignal(signal)
        },
        isScannerSession
      ),
    scan: (staffToken, qrToken, signal) =>
      request(
        {
          method: 'POST',
          path: `/api/v1/scanner/${segment(staffToken)}/scan`,
          body: { qrToken },
          credentials: 'omit',
          response: 'json',
          ...withSignal(signal)
        },
        isScannerResult
      ),
    search: (staffToken, query, signal) =>
      request(
        {
          method: 'POST',
          path: `/api/v1/scanner/${segment(staffToken)}/search`,
          body: { query },
          credentials: 'omit',
          response: 'json',
          ...withSignal(signal)
        },
        isScannerSearch
      ),
    checkIn: (staffToken, idempotencyKey, body, signal) =>
      request(
        {
          method: 'POST',
          path: `/api/v1/scanner/${segment(staffToken)}/check-in`,
          headers: { 'Idempotency-Key': idempotencyKey },
          body,
          credentials: 'omit',
          response: 'json',
          ...withSignal(signal)
        },
        isCheckInResponse
      ),
    scanPhysicalPass: (staffToken, idempotencyKey, qrToken, signal) =>
      request(
        {
          method: 'POST',
          path: `/api/v1/scanner/${segment(staffToken)}/physical-passes/scan`,
          headers: { 'Idempotency-Key': idempotencyKey },
          body: { qrToken },
          credentials: 'omit',
          response: 'json',
          ...withSignal(signal)
        },
        isPhysicalPassResponse
      ),
    getFloorplan: (staffToken, signal) =>
      request(
        {
          path: `/api/v1/scanner/${segment(staffToken)}/floorplan`,
          credentials: 'omit',
          response: 'json',
          ...withSignal(signal)
        },
        isFloorplanResponse
      )
  };
}

function isScannerSession(value: unknown): value is ScannerSessionResponse {
  return (
    isRecord(value) &&
    value.status === 'AVAILABLE' &&
    isRecord(value.staff) &&
    typeof value.staff.alias === 'string' &&
    isRecord(value.event) &&
    typeof value.event.id === 'string' &&
    typeof value.event.name === 'string' &&
    (value.event.status === 'ACTIVE' || value.event.status === 'EVENT_DAY') &&
    typeof value.event.eventDateTime === 'string' &&
    typeof value.event.timeZone === 'string' &&
    typeof value.event.floorplanEnabled === 'boolean'
  );
}

function isInvitation(value: unknown): value is ScannerInvitation {
  return (
    isRecord(value) && typeof value.id === 'string' && (value.mode === 'INDIVIDUAL' || value.mode === 'FAMILY_NOMINAL')
  );
}

function isTable(value: unknown): value is ScannerTable {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isPendingAssistant(value: unknown): value is PendingAssistant {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.isPrimary === 'boolean' &&
    (value.table === null || isTable(value.table))
  );
}

function isInvitationResult(value: unknown): value is ScannerInvitationResult {
  return (
    isRecord(value) &&
    isInvitation(value.invitation) &&
    Number.isInteger(value.confirmedCount) &&
    Number.isInteger(value.checkedInCount) &&
    Number.isInteger(value.pendingCount) &&
    Array.isArray(value.pendingAssistants) &&
    value.pendingAssistants.every(isPendingAssistant)
  );
}

function isScannerResult(value: unknown): value is ScannerScanResponse {
  return (
    isRecord(value) && (value.status === 'AVAILABLE' || value.status === 'NO_PENDING') && isInvitationResult(value)
  );
}

function isScannerSearch(value: unknown): value is ScannerSearchResponse {
  return (
    isRecord(value) &&
    (value.status === 'MATCHES' || value.status === 'NO_MATCHES') &&
    Array.isArray(value.results) &&
    value.results.every(isInvitationResult)
  );
}

function isCheckedInAssistant(value: unknown): value is CheckedInAssistant {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.checkedInAt === 'string' &&
    (value.table === null || isTable(value.table))
  );
}

function isCheckInResponse(value: unknown): value is ScannerCheckInResponse {
  return (
    isRecord(value) &&
    value.status === 'CHECKED_IN' &&
    typeof value.invitationId === 'string' &&
    Number.isInteger(value.remainingPendingCount) &&
    Array.isArray(value.checkedIn) &&
    value.checkedIn.every(isCheckedInAssistant) &&
    Array.isArray(value.remainingPendingAssistants) &&
    value.remainingPendingAssistants.every(isPendingAssistant)
  );
}

function isFloorplanShape(value: unknown): value is FloorplanShape {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.kind === 'TABLE' || value.kind === 'DECORATIVE_ZONE') &&
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function isFloorplanResponse(value: unknown): value is ScannerFloorplanResponse {
  return (
    isRecord(value) &&
    typeof value.floorplanId === 'string' &&
    typeof value.contentPath === 'string' &&
    Array.isArray(value.shapes) &&
    value.shapes.every(isFloorplanShape)
  );
}

function isPhysicalPassResponse(value: unknown): value is ScanPhysicalPassResponse {
  return (
    isRecord(value) &&
    value.status === 'USED' &&
    typeof value.physicalPassId === 'string' &&
    Number.isInteger(value.passNumber) &&
    typeof value.usedAt === 'string' &&
    (value.table === null || isTable(value.table))
  );
}
