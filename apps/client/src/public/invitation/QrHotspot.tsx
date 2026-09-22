import { useCallback, useState } from 'react';
import type { ApiClient } from '@invitaciones/api-client';
import { Box, type SxProps, type Theme } from '@mui/material';
import { usePublicSvgUrl } from '../assets/usePublicSvgUrl';
import { useReducedMotion } from '../useReducedMotion';

export function QrHotspot({
  apiClient,
  token,
  available,
  disabled,
  onUnavailable,
  sx
}: {
  apiClient: ApiClient;
  token: string;
  available: boolean;
  disabled: boolean;
  onUnavailable: () => void;
  sx: SxProps<Theme>;
}) {
  const [halfTurns, setHalfTurns] = useState(0);
  const [retainFace, setRetainFace] = useState(false);
  const reducedMotion = useReducedMotion();
  const revealed = halfTurns % 2 === 1;

  return (
    <Box
      component="button"
      type="button"
      className="invitation-hotspot invitation-qr-hotspot"
      aria-label={revealed ? 'Ocultar QR' : 'Mostrar QR'}
      aria-pressed={revealed}
      disabled={disabled}
      sx={sx}
      onClick={() => {
        if (!available) {
          onUnavailable();
          return;
        }
        setRetainFace(!revealed || !reducedMotion);
        setHalfTurns((current) => current + 1);
      }}
    >
      <span
        className="invitation-qr-rotor"
        style={{ transform: `rotateY(${halfTurns * 180}deg)` }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'transform' && !revealed)
            setRetainFace(false);
        }}
      >
        <span className="invitation-qr-face" aria-hidden="true" />
        <span className="invitation-qr-face invitation-qr-back" aria-hidden={!revealed}>
          {retainFace ? <QrFace apiClient={apiClient} token={token} /> : null}
        </span>
      </span>
    </Box>
  );
}

function QrFace({ apiClient, token }: { apiClient: ApiClient; token: string }) {
  const load = useCallback((signal: AbortSignal) => apiClient.publicInvitation.qr(token, signal), [apiClient, token]);
  const qr = usePublicSvgUrl(load, `qr:${token}`);

  if (qr.loading)
    return (
      <span className="invitation-qr-status" role="status">
        Preparando QR…
      </span>
    );
  if (qr.error)
    return (
      <span className="invitation-qr-status" role="alert">
        No pudimos preparar el QR. Toca para cerrar y vuelve a abrirlo.
      </span>
    );
  return qr.url ? <img src={qr.url} alt="Código QR de acceso" draggable={false} /> : null;
}
