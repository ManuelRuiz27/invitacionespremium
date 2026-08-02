import { useCallback, useState } from 'react';
import type { ApiClient } from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import { usePublicSvgUrl } from '../assets/usePublicSvgUrl';
import { useReducedMotion } from '../useReducedMotion';

export function PublicQrDialog({
  apiClient,
  token,
  onClose
}: {
  apiClient: ApiClient;
  token: string;
  onClose: () => void;
}) {
  const [fullScreen, setFullScreen] = useState(false);
  const reducedMotion = useReducedMotion();
  const load = useCallback((signal: AbortSignal) => apiClient.publicInvitation.qr(token, signal), [apiClient, token]);
  const qr = usePublicSvgUrl(load, `qr:${token}`);
  return (
    <Dialog
      open
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby="qr-title"
      transitionDuration={reducedMotion ? 0 : undefined}
    >
      <DialogTitle id="qr-title">Mi acceso al evento</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          {qr.loading ? <Typography role="status">Preparando QR…</Typography> : null}
          {qr.error ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" onClick={qr.retry}>
                  Reintentar
                </Button>
              }
            >
              No pudimos preparar el QR.
            </Alert>
          ) : null}
          {qr.url ? (
            <Box
              component="img"
              src={qr.url}
              alt="Código QR de acceso"
              sx={{ width: 'min(82vw, 520px)', aspectRatio: '1', bgcolor: '#fff' }}
            />
          ) : null}
          <Typography sx={{ maxWidth: 460, textAlign: 'center' }}>
            El día del evento, muestra este QR en la entrada del salón.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setFullScreen((value) => !value)}>
          {fullScreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        </Button>
        <Button variant="contained" onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
