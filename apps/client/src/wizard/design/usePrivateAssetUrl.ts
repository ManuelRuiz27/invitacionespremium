import type { ApiClient } from '@invitaciones/api-client';
import { useEffect, useState } from 'react';

export function usePrivateAssetUrl(apiClient: ApiClient, eventId: string, assetId?: string | null): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void apiClient.fileAssets
      .content(eventId, assetId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUrl(undefined);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiClient, assetId, eventId]);
  return url;
}
