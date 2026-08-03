import type { ApiClient } from '@invitaciones/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { Button, Stack, Typography } from '@mui/material';
import { createBrowserRouter, createMemoryRouter, Link, Outlet, type RouteObject } from 'react-router-dom';
import { AdminAuthProvider } from '../auth/AdminAuthProvider';
import { AdminLoginPage } from '../auth/AdminLoginPage';
import { AdminProtectedRoute } from '../auth/AdminProtectedRoute';
import { AdminRoleGuard } from '../auth/AdminRoleGuard';
import { AdminClientDetailPage } from '../clients/AdminClientDetailPage';
import { AdminClientsPage } from '../clients/AdminClientsPage';
import { AdminDashboardPage } from '../dashboard/AdminDashboardPage';
import { AdminEventDetailPage } from '../events/AdminEventDetailPage';
import { AdminEventsPage } from '../events/AdminEventsPage';
import { AdminShell } from '../layout/AdminShell';

export function createAdminRouter({ apiClient, queryClient }: { apiClient: ApiClient; queryClient: QueryClient }) {
  return createBrowserRouter(createRoutes({ apiClient, queryClient }));
}

export function createAdminMemoryRouter(
  dependencies: { apiClient: ApiClient; queryClient: QueryClient },
  initialEntries: string[]
) {
  return createMemoryRouter(createRoutes(dependencies), { initialEntries });
}

function createRoutes({ apiClient, queryClient }: { apiClient: ApiClient; queryClient: QueryClient }): RouteObject[] {
  return [
    {
      element: (
        <AdminAuthProvider apiClient={apiClient} queryClient={queryClient}>
          <Outlet />
        </AdminAuthProvider>
      ),
      children: [
        { path: '/login', element: <AdminLoginPage /> },
        {
          element: <AdminProtectedRoute />,
          children: [
            {
              element: <AdminRoleGuard />,
              children: [
                {
                  element: <AdminShell />,
                  children: [
                    { index: true, element: <AdminDashboardPage apiClient={apiClient} /> },
                    { path: 'clientes', element: <AdminClientsPage apiClient={apiClient} /> },
                    { path: 'clientes/:clientId', element: <AdminClientDetailPage apiClient={apiClient} /> },
                    { path: 'eventos', element: <AdminEventsPage apiClient={apiClient} /> },
                    { path: 'eventos/:eventId', element: <AdminEventDetailPage apiClient={apiClient} /> },
                    { path: '*', element: <NotFound /> }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ];
}

function NotFound() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography component="h1" variant="h2">
        Pagina administrativa no disponible.
      </Typography>
      <Typography color="text.secondary">La ruta no pertenece al corte administrativo actual.</Typography>
      <Button component={Link} to="/">
        Volver al resumen
      </Button>
    </Stack>
  );
}
