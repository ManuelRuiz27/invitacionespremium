import type { ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { createAdminQueryClient } from '../app/query-client';
import { createAdminMemoryRouter } from '../app/router';

export function renderAdminApp(apiClient: ApiClient, initialEntry = '/') {
  const queryClient = createAdminQueryClient();
  const router = createAdminMemoryRouter({ apiClient, queryClient }, [initialEntry]);
  const result = render(
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
  return { ...result, router, queryClient };
}
