import { useEffect, useRef } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { useAdminAuth } from './AdminAuthProvider';

export function AdminAccessDeniedPage() {
  const auth = useAdminAuth();
  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ minHeight: '100svh', p: 4, justifyContent: 'center', alignItems: 'center' }}
    >
      <Typography component="h1" variant="h2" sx={{ textAlign: 'center' }}>
        Acceso administrativo no permitido
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 620, textAlign: 'center' }}>
        Este acceso es exclusivo para la administracion de la plataforma.
      </Typography>
      <Button variant="outlined" onClick={() => void auth.logout()}>
        Cerrar sesion
      </Button>
    </Stack>
  );
}

export function AdminSessionUnavailablePage() {
  const auth = useAdminAuth();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ minHeight: '100svh', p: 4, justifyContent: 'center', alignItems: 'center' }}
    >
      <Typography ref={heading} tabIndex={-1} component="h1" variant="h2" sx={{ outline: 0, textAlign: 'center' }}>
        No pudimos verificar la sesion administrativa
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 620, textAlign: 'center' }}>
        El servicio no esta disponible. Tu sesion no fue cerrada ni se asumira que expiro.
      </Typography>
      <Button variant="contained" onClick={() => void auth.restoreSession()}>
        Reintentar
      </Button>
    </Stack>
  );
}
