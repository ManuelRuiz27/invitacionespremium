import { createBrowserRouter } from 'react-router-dom';
import type { ApiClient } from '@invitaciones/api-client';
import { ScannerSessionPage } from './pages/ScannerSessionPage';

export interface RouterDependencies {
  apiClient: ApiClient;
  apiBaseUrl: string;
}

export function createScannerRouter(dependencies: RouterDependencies) {
  return createBrowserRouter([
    {
      path: '/scanner/:staffToken',
      element: <ScannerSessionPage apiClient={dependencies.apiClient} apiBaseUrl={dependencies.apiBaseUrl} />
    },
    {
      path: '*',
      element: (
        <div style={{ padding: '2rem', textAlign: 'center' }}>Escanea un código QR Staff válido para iniciar.</div>
      )
    }
  ]);
}
