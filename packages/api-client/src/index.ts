export interface ApiClientRuntimeConfig {
  baseUrl: string;
}

export function normalizeApiBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export const API_CLIENT_STATUS = 'Bootstrap only. Endpoint clients must be generated from the API OpenAPI document.';
