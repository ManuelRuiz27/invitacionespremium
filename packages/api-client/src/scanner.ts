import type { components } from './generated/schema';
import { type ApiRequester } from './api-client';

// Tipos generados directamente del OpenAPI
export type ScannerSessionResponse = components['schemas']['ScannerSessionResponseDto'];
export type ScannerCheckInRequest = components['schemas']['ScannerCheckInRequestDto'];
export type ScannerCheckInResponse = components['schemas']['ScannerCheckInResponseDto'];
export type CheckInRevertResponse = components['schemas']['CheckInRevertResponseDto'];
export type ScannerSearchResponse = components['schemas']['ScannerSearchResponseDto'];
export type ScanPhysicalPassResponse = components['schemas']['ScanPhysicalPassResponseDto'];
export type ScannerFloorplanResponse = components['schemas']['ScannerFloorplanResponseDto'];
export type ScannerScanResponse = components['schemas']['ScannerScanResponseDto'];

// Re-exports de tipos anidados útiles
export type PendingAssistant = components['schemas']['PendingAssistantDto'];
export type CheckedInAssistant = components['schemas']['CheckedInAssistantDto'];
export type ScannerInvitation = components['schemas']['ScannerInvitationDto'];
export type ScannerInvitationResult = components['schemas']['ScannerInvitationResultDto'];
export type FloorplanShape = components['schemas']['FloorplanShapeResponseDto'];
export type ScannerTable = components['schemas']['ScannerTableDto'];

const segment = (value: string) => encodeURIComponent(value);

export function createScannerClient(request: ApiRequester) {
  return {
    async getSession(staffToken: string): Promise<ScannerSessionResponse> {
      return request<ScannerSessionResponse>({
        method: 'GET',
        path: `/api/v1/scanner/${segment(staffToken)}/session`,
        credentials: 'omit',
        response: 'json'
      });
    },

    /**
     * Escanea un token QR de Invitación digital.
     * Body: { qrToken } — conforme a ScannerScanRequestDto
     */
    async scan(staffToken: string, qrToken: string): Promise<ScannerScanResponse> {
      return request<ScannerScanResponse>({
        method: 'POST',
        path: `/api/v1/scanner/${segment(staffToken)}/scan`,
        body: { qrToken },
        credentials: 'omit',
        response: 'json'
      });
    },

    async search(staffToken: string, query: string): Promise<ScannerSearchResponse> {
      return request<ScannerSearchResponse>({
        method: 'POST',
        path: `/api/v1/scanner/${segment(staffToken)}/search`,
        body: { query },
        credentials: 'omit',
        response: 'json'
      });
    },

    async checkIn(staffToken: string, payload: ScannerCheckInRequest): Promise<ScannerCheckInResponse> {
      return request<ScannerCheckInResponse>({
        method: 'POST',
        path: `/api/v1/scanner/${segment(staffToken)}/check-in`,
        body: payload,
        credentials: 'omit',
        response: 'json'
      });
    },

    /**
     * Escanea un token QR de Pase Físico.
     * Body: { qrToken } — conforme a ScanPhysicalPassRequestDto
     */
    async scanPhysicalPass(staffToken: string, qrToken: string): Promise<ScanPhysicalPassResponse> {
      return request<ScanPhysicalPassResponse>({
        method: 'POST',
        path: `/api/v1/scanner/${segment(staffToken)}/physical-passes/scan`,
        body: { qrToken },
        credentials: 'omit',
        response: 'json'
      });
    },

    async getFloorplan(staffToken: string): Promise<ScannerFloorplanResponse> {
      return request<ScannerFloorplanResponse>({
        method: 'GET',
        path: `/api/v1/scanner/${segment(staffToken)}/floorplan`,
        credentials: 'omit',
        response: 'json'
      });
    }
  };
}

export type ScannerClient = ReturnType<typeof createScannerClient>;
