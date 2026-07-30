import { Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function AccessDeniedPage() {
  const auth = useAuth();
  return (
    <Stack
      component="main"
      spacing={2}
      sx={{ minHeight: '100svh', p: 4, justifyContent: 'center', alignItems: 'center' }}
    >
      <Typography component="h1" variant="h2">
        Acceso no permitido
      </Typography>
      <Typography color="text.secondary" sx={{ textAlign: 'center' }}>
        Tu cuenta no tiene acceso a esta sección.
      </Typography>
      {auth.status === 'authenticated' ? (
        <Button component={Link} to="/eventos" variant="contained">
          Ir a Eventos
        </Button>
      ) : (
        <Button onClick={() => void auth.logout()}>Cerrar sesión</Button>
      )}
    </Stack>
  );
}
