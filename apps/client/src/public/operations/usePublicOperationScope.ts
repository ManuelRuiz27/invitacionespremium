import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface PublicOperation {
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
}

interface ScopeState {
  token: string;
  generation: number;
  mounted: boolean;
  controllers: Map<string, AbortController>;
}

export function usePublicOperationScope(token: string) {
  const scopeRef = useRef<ScopeState>({ token, generation: 0, mounted: false, controllers: new Map() });
  const scope = scopeRef.current;

  if (scope.token !== token) {
    scope.token = token;
    scope.generation += 1;
  }

  const abortAll = useCallback(() => {
    for (const controller of scopeRef.current.controllers.values()) controller.abort();
    scopeRef.current.controllers.clear();
  }, []);

  useEffect(() => {
    const current = scopeRef.current;
    current.mounted = true;
    for (const [key, controller] of current.controllers) {
      controller.abort();
      current.controllers.delete(key);
    }
    return () => {
      current.mounted = false;
      current.generation += 1;
      abortAll();
    };
  }, [abortAll, token]);

  const begin = useCallback((key: string): PublicOperation => {
    const current = scopeRef.current;
    current.controllers.get(key)?.abort();
    const controller = new AbortController();
    const operationToken = current.token;
    const operationGeneration = current.generation;
    current.controllers.set(key, controller);
    const isCurrent = () =>
      current.mounted &&
      !controller.signal.aborted &&
      current.token === operationToken &&
      current.generation === operationGeneration &&
      current.controllers.get(key) === controller;
    return {
      signal: controller.signal,
      isCurrent,
      finish: () => {
        if (current.controllers.get(key) === controller) current.controllers.delete(key);
      }
    };
  }, []);

  return useMemo(() => ({ begin, abortAll }), [abortAll, begin]);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}
