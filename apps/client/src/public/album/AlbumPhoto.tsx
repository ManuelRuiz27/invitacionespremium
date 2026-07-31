import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient, PublicAlbumPhoto as Photo } from '@invitaciones/api-client';
import { Box, Button, Skeleton, Typography } from '@mui/material';
import { usePublicAssetUrl } from '../assets/usePublicAssetUrl';
import { albumPhotoIdFromPath } from '../routing/public-content-path';

export function AlbumPhoto({
  apiClient,
  token,
  photo,
  onOpen
}: {
  apiClient: ApiClient;
  token: string;
  photo: Photo;
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
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px' }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <Box ref={ref} sx={{ minHeight: 220 }}>
      {visible ? (
        <LoadedPhoto apiClient={apiClient} token={token} photo={photo} onOpen={onOpen} />
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
  onOpen,
  preview = false
}: {
  apiClient: ApiClient;
  token: string;
  photo: Photo;
  onOpen?: () => void;
  preview?: boolean;
}) {
  const photoId = albumPhotoIdFromPath(photo.contentPath, token);
  const load = useCallback(
    (signal: AbortSignal) =>
      photoId ? apiClient.publicAlbum.photo(token, photoId, signal) : Promise.reject(new Error('invalid path')),
    [apiClient, photoId, token]
  );
  const state = usePublicAssetUrl(load, `${token.length}:${photo.id}`);
  if (state.loading) return <Skeleton variant="rounded" height={preview ? 520 : 260} />;
  if (state.error || !state.url) return <Typography sx={{ p: 3 }}>No pudimos cargar este contenido.</Typography>;
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
