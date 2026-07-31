import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, PublicAlbum } from '@invitaciones/api-client';
import { Alert, Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { PublicLayout } from '../PublicLayout';
import { publicErrorMessage } from '../errors/public-error-message';
import { safeHttpsUrl } from '../routing/public-content-path';
import { AlbumGallery } from './AlbumGallery';
import { safeThemeColor } from './album-state';

type AlbumState = { kind: 'loading' } | { kind: 'error'; operationId?: string } | { kind: 'ready'; album: PublicAlbum };

export function PublicAlbumPage({ apiClient }: { apiClient: ApiClient }) {
  const { albumToken = '' } = useParams();
  const [state, setState] = useState<AlbumState>({ kind: 'loading' });
  const load = useCallback(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void apiClient.publicAlbum.resolve(albumToken, controller.signal).then(
      (album) => setState({ kind: 'ready', album }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const display = publicErrorMessage(error, 'Este álbum no está disponible.');
        setState({ kind: 'error', ...(display.operationId ? { operationId: display.operationId } : {}) });
      }
    );
    return controller;
  }, [albumToken, apiClient]);
  useEffect(() => {
    const controller = load();
    return () => controller.abort();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <PublicLayout tone="dark">
        <Stack role="status" aria-label="Cargando álbum" spacing={3}>
          <Skeleton variant="text" width="65%" height={80} />
          <Skeleton variant="rounded" height={420} />
        </Stack>
      </PublicLayout>
    );
  }
  if (state.kind === 'error') {
    return (
      <PublicLayout tone="dark">
        <Stack spacing={3} sx={{ minHeight: '75svh', justifyContent: 'center', maxWidth: 620 }}>
          <Typography component="h1" variant="h1">
            Este álbum no está disponible.
          </Typography>
          <Alert severity="info">El enlace ya no puede mostrar este contenido.</Alert>
          {state.operationId ? <Typography variant="caption">Referencia: {state.operationId}</Typography> : null}
          <Button variant="outlined" color="inherit" onClick={() => load()}>
            Reintentar
          </Button>
        </Stack>
      </PublicLayout>
    );
  }
  const { album, event } = state.album;
  const backgroundColor = safeThemeColor(album.theme.backgroundColor, '#171713');
  const textColor = safeThemeColor(album.theme.textColor, '#F8F3E8');
  const accentColor = safeThemeColor(album.theme.accentColor, '#CBAE71');
  const external = album.externalButton && safeHttpsUrl(album.externalButton.url, albumToken);
  return (
    <Box
      sx={{
        bgcolor: backgroundColor,
        color: textColor,
        minHeight: '100svh',
        '--album-accent': accentColor,
        '& > div': { bgcolor: 'transparent', backgroundImage: 'none', color: textColor }
      }}
    >
      <PublicLayout tone="dark">
        <Stack spacing={{ xs: 5, md: 8 }}>
          <Box
            component="header"
            sx={{
              minHeight: '48svh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              maxWidth: 820
            }}
          >
            <Typography sx={{ color: accentColor, letterSpacing: '.16em', textTransform: 'uppercase' }}>
              {event.name}
            </Typography>
            <Typography component="h1" variant="h1" sx={{ mt: 2, fontFamily: 'Georgia, serif', color: textColor }}>
              {album.title}
            </Typography>
            {album.thankYouMessage ? (
              <Typography sx={{ mt: 2, maxWidth: 620, color: textColor, opacity: 0.78 }}>
                {album.thankYouMessage}
              </Typography>
            ) : null}
          </Box>
          <AlbumGallery apiClient={apiClient} token={albumToken} photos={album.photos} />
          {external && album.externalButton?.label ? (
            <Button
              component="a"
              href={external}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              variant="outlined"
              color="inherit"
              sx={{ width: 'fit-content' }}
            >
              {album.externalButton.label}
            </Button>
          ) : null}
        </Stack>
      </PublicLayout>
    </Box>
  );
}
