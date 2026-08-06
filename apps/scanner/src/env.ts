export interface ScannerEnv {
  apiBaseUrl: string;
  realtime: ScannerRealtimeConfig;
}

export interface ScannerRealtimeConfig {
  serverUrl: string;
  namespace: '/realtime';
  path: '/socket.io';
}

export function readScannerEnv(): ScannerEnv {
  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1',
    realtime: {
      serverUrl: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000',
      namespace: '/realtime',
      path: '/socket.io'
    }
  };
}
