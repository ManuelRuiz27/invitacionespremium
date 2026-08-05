import { createBrowserRouter } from 'react-router-dom';
import type { ApiClient } from '@invitaciones/api-client';
import { ScannerSessionPage } from './pages/ScannerSessionPage';

export interface RouterDependencies {
  apiClient: ApiClient;
}

export function createScannerRouter(dependencies: RouterDependencies) {
  return createBrowserRouter([
    {
      path: '/scanner/:staffToken',
      element: <ScannerSessionPage apiClient={dependencies.apiClient} />
    },
    {
      path: '*',
      element: <div style={{ padding: '2rem', textAlign: 'center' }}>Por favor, escanea un código QR de Staff válido para iniciar.</div>
    }
  ]);
}
