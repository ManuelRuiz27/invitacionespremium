import { createBrowserRouter } from 'react-router-dom';
import type { ApiClient } from '@invitaciones/api-client';
import type { ScannerRealtimeConfig } from './env';
import { ScannerSessionPage } from './pages/ScannerSessionPage';
import { ScannerWelcomePage } from './pages/ScannerWelcomePage';

export interface RouterDependencies {
  apiClient: ApiClient;
  apiBaseUrl: string;
  realtime: ScannerRealtimeConfig;
}

export function createScannerRouter(dependencies: RouterDependencies) {
  return createBrowserRouter([
    {
      path: '/scanner/:staffToken',
      element: (
        <ScannerSessionPage
          apiClient={dependencies.apiClient}
          apiBaseUrl={dependencies.apiBaseUrl}
          realtime={dependencies.realtime}
        />
      )
    },
    {
      path: '/',
      element: <ScannerWelcomePage />
    },
    {
      path: '*',
      element: <ScannerWelcomePage />
    }
  ]);
}
