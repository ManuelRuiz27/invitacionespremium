import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError, usePublicOperationScope } from '../operations/usePublicOperationScope';

interface AssetState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

export function usePublicAssetUrl(load: (signal: AbortSignal) => Promise<Blob>, identity: string) {
  const [state, setState] = useState<AssetState>({ url: null, loading: true, error: false });
  const urlRef = useRef<string | null>(null);
  const scope = usePublicOperationScope(identity);

  const revoke = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const retry = useCallback(() => {
    const operation = scope.begin('asset');
    revoke();
    setState({ url: null, loading: true, error: false });
    void load(operation.signal)
      .then(
        (blob) => {
          if (!operation.isCurrent()) return;
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setState({ url, loading: false, error: false });
        },
        (error: unknown) => {
          if (operation.isCurrent() && !isAbortError(error)) setState({ url: null, loading: false, error: true });
        }
      )
      .finally(operation.finish);
  }, [load, revoke, scope]);

  useEffect(() => {
    retry();
    return () => {
      scope.abortAll();
      revoke();
    };
  }, [identity, retry, revoke, scope]);

  return { ...state, retry };
}
