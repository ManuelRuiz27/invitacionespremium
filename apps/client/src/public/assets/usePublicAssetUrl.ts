import { useCallback, useEffect, useRef, useState } from 'react';

interface AssetState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

export function usePublicAssetUrl(load: (signal: AbortSignal) => Promise<Blob>, identity: string) {
  const [state, setState] = useState<AssetState>({ url: null, loading: true, error: false });
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    revoke();
    setState({ url: null, loading: true, error: false });
    void load(controller.signal).then(
      (blob) => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setState({ url, loading: false, error: false });
      },
      () => {
        if (!controller.signal.aborted) setState({ url: null, loading: false, error: true });
      }
    );
    return () => {
      controller.abort();
      revoke();
    };
  }, [identity, load, revoke]);

  return state;
}
