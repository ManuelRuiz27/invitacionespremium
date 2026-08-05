import { useMemo } from 'react';
import { createApiClient, createScannerAppClient, type ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, type RouterProviderProps } from 'react-router-dom';
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
    
    // El api-client base no tiene el ScannerClient inyectado en createApiClient,
    // pero podemos pasar el ApiClient modificado u originar los wrappers aquí.
    // Usaremos el apiClient normal, pero le inyectaremos el scanner
    const baseClient = props.apiClient ?? createApiClient({ baseUrl: env.apiBaseUrl });
    const scannerClient = createScannerAppClient({ baseUrl: env.apiBaseUrl });
    
    const apiClient = { ...baseClient, scanner: scannerClient } as unknown as ApiClient;

    return {
      queryClient,
      router: createScannerRouter({ apiClient })
    };
  }, [props.apiClient, props.env, props.queryClient]);

  return (
    <AppThemeProvider>
      <QueryClientProvider client={dependencies.queryClient}>
        <RouterProvider router={dependencies.router as RouterProviderProps['router']} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
}
