export interface ScannerEnv {
  apiBaseUrl: string;
  wsBaseUrl: string;
}

export function readScannerEnv(): ScannerEnv {
  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1',
    wsBaseUrl: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
  };
}
