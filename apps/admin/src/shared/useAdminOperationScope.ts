import { useCallback, useEffect, useRef } from 'react';

export interface AdminScopedOperation {
  entityType: string;
  entityId: string;
  generation: number;
  signal: AbortSignal;
  isCurrent(): boolean;
  finish(): void;
}

export function useAdminOperationScope(entityType: string, entityId: string) {
  const mounted = useRef(true);
  const generation = useRef(0);
  const active = useRef<{ controller: AbortController; generation: number } | null>(null);

  const abort = useCallback(() => {
    active.current?.controller.abort();
    active.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    abort();
    return () => {
      mounted.current = false;
      generation.current += 1;
      abort();
    };
  }, [abort, entityId, entityType]);

  const begin = useCallback((): AdminScopedOperation | null => {
    if (!mounted.current || active.current) return null;
    const controller = new AbortController();
    const operationGeneration = generation.current;
    const token = { controller, generation: operationGeneration };
    active.current = token;
    const isCurrent = () =>
      mounted.current &&
      active.current === token &&
      generation.current === operationGeneration &&
      !controller.signal.aborted;
    return {
      entityType,
      entityId,
      generation: operationGeneration,
      signal: controller.signal,
      isCurrent,
      finish: () => {
        if (active.current === token) active.current = null;
      }
    };
  }, [entityId, entityType]);

  return { begin, abort };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
