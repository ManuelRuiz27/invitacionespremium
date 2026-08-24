import type { ApiClient } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { createClientQueryClient } from '../app/query-client';
import { createClientMemoryRouter } from '../app/router';

export function renderApp(
  apiClient: ApiClient,
  initialEntry = '/eventos',
  navigateExternal = (_url: string) => undefined,
  scannerAppUrl?: string
) {
  const queryClient = createClientQueryClient();
  const router = createClientMemoryRouter(
    {
      apiClient,
      queryClient,
      adminAppUrl: 'http://localhost:5174',
      landingUrl: 'http://localhost:5176',
      ...(scannerAppUrl ? { scannerAppUrl } : {}),
      navigateExternal
    },
    [initialEntry]
  );
  const result = render(
    <AppThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppThemeProvider>
  );
  return { ...result, router, queryClient };
}
