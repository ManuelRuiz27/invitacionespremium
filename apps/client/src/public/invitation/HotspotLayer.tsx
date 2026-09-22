import type { SyntheticEvent } from 'react';
import type { ApiClient, PublicInvitationView } from '@invitaciones/api-client';
import { Box } from '@mui/material';
import { relativeRectStyles } from '../../shared/relative-rect';
import { safeHttpsUrl } from '../routing/public-content-path';
import { QrHotspot } from './QrHotspot';
import './HotspotLayer.css';

type Hotspot = NonNullable<PublicInvitationView['design']>['hotspots'][number];

const labels = {
  RSVP: 'Confirmar asistencia',
  LOCATION: 'Ver ubicación',
  GIFT_REGISTRY: 'Mesa de regalos',
  QR_AREA: 'Mostrar QR',
  EXTERNAL_LINK: 'Abrir enlace'
} as const;

interface HotspotLayerProps {
  apiClient: ApiClient;
  token: string;
  hotspots: Hotspot[];
  onRsvp: () => void;
  onUnavailableQr: () => void;
  qrAvailable: boolean;
  rsvpConfirmed?: boolean;
  disabled?: boolean;
}

export function HotspotLayer({
  apiClient,
  token,
  hotspots,
  onRsvp,
  onUnavailableQr,
  qrAvailable,
  rsvpConfirmed = false,
  disabled = false
}: HotspotLayerProps) {
  const preventDisabledNavigation = (event: SyntheticEvent) => {
    if (!disabled) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <Box aria-hidden={disabled || undefined} sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {[...hotspots]
        .sort((a, b) => a.priority - b.priority)
        .map((hotspot) => {
          const href = safeHttpsUrl(hotspot.destination);
          const common = {
            'aria-label':
              hotspot.action === 'RSVP' && rsvpConfirmed ? 'Modificar acompañantes' : labels[hotspot.action],
            className: 'invitation-hotspot',
            sx: {
              position: 'absolute',
              ...relativeRectStyles(hotspot),
              minWidth: 44,
              minHeight: 44,
              pointerEvents: disabled ? 'none' : 'auto'
            }
          } as const;
          if (['LOCATION', 'GIFT_REGISTRY', 'EXTERNAL_LINK'].includes(hotspot.action)) {
            return href ? (
              <Box
                key={hotspot.id}
                component="a"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : undefined}
                onClick={preventDisabledNavigation}
                onKeyDown={preventDisabledNavigation}
                {...common}
              />
            ) : null;
          }
          if (hotspot.action === 'QR_AREA') {
            return (
              <QrHotspot
                key={`${hotspot.id}:${token}:${qrAvailable}`}
                apiClient={apiClient}
                token={token}
                available={qrAvailable}
                disabled={disabled}
                onUnavailable={onUnavailableQr}
                sx={common.sx}
              />
            );
          }
          return (
            <Box component="button" type="button" key={hotspot.id} disabled={disabled} onClick={onRsvp} {...common} />
          );
        })}
    </Box>
  );
}
