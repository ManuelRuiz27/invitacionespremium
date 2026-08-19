import type { ApiClient } from '@invitaciones/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { Button, Stack, Typography } from '@mui/material';
import { createBrowserRouter, createMemoryRouter, Link, Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { AdminAuthProvider } from '../auth/AdminAuthProvider';
import type { AdminUnauthorizedController } from '../auth/admin-unauthorized-controller';
import { AdminLoginPage } from '../auth/AdminLoginPage';
import { AdminProtectedRoute } from '../auth/AdminProtectedRoute';
import { AdminRoleGuard } from '../auth/AdminRoleGuard';
import { AdminClientDetailPage } from '../clients/AdminClientDetailPage';
import { AdminClientsPage } from '../clients/AdminClientsPage';
import { AdminDashboardPage } from '../dashboard/AdminDashboardPage';
import { AdminEventDetailPage } from '../events/AdminEventDetailPage';
import { AdminEventPreparationPage } from '../events/preparation/AdminEventPreparationPage';
import { AdminEventsPage } from '../events/AdminEventsPage';
import { AdminFinanceIntentProvider, type AdminFinanceIntentRegistry } from '../finance/admin-finance-intents';
import { AdminShell } from '../layout/AdminShell';
import { AdminCatalogPage } from '../catalog/AdminCatalogPage';
import { AdminEventReportsRoute, AdminReportsPage } from '../reports/AdminReportsPage';
import { AdminAuditPage } from '../audit/AdminAuditPage';

export interface AdminRouterDependencies {
  apiClient: ApiClient;
  queryClient: QueryClient;
  unauthorizedController: AdminUnauthorizedController;
  financeIntentRegistry: AdminFinanceIntentRegistry;
}

export function createAdminRouter(dependencies: AdminRouterDependencies) {
  return createBrowserRouter(createRoutes(dependencies));
}

export function createAdminMemoryRouter(dependencies: AdminRouterDependencies, initialEntries: string[]) {
  return createMemoryRouter(createRoutes(dependencies), { initialEntries });
}

function createRoutes({
  apiClient,
  queryClient,
  unauthorizedController,
  financeIntentRegistry
}: AdminRouterDependencies): RouteObject[] {
  return [
    {
      element: (
        <AdminFinanceIntentProvider registry={financeIntentRegistry}>
          <AdminAuthProvider
            apiClient={apiClient}
            queryClient={queryClient}
            unauthorizedController={unauthorizedController}
            financeIntentRegistry={financeIntentRegistry}
          >
            <Outlet />
          </AdminAuthProvider>
        </AdminFinanceIntentProvider>
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
                    { path: 'eventos/:eventId/preparar', element: <Navigate replace to="datos" /> },
                    {
                      path: 'eventos/:eventId/preparar/datos',
                      element: <AdminEventPreparationPage apiClient={apiClient} />
                    },
                    {
                      path: 'eventos/:eventId/preparar/invitacion',
                      element: <AdminEventPreparationPage apiClient={apiClient} />
                    },
                    {
                      path: 'eventos/:eventId/preparar/croquis',
                      element: <AdminEventPreparationPage apiClient={apiClient} />
                    },
                    { path: 'catalogo', element: <AdminCatalogPage apiClient={apiClient} /> },
                    { path: 'reportes', element: <AdminReportsPage apiClient={apiClient} /> },
                    { path: 'reportes/eventos/:eventId', element: <AdminEventReportsRoute apiClient={apiClient} /> },
                    { path: 'auditoria', element: <AdminAuditPage apiClient={apiClient} /> },
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
