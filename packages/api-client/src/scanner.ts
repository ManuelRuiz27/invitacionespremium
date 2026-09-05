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
export type ScannerSeat = components['schemas']['ScannerSeatDto'];

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
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
const isFiniteInRange = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
const isDateTime = (value: unknown): value is string => isNonEmptyString(value) && Number.isFinite(Date.parse(value));

export function createScannerClient(request: ApiRequester): ScannerClient {
  return {
    getSession: (staffToken, signal) =>
      request(
        {
          path: `/scanner/${segment(staffToken)}/session`,
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
          path: `/scanner/${segment(staffToken)}/scan`,
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
          path: `/scanner/${segment(staffToken)}/search`,
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
          path: `/scanner/${segment(staffToken)}/check-in`,
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
          path: `/scanner/${segment(staffToken)}/physical-passes/scan`,
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
          path: `/scanner/${segment(staffToken)}/floorplan`,
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
    isNonEmptyString(value.staff.alias) &&
    isRecord(value.event) &&
    isNonEmptyString(value.event.id) &&
    isNonEmptyString(value.event.name) &&
    (value.event.status === 'ACTIVE' || value.event.status === 'EVENT_DAY') &&
    isDateTime(value.event.eventDateTime) &&
    isNonEmptyString(value.event.timeZone) &&
    typeof value.event.floorplanEnabled === 'boolean'
  );
}

function isInvitation(value: unknown): value is ScannerInvitation {
  return (
    isRecord(value) && isNonEmptyString(value.id) && (value.mode === 'INDIVIDUAL' || value.mode === 'FAMILY_NOMINAL')
  );
}

function isTable(value: unknown): value is ScannerTable {
  return isRecord(value) && isNonEmptyString(value.id) && isNonEmptyString(value.name);
}

function isSeat(value: unknown): value is ScannerSeat {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.label) &&
    isFiniteInRange(value.x, 0, 1) &&
    isFiniteInRange(value.y, 0, 1)
  );
}

function hasCompatibleSeat(value: unknown): boolean {
  // Historical scanner payloads predate seat assignments; current responses use null or a seat.
  return value === undefined || value === null || isSeat(value);
}

function isPendingAssistant(value: unknown): value is PendingAssistant {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    typeof value.isPrimary === 'boolean' &&
    (value.table === null || isTable(value.table)) &&
    hasCompatibleSeat(value.seat)
  );
}

function isInvitationResult(value: unknown): value is ScannerInvitationResult {
  return (
    isRecord(value) &&
    isInvitation(value.invitation) &&
    isNonNegativeInteger(value.confirmedCount) &&
    isNonNegativeInteger(value.checkedInCount) &&
    isNonNegativeInteger(value.pendingCount) &&
    value.checkedInCount <= value.confirmedCount &&
    value.checkedInCount + value.pendingCount === value.confirmedCount &&
    Array.isArray(value.pendingAssistants) &&
    value.pendingAssistants.length === value.pendingCount &&
    value.pendingAssistants.every(isPendingAssistant) &&
    new Set(value.pendingAssistants.map((assistant) => assistant.id)).size === value.pendingAssistants.length
  );
}

function isScannerResult(value: unknown): value is ScannerScanResponse {
  if (!isRecord(value) || (value.status !== 'AVAILABLE' && value.status !== 'NO_PENDING')) return false;
  const status = value.status;
  return isInvitationResult(value) && (status === 'AVAILABLE' ? value.pendingCount > 0 : value.pendingCount === 0);
}

function isScannerSearch(value: unknown): value is ScannerSearchResponse {
  return (
    isRecord(value) &&
    (value.status === 'MATCHES' || value.status === 'NO_MATCHES') &&
    Array.isArray(value.results) &&
    value.results.every(isInvitationResult) &&
    (value.status === 'MATCHES' ? value.results.length > 0 : value.results.length === 0)
  );
}

function isCheckedInAssistant(value: unknown): value is CheckedInAssistant {
  return (
    isRecord(value) &&
    isNonEmptyString(value.assistantId) &&
    isNonEmptyString(value.checkInId) &&
    isNonEmptyString(value.name) &&
    isDateTime(value.checkedInAt) &&
    (value.table === null || isTable(value.table)) &&
    hasCompatibleSeat(value.seat)
  );
}

function isCheckInResponse(value: unknown): value is ScannerCheckInResponse {
  if (
    !isRecord(value) ||
    value.status !== 'CHECKED_IN' ||
    !isNonEmptyString(value.invitationId) ||
    !isNonNegativeInteger(value.remainingPendingCount) ||
    !Array.isArray(value.checkedIn) ||
    !value.checkedIn.every(isCheckedInAssistant) ||
    !Array.isArray(value.remainingPendingAssistants) ||
    !value.remainingPendingAssistants.every(isPendingAssistant)
  )
    return false;
  const checkedIn = value.checkedIn;
  const remaining = value.remainingPendingAssistants;
  return (
    remaining.length === value.remainingPendingCount &&
    new Set(checkedIn.map((assistant) => assistant.assistantId)).size === checkedIn.length &&
    new Set(remaining.map((assistant) => assistant.id)).size === remaining.length &&
    checkedIn.every((assistant) => !remaining.some((pending) => pending.id === assistant.assistantId))
  );
}

function isPolygonPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteInRange(value.x, 0, 1) && isFiniteInRange(value.y, 0, 1);
}

function isFloorplanShape(value: unknown): value is FloorplanShape {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    (value.kind === 'TABLE' || value.kind === 'DECORATIVE_ZONE') &&
    (value.geometry === 'RECTANGLE' ||
      value.geometry === 'SQUARE' ||
      value.geometry === 'CIRCLE' ||
      value.geometry === 'POLYGON') &&
    isNonNegativeInteger(value.capacity) &&
    isNonNegativeInteger(value.occupancy) &&
    isNonNegativeInteger(value.availableCapacity) &&
    (value.kind === 'TABLE' ? value.capacity > 0 : value.capacity === 0) &&
    value.occupancy <= value.capacity &&
    value.availableCapacity === value.capacity - value.occupancy &&
    isFiniteInRange(value.x, 0, 1) &&
    isFiniteInRange(value.y, 0, 1) &&
    isFiniteInRange(value.width, Number.MIN_VALUE, 1) &&
    isFiniteInRange(value.height, Number.MIN_VALUE, 1) &&
    value.x + value.width <= 1 &&
    value.y + value.height <= 1 &&
    isFiniteInRange(value.rotation, 0, 360) &&
    value.rotation < 360 &&
    (value.geometry === 'SQUARE' || value.geometry === 'CIRCLE' ? value.width === value.height : true) &&
    (value.geometry === 'POLYGON'
      ? Array.isArray(value.polygonPoints) &&
        value.polygonPoints.length >= 3 &&
        value.polygonPoints.length <= 64 &&
        value.polygonPoints.every(isPolygonPoint)
      : value.polygonPoints === null || value.polygonPoints === undefined)
  );
}

function isFloorplanResponse(value: unknown): value is ScannerFloorplanResponse {
  return (
    isRecord(value) &&
    isNonEmptyString(value.floorplanId) &&
    isNonEmptyString(value.contentPath) &&
    Array.isArray(value.shapes) &&
    value.shapes.every(isFloorplanShape)
  );
}

function isPhysicalPassResponse(value: unknown): value is ScanPhysicalPassResponse {
  return (
    isRecord(value) &&
    value.status === 'USED' &&
    isNonEmptyString(value.physicalPassId) &&
    isPositiveInteger(value.passNumber) &&
    isDateTime(value.usedAt) &&
    (value.table === null || isTable(value.table))
  );
}
