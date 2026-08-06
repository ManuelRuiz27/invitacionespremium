export interface ScannerEnv {
  apiBaseUrl: string;
  realtime: ScannerRealtimeConfig;
}

export interface ScannerRealtimeConfig {
  serverUrl: string;
  namespace: '/realtime';
  path: '/socket.io';
}

type EnvSource = Record<string, string | boolean | undefined>;

export function readScannerEnv(source: EnvSource = import.meta.env, production = import.meta.env.PROD): ScannerEnv {
  const apiBaseUrl = readStagingUrl(source.VITE_API_BASE_URL, 'VITE_API_BASE_URL', production, '/api/v1');
  const serverUrl = readStagingUrl(source.VITE_SOCKET_URL, 'VITE_SOCKET_URL', production, '/');

  return {
    apiBaseUrl,
    realtime: {
      serverUrl,
      namespace: '/realtime',
      path: '/socket.io'
    }
  };
}

function readStagingUrl(
  raw: string | boolean | undefined,
  key: 'VITE_API_BASE_URL' | 'VITE_SOCKET_URL',
  production: boolean,
  expectedPath: '/api/v1' | '/'
): string {
  const developmentHostname = typeof window === 'undefined' ? 'dev.invalid' : window.location.hostname;
  const fallback = `http://${developmentHostname}:3000${key === 'VITE_API_BASE_URL' ? '/api/v1' : ''}`;
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : production ? '' : fallback;
  if (!value) throw new Error(`${key} is required in production.`);

  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  const normalizedPath = parsed.pathname.replace(/\/+$/u, '') || '/';

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    normalizedPath !== expectedPath ||
    (production && (parsed.protocol !== 'https:' || isLoopback))
  ) {
    throw new Error(`${key} must be a safe ${production ? 'HTTPS staging' : 'HTTP(S)'} URL with path ${expectedPath}.`);
  }

  return value.replace(/\/+$/u, '');
}
