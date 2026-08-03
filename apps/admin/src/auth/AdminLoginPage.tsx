import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@invitaciones/api-client';
import { LoadingState } from '@invitaciones/ui';
import { Alert, Box, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AdminAccessDeniedPage, AdminSessionUnavailablePage } from './AdminSessionStatePages';
import { safeAdminReturnTo } from './admin-session';
import { useAdminAuth } from './AdminAuthProvider';

export function AdminLoginPage() {
  const auth = useAdminAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  if (auth.status === 'loading') return <LoadingState label="Verificando sesion administrativa..." />;
  if (auth.status === 'authenticated') return <Navigate to={safeAdminReturnTo(searchParams.get('returnTo'))} replace />;
  if (auth.status === 'forbidden') return <AdminAccessDeniedPage />;
  if (auth.status === 'unavailable') return <AdminSessionUnavailablePage />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
      setError('Ingresa correo y contrasena validos.');
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      await auth.login({ email, password }, searchParams.get('returnTo') ?? undefined);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? 'Correo o contrasena incorrectos.'
          : 'No pudimos iniciar sesion. Intenta nuevamente sin cerrar esta pantalla.'
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{ minHeight: '100svh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' } }}
    >
      <Box
        sx={{
          bgcolor: '#102B33',
          color: 'common.white',
          p: { xs: 4, sm: 7, lg: 10 },
          display: 'flex',
          alignItems: 'flex-end'
        }}
      >
        <Stack spacing={2} sx={{ maxWidth: 620, pb: { md: 8 } }}>
          <Typography sx={{ color: '#D3B66F', fontWeight: 760, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            InvitacionesPremium
          </Typography>
          <Typography component="h1" variant="h1" sx={{ color: 'inherit', maxWidth: 560 }}>
            Control de plataforma, sin intermediarios.
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.72)', maxWidth: 480 }}>
            Clientes, Eventos y finanzas desde una superficie administrativa exclusiva.
          </Typography>
        </Stack>
      </Box>
      <Container maxWidth="sm" sx={{ display: 'grid', alignItems: 'center', py: 5 }}>
        <Paper elevation={0} sx={{ p: { xs: 3, sm: 5 }, border: 1, borderColor: 'divider' }}>
          <Stack component="form" spacing={3} onSubmit={(event) => void submit(event)} noValidate>
            <Box>
              <Typography component="h2" variant="h2">
                Administracion
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Acceso exclusivo para Platform Admin.
              </Typography>
            </Box>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Correo electronico"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <TextField
              label="Contrasena"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" variant="contained" size="large" disabled={submitting}>
              {submitting ? 'Verificando...' : 'Entrar al panel'}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
