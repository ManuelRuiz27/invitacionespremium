import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, PublicAlbum } from '@invitaciones/api-client';
import { Alert, Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { PublicLayout } from '../PublicLayout';
import { publicErrorMessage } from '../errors/public-error-message';
import { isAbortError, usePublicOperationScope } from '../operations/usePublicOperationScope';
import { safeHttpsUrl } from '../routing/public-content-path';
import { AlbumGallery } from './AlbumGallery';
import { safeThemeColor } from './album-state';

type AlbumState =
  | { kind: 'loading'; token: string }
  | { kind: 'error'; token: string; operationId?: string }
  | { kind: 'ready'; token: string; album: PublicAlbum };

export function PublicAlbumPage({ apiClient }: { apiClient: ApiClient }) {
  const { albumToken = '' } = useParams();
  return <PublicAlbumTokenPage key={albumToken} apiClient={apiClient} albumToken={albumToken} />;
}

function PublicAlbumTokenPage({ apiClient, albumToken }: { apiClient: ApiClient; albumToken: string }) {
  const [state, setState] = useState<AlbumState>({ kind: 'loading', token: albumToken });
  const scope = usePublicOperationScope(albumToken);
  const load = useCallback(
    (showLoading = true) => {
      const operation = scope.begin('resolve');
      if (showLoading) setState({ kind: 'loading', token: albumToken });
      void apiClient.publicAlbum
        .resolve(albumToken, operation.signal)
        .then(
          (album) => {
            if (operation.isCurrent()) setState({ kind: 'ready', token: albumToken, album });
          },
          (error: unknown) => {
            if (!operation.isCurrent() || isAbortError(error)) return;
            const display = publicErrorMessage(error, 'Este álbum no está disponible.');
            setState({
              kind: 'error',
              token: albumToken,
              ...(display.operationId ? { operationId: display.operationId } : {})
            });
          }
        )
        .finally(operation.finish);
    },
    [albumToken, apiClient, scope]
  );
  useEffect(() => {
    load();
    return scope.abortAll;
  }, [load, scope]);

  if (state.token !== albumToken || state.kind === 'loading') {
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
          <Button variant="outlined" color="inherit" onClick={() => load(false)}>
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
          <AlbumGallery key={albumToken} apiClient={apiClient} token={albumToken} photos={album.photos} />
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
