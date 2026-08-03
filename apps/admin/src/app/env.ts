import { normalizeApiBaseUrl } from '@invitaciones/api-client';

export interface AdminEnv {
  apiBaseUrl: string;
}

type EnvSource = Record<string, string | boolean | undefined>;

export function readAdminEnv(source: EnvSource = import.meta.env): AdminEnv {
  const raw = source.VITE_API_BASE_URL;
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw new Error('VITE_API_BASE_URL is required.');
  return { apiBaseUrl: normalizeApiBaseUrl(value) };
}
