import { useMemo } from 'react';
import { createApiClient, type ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, type RouterProviderProps } from 'react-router-dom';
import { readAdminEnv, type AdminEnv } from './env';
import { createAdminQueryClient } from './query-client';
import { createAdminRouter } from './router';

export interface AppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  env?: AdminEnv;
}

export function App(props: AppProps) {
  const dependencies = useMemo(() => {
    const env = props.env ?? readAdminEnv();
    const queryClient = props.queryClient ?? createAdminQueryClient();
    const apiClient = props.apiClient ?? createApiClient({ baseUrl: env.apiBaseUrl });
    return { queryClient, router: createAdminRouter({ apiClient, queryClient }) };
  }, [props.apiClient, props.env, props.queryClient]);

  return (
    <AppThemeProvider>
      <QueryClientProvider client={dependencies.queryClient}>
        <RouterProvider router={dependencies.router as RouterProviderProps['router']} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
}
