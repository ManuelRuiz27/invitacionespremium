import type { ApiClient } from '@invitaciones/api-client';
import type { QueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { LoginPage } from '../auth/LoginPage';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { RoleRoute } from '../auth/RoleRoute';
import { DashboardPage } from '../dashboard/DashboardPage';
import { FinancePage } from '../finance/FinancePage';
import { ClientShell } from '../layout/ClientShell';
import { PublicAlbumPage } from '../public/album/PublicAlbumPage';
import { PublicInvitationPage } from '../public/invitation/PublicInvitationPage';
import { PublicNotFoundPage } from '../public/PublicNotFoundPage';
import { financeRoles } from '../shared/roles';
import { WizardPage } from '../wizard/WizardPage';
import { ActiveEventWorkspacePage } from '../workspace/ActiveEventWorkspacePage';

export interface RouterDependencies {
  apiClient: ApiClient;
  queryClient: QueryClient;
  adminAppUrl: string;
  scannerAppUrl?: string;
  landingUrl: string;
  navigateExternal?: (url: string) => void;
}

export function createClientRouter(dependencies: RouterDependencies) {
  return createBrowserRouter(createRoutes(dependencies));
}

export function createClientMemoryRouter(dependencies: RouterDependencies, initialEntries: string[]) {
  return createMemoryRouter(createRoutes(dependencies), { initialEntries });
}

function createRoutes(dependencies: RouterDependencies): RouteObject[] {
  return [
    { path: '/invitacion/:invitationToken', element: <PublicInvitationPage apiClient={dependencies.apiClient} /> },
    { path: '/album/:albumToken', element: <PublicAlbumPage apiClient={dependencies.apiClient} /> },
    {
      element: (
        <AuthProvider
          apiClient={dependencies.apiClient}
          queryClient={dependencies.queryClient}
          adminAppUrl={dependencies.adminAppUrl}
          {...(dependencies.navigateExternal ? { navigateExternal: dependencies.navigateExternal } : {})}
        >
          <Outlet />
        </AuthProvider>
      ),
      children: [
        { path: '/login', element: <LoginPage landingUrl={dependencies.landingUrl} /> },
        {
          element: <ProtectedRoute />,
          children: [
            {
              element: <ClientShell />,
              children: [
                { index: true, element: <Navigate to="/eventos" replace /> },
                { path: '/eventos', element: <DashboardPage apiClient={dependencies.apiClient} /> },
                {
                  path: '/eventos/:eventId',
                  element: (
                    <ActiveEventWorkspacePage
                      apiClient={dependencies.apiClient}
                      {...(dependencies.scannerAppUrl ? { scannerAppUrl: dependencies.scannerAppUrl } : {})}
                    />
                  )
                },
                { path: '/eventos/nuevo', element: <WizardPage apiClient={dependencies.apiClient} /> },
                {
                  path: '/eventos/:eventId/configuracion/:step',
                  element: <WizardPage apiClient={dependencies.apiClient} />
                },
                {
                  element: <RoleRoute allowed={financeRoles} />,
                  children: [{ path: '/finanzas', element: <FinancePage apiClient={dependencies.apiClient} /> }]
                }
              ]
            }
          ]
        }
      ]
    },
    { path: '*', element: <PublicNotFoundPage /> }
  ];
}
