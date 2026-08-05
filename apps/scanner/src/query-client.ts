import { QueryClient } from '@tanstack/react-query';

export function createScannerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000
      }
    }
  });
}
