import { useMutation, useQuery } from '@tanstack/react-query';
import type { ApiClient, ScannerCheckInRequest } from '@invitaciones/api-client';

export const scannerKeys = {
  all: ['scanner'] as const,
  session: (token: string) => [...scannerKeys.all, 'session', token] as const,
  floorplan: (token: string) => [...scannerKeys.all, 'floorplan', token] as const
};

export function useScannerSession(apiClient: ApiClient, staffToken: string) {
  return useQuery({
    queryKey: scannerKeys.session(staffToken),
    queryFn: ({ signal }) => apiClient.scanner.getSession(staffToken, signal),
    enabled: Boolean(staffToken),
    retry: (failureCount, error) =>
      !('status' in Object(error)) || ![401, 403, 409].includes(Number(Object(error).status)) ? failureCount < 2 : false
  });
}

export function useScannerFloorplan(apiClient: ApiClient, staffToken: string, enabled: boolean) {
  return useQuery({
    queryKey: scannerKeys.floorplan(staffToken),
    queryFn: ({ signal }) => apiClient.scanner.getFloorplan(staffToken, signal),
    enabled: Boolean(staffToken) && enabled,
    staleTime: 10 * 60 * 1000,
    retry: false
  });
}

export function useScannerMutations(apiClient: ApiClient, staffToken: string) {
  const scanMutation = useMutation({
    mutationFn: (qrToken: string) => apiClient.scanner.scan(staffToken, qrToken)
  });
  const checkInMutation = useMutation({
    mutationFn: ({ idempotencyKey, payload }: { idempotencyKey: string; payload: ScannerCheckInRequest }) =>
      apiClient.scanner.checkIn(staffToken, idempotencyKey, payload)
  });
  const scanPhysicalPassMutation = useMutation({
    mutationFn: ({ idempotencyKey, qrToken }: { idempotencyKey: string; qrToken: string }) =>
      apiClient.scanner.scanPhysicalPass(staffToken, idempotencyKey, qrToken)
  });
  const searchMutation = useMutation({
    mutationFn: (query: string) => apiClient.scanner.search(staffToken, query)
  });
  return { scanMutation, checkInMutation, scanPhysicalPassMutation, searchMutation };
}
