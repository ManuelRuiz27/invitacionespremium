import { useMemo } from 'react';
import { createApiClient, type ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { readScannerEnv, type ScannerEnv } from './env';
import { createScannerQueryClient } from './query-client';
import { createScannerRouter } from './router';

export interface AppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  env?: ScannerEnv;
}

export function App(props: AppProps) {
  const dependencies = useMemo(() => {
    const env = props.env ?? readScannerEnv();
    const queryClient = props.queryClient ?? createScannerQueryClient();
    const apiClient = props.apiClient ?? createApiClient({ baseUrl: env.apiBaseUrl });
    return { queryClient, router: createScannerRouter({ apiClient, apiBaseUrl: env.apiBaseUrl }) };
  }, [props.apiClient, props.env, props.queryClient]);
  return (
    <AppThemeProvider>
      <QueryClientProvider client={dependencies.queryClient}>
        <RouterProvider router={dependencies.router} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
}
