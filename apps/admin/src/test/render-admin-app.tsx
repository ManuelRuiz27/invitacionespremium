import type { ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { createAdminQueryClient } from '../app/query-client';
import { createAdminMemoryRouter } from '../app/router';
import { createAdminUnauthorizedController } from '../auth/admin-unauthorized-controller';
import { createAdminFinanceIntentRegistry, type AdminFinanceIntentRegistry } from '../finance/admin-finance-intents';
import type { AdminUnauthorizedController } from '../auth/admin-unauthorized-controller';

export function renderAdminApp(
  apiClient: ApiClient,
  initialEntry = '/',
  overrides: {
    unauthorizedController?: AdminUnauthorizedController;
    financeIntentRegistry?: AdminFinanceIntentRegistry;
  } = {}
) {
  const queryClient = createAdminQueryClient();
  const unauthorizedController = overrides.unauthorizedController ?? createAdminUnauthorizedController();
  const financeIntentRegistry = overrides.financeIntentRegistry ?? createAdminFinanceIntentRegistry();
  const router = createAdminMemoryRouter({ apiClient, queryClient, unauthorizedController, financeIntentRegistry }, [
    initialEntry
  ]);
  const result = render(
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
  return { ...result, router, queryClient, unauthorizedController, financeIntentRegistry };
}
