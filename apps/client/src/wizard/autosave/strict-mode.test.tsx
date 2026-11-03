import { AppThemeProvider } from '@invitaciones/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { createClientQueryClient } from '../../app/query-client';
import { createClientMemoryRouter } from '../../app/router';
import { configuredEvent, mockApiClient } from '../../test/fixtures';

it('autosaves after the StrictMode setup-cleanup-setup lifecycle', async () => {
  const api = mockApiClient();
  vi.mocked(api.events.update).mockImplementation(async (_, input) => ({ ...configuredEvent, ...input }));
  const queryClient = createClientQueryClient();
  const router = createClientMemoryRouter(
    { apiClient: api, queryClient, adminAppUrl: 'http://localhost:5174', landingUrl: 'http://localhost:5176' },
    [`/eventos/${configuredEvent.id}/configuracion/datos`]
  );
  render(
    <StrictMode>
      <AppThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AppThemeProvider>
    </StrictMode>
  );
  fireEvent.change(await screen.findByLabelText('Nombre del evento'), { target: { value: 'Nombre guardado' } });
  await waitFor(() => expect(api.events.update).toHaveBeenCalledTimes(1));
  expect(api.events.update).toHaveBeenCalledWith(
    configuredEvent.id,
    expect.objectContaining({ name: 'Nombre guardado' })
  );
  expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
});
