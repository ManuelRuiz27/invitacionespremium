import { useEffect, useRef } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { useAuth } from './AuthProvider';

export function SessionUnavailablePage() {
  const auth = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ minHeight: '100svh', p: 4, justifyContent: 'center', alignItems: 'center' }}
    >
      <Typography
        ref={headingRef}
        component="h1"
        variant="h2"
        tabIndex={-1}
        sx={{ outline: 'none', textAlign: 'center' }}
      >
        No pudimos verificar tu sesión
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 540, textAlign: 'center' }}>
        El servicio no está disponible o tu conexión fue interrumpida. Intenta nuevamente.
      </Typography>
      <Button
        variant="contained"
        onClick={() => {
          void auth.restoreSession();
        }}
      >
        Reintentar
      </Button>
    </Stack>
  );
}
