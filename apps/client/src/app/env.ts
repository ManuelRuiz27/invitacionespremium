export interface ClientEnv {
  apiBaseUrl: string;
  socketUrl: string;
  adminAppUrl: string;
  landingUrl: string;
}

type EnvSource = Record<string, string | boolean | undefined>;

const developmentDefaults: ClientEnv = {
  apiBaseUrl: 'http://localhost:3000/api/v1',
  socketUrl: 'http://localhost:3000',
  adminAppUrl: 'http://localhost:5174',
  landingUrl: 'http://localhost:5176'
};

export function readClientEnv(source: EnvSource = import.meta.env, production = import.meta.env.PROD): ClientEnv {
  return {
    apiBaseUrl: readUrl(source, 'VITE_API_BASE_URL', production, developmentDefaults.apiBaseUrl),
    socketUrl: readUrl(source, 'VITE_SOCKET_URL', production, developmentDefaults.socketUrl),
    adminAppUrl: readUrl(source, 'VITE_ADMIN_APP_URL', production, developmentDefaults.adminAppUrl),
    landingUrl: readUrl(source, 'VITE_LANDING_URL', production, developmentDefaults.landingUrl)
  };
}

function readUrl(source: EnvSource, key: string, production: boolean, developmentDefault: string): string {
  const raw = source[key];
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : production ? '' : developmentDefault;
  if (!value) throw new Error(`${key} is required in production.`);

  const parsed = new URL(value);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${key} must be a safe HTTP(S) URL.`);
  }
  return value.replace(/\/+$/, '');
}
