import { createApiError, unexpectedResponse } from './api-error';

export interface ApiClientRuntimeConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  response: 'json' | 'empty' | 'text' | 'blob' | 'arrayBuffer';
}

export type ApiRequester = <T>(request: ApiRequest, validate?: (payload: unknown) => payload is T) => Promise<T>;

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

  return async <T>(request: ApiRequest, validate?: (payload: unknown) => payload is T): Promise<T> => {
    const isMultipart = typeof FormData !== 'undefined' && request.body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: request.response === 'json' ? 'application/json' : '*/*',
      ...request.headers
    };
    if (request.body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';

    const response = await fetchImpl(`${baseUrl}${request.path}`, {
      method: request.method ?? 'GET',
      credentials: 'include',
      headers,
      ...(request.body === undefined
        ? {}
        : { body: (isMultipart ? request.body : JSON.stringify(request.body)) as BodyInit }),
      ...(request.signal === undefined ? {} : { signal: request.signal })
    });

    if (!response.ok) {
      throw createApiError(response.status, await readOptionalJson(response));
    }

    if (request.response === 'empty' || response.status === 204) return undefined as T;
    if (request.response === 'text') return (await response.text()) as T;
    if (request.response === 'blob') return (await response.blob()) as T;
    if (request.response === 'arrayBuffer') return (await response.arrayBuffer()) as T;

    const payload = await readRequiredJson(response);
    if (!validate?.(payload)) throw unexpectedResponse();
    return payload;
  };
}

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
