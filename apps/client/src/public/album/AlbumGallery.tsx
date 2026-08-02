import { useEffect, useMemo, useState } from 'react';
import type { ApiClient, PublicAlbumPhoto as Photo } from '@invitaciones/api-client';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { AlbumPhoto, LoadedPhoto } from './AlbumPhoto';
import { PublicPhotoPool } from './photo-pool';
import { useReducedMotion } from '../useReducedMotion';

export function AlbumGallery({ apiClient, token, photos }: { apiClient: ApiClient; token: string; photos: Photo[] }) {
  const ordered = [...photos].sort((a, b) => a.position - b.position).slice(0, 35);
  const pool = useMemo(() => new PublicPhotoPool(8), [token]);
  const [selected, setSelected] = useState<number | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    setSelected(null);
    return () => pool.dispose();
  }, [pool]);
  const go = (next: number) => setSelected(Math.max(0, Math.min(ordered.length - 1, next)));
  const photo = selected === null ? undefined : ordered[selected];
  return (
    <>
      <Stack component="section" aria-labelledby="gallery-title" spacing={2}>
        <Typography id="gallery-title" component="h2" variant="h2">
          Recuerdos
        </Typography>
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}
        >
          {ordered.map((item, index) => (
            <AlbumPhoto
              key={item.id}
              apiClient={apiClient}
              token={token}
              photo={item}
              pool={pool}
              onOpen={() => setSelected(index)}
            />
          ))}
        </div>
      </Stack>
      <Dialog
        open={Boolean(photo)}
        onClose={() => setSelected(null)}
        fullScreen
        aria-labelledby="photo-title"
        transitionDuration={reducedMotion ? 0 : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' && selected !== null) go(selected - 1);
          if (event.key === 'ArrowRight' && selected !== null) go(selected + 1);
        }}
      >
        <DialogTitle id="photo-title">
          Foto {selected === null ? 0 : selected + 1} de {ordered.length}
        </DialogTitle>
        <DialogContent
          onTouchStart={(event) => setTouchX(event.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={(event) => {
            const end = event.changedTouches[0]?.clientX;
            if (selected !== null && touchX !== null && end !== undefined && Math.abs(end - touchX) > 40)
              go(selected + (end < touchX ? 1 : -1));
            setTouchX(null);
          }}
          sx={{ display: 'grid', placeItems: 'center', bgcolor: '#111' }}
        >
          {photo ? <LoadedPhoto apiClient={apiClient} token={token} photo={photo} pool={pool} preview /> : null}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button disabled={selected === 0} onClick={() => selected !== null && go(selected - 1)}>
            Anterior
          </Button>
          <Button variant="contained" onClick={() => setSelected(null)}>
            Cerrar
          </Button>
          <Button disabled={selected === ordered.length - 1} onClick={() => selected !== null && go(selected + 1)}>
            Siguiente
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
