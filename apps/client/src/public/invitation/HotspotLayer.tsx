import type { PublicInvitationView } from '@invitaciones/api-client';
import { Box, Button } from '@mui/material';
import { safeHttpsUrl } from '../routing/public-content-path';

type Hotspot = NonNullable<PublicInvitationView['design']>['hotspots'][number];

const labels = {
  RSVP: 'Confirmar asistencia',
  LOCATION: 'Ver ubicación',
  GIFT_REGISTRY: 'Mesa de regalos',
  QR_AREA: 'Mostrar QR',
  EXTERNAL_LINK: 'Abrir enlace'
} as const;

interface HotspotLayerProps {
  hotspots: Hotspot[];
  onRsvp: () => void;
  onQr: () => void;
  onUnavailableQr: () => void;
  qrAvailable: boolean;
}

export function HotspotLayer({ hotspots, onRsvp, onQr, onUnavailableQr, qrAvailable }: HotspotLayerProps) {
  return (
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[...hotspots]
        .sort((a, b) => a.priority - b.priority)
        .map((hotspot) => {
          const href = safeHttpsUrl(hotspot.destination);
          const common = {
            'aria-label': labels[hotspot.action],
            sx: {
              position: 'absolute',
              left: `${hotspot.x * 100}%`,
              top: `${hotspot.y * 100}%`,
              width: `${hotspot.width * 100}%`,
              height: `${hotspot.height * 100}%`,
              minWidth: 44,
              minHeight: 44,
              p: 0,
              pointerEvents: 'auto',
              color: '#fff',
              bgcolor: 'rgba(17,17,15,.36)',
              border: '1px solid rgba(255,255,255,.42)',
              fontSize: { xs: '.68rem', sm: '.78rem' },
              lineHeight: 1.1,
              '&:hover, &:focus-visible': {
                color: '#fff',
                bgcolor: 'rgba(17,17,15,.72)',
                borderColor: 'rgba(255,255,255,.7)'
              }
            }
          } as const;
          if (['LOCATION', 'GIFT_REGISTRY', 'EXTERNAL_LINK'].includes(hotspot.action)) {
            return href ? (
              <Button
                key={hotspot.id}
                component="a"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                {...common}
              >
                {labels[hotspot.action]}
              </Button>
            ) : null;
          }
          return (
            <Button
              key={hotspot.id}
              onClick={hotspot.action === 'RSVP' ? onRsvp : qrAvailable ? onQr : onUnavailableQr}
              {...common}
            >
              {labels[hotspot.action]}
            </Button>
          );
        })}
    </Box>
  );
}
