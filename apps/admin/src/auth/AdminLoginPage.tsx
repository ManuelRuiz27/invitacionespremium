import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@invitaciones/api-client';
import { BrandLockup, LoadingState, designTokens } from '@invitaciones/ui';
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

  if (auth.status === 'loading') return <LoadingState label="Verificando sesión administrativa..." />;
  if (auth.status === 'authenticated') return <Navigate to={safeAdminReturnTo(searchParams.get('returnTo'))} replace />;
  if (auth.status === 'forbidden') return <AdminAccessDeniedPage />;
  if (auth.status === 'unavailable') return <AdminSessionUnavailablePage />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) {
      setError('Ingresa correo y contraseña válidos.');
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
          ? 'Correo o contraseña incorrectos.'
          : 'No pudimos iniciar sesión. Intenta nuevamente sin cerrar esta pantalla.'
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100svh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
        bgcolor: 'background.default'
      }}
    >
      <Box
        sx={{
          bgcolor: designTokens.colors.ink,
          color: designTokens.colors.canvas,
          p: { xs: 4, sm: 7, lg: 10 },
          display: 'flex',
          alignItems: 'flex-end',
          borderRight: 1,
          borderColor: 'rgba(245, 242, 236, 0.12)'
        }}
      >
        <Stack spacing={3} sx={{ maxWidth: 620, pb: { md: 8 } }}>
          <Box sx={{ mb: 1 }}>
            <BrandLockup size="large" tone="light" />
          </Box>
          <Typography
            component="h1"
            variant="h1"
            sx={{
              fontFamily: (theme) => theme.typography.h1.fontFamily,
              color: designTokens.colors.canvas,
              maxWidth: 560,
              fontSize: { xs: '2.4rem', md: '3.4rem' },
              lineHeight: 1.15
            }}
          >
            Control de plataforma, sin intermediarios.
          </Typography>
          <Typography
            sx={{
              color: 'rgba(245, 242, 236, 0.72)',
              maxWidth: 480,
              fontSize: '1.05rem',
              lineHeight: 1.6
            }}
          >
            Clientes, eventos y finanzas desde una superficie administrativa exclusiva.
          </Typography>
        </Stack>
      </Box>
      <Container maxWidth="sm" sx={{ display: 'grid', alignItems: 'center', py: 5 }}>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 5 },
            border: 1,
            borderColor: 'divider',
            borderRadius: `${designTokens.radius.medium}px`,
            bgcolor: 'background.paper'
          }}
        >
          <Stack component="form" spacing={3} onSubmit={(event) => void submit(event)} noValidate>
            <Box>
              <Typography component="h2" variant="h2" sx={{ fontSize: '2rem' }}>
                Administración
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Acceso exclusivo para Platform Admin.
              </Typography>
            </Box>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Correo electrónico"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <TextField
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={submitting}
              sx={{
                minHeight: 46,
                fontSize: '0.95rem',
                borderRadius: `${designTokens.radius.small}px`
              }}
            >
              {submitting ? 'Verificando...' : 'Entrar al panel'}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
