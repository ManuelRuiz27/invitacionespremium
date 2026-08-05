import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from '@invitaciones/api-client';

export const scannerKeys = {
  all: ['scanner'] as const,
  session: (token: string) => [...scannerKeys.all, 'session', token] as const,
  floorplan: (token: string) => [...scannerKeys.all, 'floorplan', token] as const
};

export function useScannerSession(apiClient: ApiClient, staffToken: string) {
  return useQuery({
    queryKey: scannerKeys.session(staffToken),
    queryFn: () => apiClient.scanner!.getSession(staffToken),
    retry: (failureCount, error: unknown) => {
      // No reintentar si el token es inválido o revocado
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    }
  });
}

export function useScannerFloorplan(apiClient: ApiClient, staffToken: string) {
  return useQuery({
    queryKey: scannerKeys.floorplan(staffToken),
    queryFn: () => apiClient.scanner!.getFloorplan(staffToken),
    staleTime: 10 * 60 * 1000,
    retry: 1
  });
}

export function useScannerMutations(apiClient: ApiClient, staffToken: string) {
  const _queryClient = useQueryClient();

  const scanMutation = useMutation({
    mutationFn: (qrContent: string) => apiClient.scanner!.scan(staffToken, qrContent)
  });

  const checkInMutation = useMutation({
    mutationFn: (payload: { invitationId: string; assistantIds: string[] }) =>
      apiClient.scanner!.checkIn(staffToken, payload)
  });

  const scanPhysicalPassMutation = useMutation({
    mutationFn: (qrContent: string) => apiClient.scanner!.scanPhysicalPass(staffToken, qrContent)
  });

  const searchMutation = useMutation({
    mutationFn: (query: string) => apiClient.scanner!.search(staffToken, query)
  });

  return {
    scanMutation,
    checkInMutation,
    scanPhysicalPassMutation,
    searchMutation
  };
}
