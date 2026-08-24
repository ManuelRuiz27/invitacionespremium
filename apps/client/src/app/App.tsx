import { useMemo } from 'react';
import { createApiClient, type ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, type RouterProviderProps } from 'react-router-dom';
import { readClientEnv, type ClientEnv } from './env';
import { createClientQueryClient } from './query-client';
import { createClientRouter } from './router';

export interface AppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  env?: ClientEnv;
  navigateExternal?: (url: string) => void;
}

export function App(props: AppProps) {
  const dependencies = useMemo(() => {
    const env = props.env ?? readClientEnv();
    const queryClient = props.queryClient ?? createClientQueryClient();
    const apiClient = props.apiClient ?? createApiClient({ baseUrl: env.apiBaseUrl });
    const router = createClientRouter({
      apiClient,
      queryClient,
      adminAppUrl: env.adminAppUrl,
      scannerAppUrl: env.scannerAppUrl,
      landingUrl: env.landingUrl,
      ...(props.navigateExternal ? { navigateExternal: props.navigateExternal } : {})
    });
    return { queryClient, router };
  }, [props.apiClient, props.env, props.navigateExternal, props.queryClient]);

  return (
    <AppThemeProvider>
      <QueryClientProvider client={dependencies.queryClient}>
        <RouterProvider router={dependencies.router as RouterProviderProps['router']} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
}
