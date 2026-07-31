import { Button, Stack, Typography } from '@mui/material';
import { PublicLayout } from './PublicLayout';

export function PublicNotFoundPage() {
  return (
    <PublicLayout>
      <Stack spacing={2} sx={{ minHeight: '75svh', justifyContent: 'center', alignItems: 'flex-start', maxWidth: 560 }}>
        <Typography component="p" color="primary.main" sx={{ letterSpacing: '.16em', textTransform: 'uppercase' }}>
          404
        </Typography>
        <Typography component="h1" variant="h1">
          Esta página no está disponible.
        </Typography>
        <Typography color="text.secondary">Revisa el enlace e inténtalo nuevamente.</Typography>
        <Button href="/" variant="outlined">
          Ir al inicio
        </Button>
      </Stack>
    </PublicLayout>
  );
}
