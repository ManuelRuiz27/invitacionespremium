export interface ScannerEnv {
  apiBaseUrl: string;
  wsBaseUrl: string;
}

export function readScannerEnv(): ScannerEnv {
  return {
    apiBaseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    wsBaseUrl: import.meta.env.VITE_WS_URL || 'http://localhost:3001'
  };
}
