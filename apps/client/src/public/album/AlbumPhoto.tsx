import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient, PublicAlbumPhoto as Photo } from '@invitaciones/api-client';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import { albumPhotoIdFromPath } from '../routing/public-content-path';
import { PublicPhotoPool, type PhotoPoolState } from './photo-pool';

export function AlbumPhoto({
  apiClient,
  token,
  photo,
  pool,
  onOpen
}: {
  apiClient: ApiClient;
  token: string;
  photo: Photo;
  pool: PublicPhotoPool;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      setNearby(true);
      setVisible(true);
      return;
    }
    const nearObserver = new IntersectionObserver(
      (entries) => {
        setNearby(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: '240px' }
    );
    const visibleObserver = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    });
    if (ref.current) {
      nearObserver.observe(ref.current);
      visibleObserver.observe(ref.current);
    }
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, []);
  return (
    <Box ref={ref} data-photo-position={photo.position} sx={{ minHeight: 220 }}>
      {nearby ? (
        <LoadedPhoto
          apiClient={apiClient}
          token={token}
          photo={photo}
          pool={pool}
          priority={visible ? 2 : 1}
          onOpen={onOpen}
        />
      ) : (
        <Skeleton variant="rounded" height={260} />
      )}
    </Box>
  );
}

export function LoadedPhoto({
  apiClient,
  token,
  photo,
  pool,
  onOpen,
  preview = false,
  priority = preview ? 3 : 1
}: {
  apiClient: ApiClient;
  token: string;
  photo: Photo;
  pool: PublicPhotoPool;
  onOpen?: () => void;
  preview?: boolean;
  priority?: number;
}) {
  const photoId = albumPhotoIdFromPath(photo.contentPath, token);
  const load = useCallback(
    (signal: AbortSignal) =>
      photoId ? apiClient.publicAlbum.photo(token, photoId, signal) : Promise.reject(new Error('invalid path')),
    [apiClient, photoId, token]
  );
  const state = usePhotoPoolState(pool, `${token}:${photo.id}`, load, priority);
  if (state.status === 'idle' || state.status === 'loading' || state.status === 'evicted')
    return <Skeleton variant="rounded" height={preview ? 520 : 260} />;
  if (state.status === 'error')
    return (
      <Box sx={{ p: 3 }}>
        <Typography>No pudimos cargar este contenido.</Typography>
        <Button variant="outlined" onClick={state.retry} sx={{ mt: 1 }}>
          Reintentar
        </Button>
      </Box>
    );
  const image = (
    <Box
      component="img"
      src={state.url}
      alt="Recuerdo del evento"
      loading="lazy"
      sx={{
        display: 'block',
        width: '100%',
        height: preview ? 'min(72svh, 760px)' : 280,
        objectFit: preview ? 'contain' : 'cover'
      }}
    />
  );
  return onOpen ? (
    <Button
      aria-label={`Abrir foto ${photo.position}`}
      onClick={onOpen}
      sx={{ display: 'block', p: 0, width: '100%', overflow: 'hidden', borderRadius: 1 }}
    >
      {image}
    </Button>
  ) : (
    image
  );
}

function usePhotoPoolState(
  pool: PublicPhotoPool,
  key: string,
  load: (signal: AbortSignal) => Promise<Blob>,
  priority: number
): PhotoPoolState & { retry: () => void } {
  const [state, setState] = useState<PhotoPoolState>({ status: 'idle', url: null });
  useEffect(() => {
    const unsubscribe = pool.subscribe(key, setState, priority);
    pool.load(key, load);
    return unsubscribe;
  }, [key, load, pool, priority]);
  return { ...state, retry: () => pool.load(key, load, true) };
}
