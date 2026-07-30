import { createApiError, unexpectedResponse } from './api-error';

export interface ApiClientRuntimeConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface ApiRequest {
  method?: 'GET' | 'POST';
  path: string;
  body?: unknown;
  signal?: AbortSignal;
  response: 'json' | 'empty';
}

export type ApiRequester = <T>(request: ApiRequest, validate: (payload: unknown) => payload is T) => Promise<T>;

export function normalizeApiBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new TypeError('baseUrl is required.');

  const parsed = new URL(normalized);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError('baseUrl must be an HTTP(S) URL without credentials, query or fragment.');
  }
  return normalized;
}

export function createRequester(config: ApiClientRuntimeConfig): ApiRequester {
  const baseUrl = normalizeApiBaseUrl(config.baseUrl);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) throw new TypeError('A fetch implementation is required.');

  return async <T>(request: ApiRequest, validate: (payload: unknown) => payload is T): Promise<T> => {
    const response = await fetchImpl(`${baseUrl}${request.path}`, {
      method: request.method ?? 'GET',
      credentials: 'include',
      headers: request.body === undefined ? { Accept: 'application/json' } : jsonHeaders,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });

    if (!response.ok) {
      throw createApiError(response.status, await readOptionalJson(response));
    }

    if (request.response === 'empty') return undefined as T;

    const payload = await readRequiredJson(response);
    if (!validate(payload)) throw unexpectedResponse();
    return payload;
  };
}

const jsonHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
} as const;

async function readRequiredJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) throw unexpectedResponse('La API devolvió una respuesta vacía.');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw unexpectedResponse('La API devolvió una respuesta que no es JSON.');
  }
}

async function readOptionalJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}
