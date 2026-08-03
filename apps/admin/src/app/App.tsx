import { useMemo } from 'react';
import { createApiClient, type ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider, type RouterProviderProps } from 'react-router-dom';
import {
  createAdminUnauthorizedController,
  type AdminUnauthorizedController
} from '../auth/admin-unauthorized-controller';
import { createAdminFinanceIntentRegistry, type AdminFinanceIntentRegistry } from '../finance/admin-finance-intents';
import { readAdminEnv, type AdminEnv } from './env';
import { createAdminQueryClient } from './query-client';
import { createAdminRouter } from './router';

export interface AppProps {
  apiClient?: ApiClient;
  queryClient?: QueryClient;
  env?: AdminEnv;
  unauthorizedController?: AdminUnauthorizedController;
  financeIntentRegistry?: AdminFinanceIntentRegistry;
}

export function App(props: AppProps) {
  const dependencies = useMemo(() => {
    const env = props.env ?? readAdminEnv();
    const queryClient = props.queryClient ?? createAdminQueryClient();
    const unauthorizedController = props.unauthorizedController ?? createAdminUnauthorizedController();
    const financeIntentRegistry = props.financeIntentRegistry ?? createAdminFinanceIntentRegistry();
    const apiClient =
      props.apiClient ??
      createApiClient({ baseUrl: env.apiBaseUrl, onUnauthorized: () => unauthorizedController.notify() });
    return {
      queryClient,
      router: createAdminRouter({ apiClient, queryClient, unauthorizedController, financeIntentRegistry })
    };
  }, [props.apiClient, props.env, props.financeIntentRegistry, props.queryClient, props.unauthorizedController]);

  return (
    <AppThemeProvider>
      <QueryClientProvider client={dependencies.queryClient}>
        <RouterProvider router={dependencies.router as RouterProviderProps['router']} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
}
