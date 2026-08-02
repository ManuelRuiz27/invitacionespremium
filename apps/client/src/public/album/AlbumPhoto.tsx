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
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: '240px' }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <Box ref={ref} sx={{ minHeight: 220 }}>
      {visible ? (
        <LoadedPhoto apiClient={apiClient} token={token} photo={photo} pool={pool} onOpen={onOpen} />
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
  preview = false
}: {
  apiClient: ApiClient;
  token: string;
  photo: Photo;
  pool: PublicPhotoPool;
  onOpen?: () => void;
  preview?: boolean;
}) {
  const photoId = albumPhotoIdFromPath(photo.contentPath, token);
  const load = useCallback(
    (signal: AbortSignal) =>
      photoId ? apiClient.publicAlbum.photo(token, photoId, signal) : Promise.reject(new Error('invalid path')),
    [apiClient, photoId, token]
  );
  const state = usePhotoPoolState(pool, `${token}:${photo.id}`, load);
  if (state.loading) return <Skeleton variant="rounded" height={preview ? 520 : 260} />;
  if (state.error || !state.url)
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
  load: (signal: AbortSignal) => Promise<Blob>
): PhotoPoolState & { retry: () => void } {
  const [state, setState] = useState<PhotoPoolState>({ url: null, loading: true, error: false });
  useEffect(() => {
    const unsubscribe = pool.subscribe(key, setState);
    pool.load(key, load);
    return unsubscribe;
  }, [key, load, pool]);
  return { ...state, retry: () => pool.load(key, load, true) };
}
