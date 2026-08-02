import { useState } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { Box, Button, Stack, Typography } from '@mui/material';
import { HotspotLayer } from './HotspotLayer';
import { PublicAssetImage } from './FlyerRenderer';
import { useReducedMotion } from '../useReducedMotion';

export function FlipbookRenderer({
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
  const pages = [...(view.design?.pages ?? [])].sort((a, b) => a.position - b.position);
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();
  const go = (next: number) => setIndex(Math.max(0, Math.min(pages.length - 1, next)));
  const page = pages[index];
  if (!page) return <Typography>No pudimos cargar este contenido.</Typography>;
  const hotspots = (view.design?.hotspots ?? []).filter((hotspot) => hotspot.flipbookPageId === page.id);
  return (
    <Box
      tabIndex={0}
      aria-label="Invitación en páginas"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(index - 1);
        if (event.key === 'ArrowRight') go(index + 1);
      }}
      onTouchStart={(event) => setTouchX(event.changedTouches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 40) go(index + (end < touchX ? 1 : -1));
        setTouchX(null);
      }}
      sx={{ outline: 'none' }}
    >
      <Box
        sx={{
          position: 'relative',
          maxWidth: 780,
          mx: 'auto',
          overflow: 'hidden',
          bgcolor: '#fff',
          boxShadow: '0 28px 90px rgba(30,23,12,.2)',
          transition: reducedMotion ? 'none' : 'opacity .22s ease'
        }}
      >
        <PublicAssetImage
          apiClient={apiClient}
          token={token}
          asset={page.asset}
          alt={`Página ${index + 1} de la invitación`}
          eager
        />
        <HotspotLayer
          hotspots={hotspots}
          onRsvp={onRsvp}
          onQr={onQr}
          onUnavailableQr={onUnavailableQr}
          qrAvailable={view.qr?.available === true}
        />
      </Box>
      <Box aria-hidden="true" sx={{ display: 'none' }}>
        {pages[index - 1] ? (
          <PublicAssetImage apiClient={apiClient} token={token} asset={pages[index - 1]!.asset} alt="" />
        ) : null}
        {pages[index + 1] ? (
          <PublicAssetImage apiClient={apiClient} token={token} asset={pages[index + 1]!.asset} alt="" />
        ) : null}
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 2, justifyContent: 'center', alignItems: 'center' }}>
        <Button disabled={index === 0} onClick={() => go(index - 1)}>
          Anterior
        </Button>
        <Typography aria-live="polite">
          Página {index + 1} de {pages.length}
        </Typography>
        <Button disabled={index === pages.length - 1} onClick={() => go(index + 1)}>
          Siguiente
        </Button>
      </Stack>
    </Box>
  );
}
