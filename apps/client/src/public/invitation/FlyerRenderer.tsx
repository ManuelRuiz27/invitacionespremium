import { useCallback } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { Box, CircularProgress, Typography } from '@mui/material';
import { usePublicAssetUrl } from '../assets/usePublicAssetUrl';
import { invitationAssetIdFromPath } from '../routing/public-content-path';
import { HotspotLayer } from './HotspotLayer';

type Asset = NonNullable<NonNullable<PublicInvitationView['design']>['flyerInitialAsset']>;

export function PublicAssetImage({
  apiClient,
  token,
  asset,
  alt,
  eager = false
}: {
  apiClient: ApiClient;
  token: string;
  asset: Asset;
  alt: string;
  eager?: boolean;
}) {
  const assetId = invitationAssetIdFromPath(asset.contentPath, token);
  const load = useCallback(
    (signal: AbortSignal) =>
      assetId ? apiClient.publicInvitation.asset(token, assetId, signal) : Promise.reject(new Error('invalid path')),
    [apiClient, assetId, token]
  );
  const state = usePublicAssetUrl(load, `${token.length}:${asset.id}`);
  if (state.loading) return <CircularProgress aria-label="Cargando imagen" size={28} sx={{ m: 6 }} />;
  if (state.error || !state.url) return <Typography sx={{ p: 4 }}>No pudimos cargar este contenido.</Typography>;
  return (
    <Box
      component="img"
      src={state.url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      sx={{ width: '100%', height: 'auto', display: 'block' }}
    />
  );
}

export function FlyerRenderer({
  apiClient,
  token,
  view,
  onRsvp,
  onQr,
  onUnavailableQr
}: {
  apiClient: ApiClient;
  token: string;
  view: PublicInvitationView;
  onRsvp: () => void;
  onQr: () => void;
  onUnavailableQr: () => void;
}) {
  const design = view.design;
  if (!design?.flyerInitialAsset) return <Typography>No pudimos cargar este contenido.</Typography>;
  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: { xs: 0, sm: 1 },
          boxShadow: '0 24px 80px rgba(30,23,12,.18)'
        }}
      >
        <PublicAssetImage
          apiClient={apiClient}
          token={token}
          asset={design.flyerInitialAsset}
          alt="Diseño de la invitación"
          eager
        />
        <HotspotLayer
          hotspots={design.hotspots.filter((hotspot) => hotspot.visualOwnerType === 'FLYER')}
          onRsvp={onRsvp}
          onQr={onQr}
          onUnavailableQr={onUnavailableQr}
          qrAvailable={view.qr?.available === true}
        />
      </Box>
      {design.flyerQrAsset ? (
        <Box sx={{ maxWidth: 540, mx: 'auto', overflow: 'hidden', borderRadius: 1 }}>
          <PublicAssetImage
            apiClient={apiClient}
            token={token}
            asset={design.flyerQrAsset}
            alt="Detalle visual de la invitación"
          />
        </Box>
      ) : null}
    </Box>
  );
}
