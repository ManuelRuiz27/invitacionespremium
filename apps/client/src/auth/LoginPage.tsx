import { useState, type FormEvent } from 'react';
import { ApiError } from '@invitaciones/api-client';
import { AppThemeProvider, LoadingState } from '@invitaciones/ui';
import { Alert, Box, Button, Container, Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AccessDeniedPage } from './AccessDeniedPage';
import { safeReturnTo, useAuth } from './AuthProvider';
import { SessionUnavailablePage } from './SessionUnavailablePage';

export function LoginPage({ landingUrl }: { landingUrl: string }) {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (auth.status === 'loading') return <LoadingState label="Restaurando tu sesión…" />;
  if (auth.status === 'redirecting') return <LoadingState label="Redirigiendo…" />;
  if (auth.status === 'authenticated') {
    return <Navigate to={safeReturnTo(searchParams.get('returnTo'))} replace />;
  }
  if (auth.status === 'forbidden') return <AccessDeniedPage />;
  if (auth.status === 'unavailable') return <SessionUnavailablePage />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmailError = /^\S+@\S+\.\S+$/.test(email) ? '' : 'Ingresa un correo electrónico válido.';
    const nextPasswordError = password ? '' : 'Ingresa tu contraseña.';
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError('');
    if (nextEmailError || nextPasswordError) return;

    setSubmitting(true);
    try {
      await auth.login({ email, password }, searchParams.get('returnTo') ?? undefined);
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'Correo o contraseña incorrectos.'
          : 'No pudimos iniciar sesión. Revisa tu conexión e inténtalo nuevamente.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppThemeProvider>
      <Box component="main" sx={{ minHeight: '100svh', display: 'grid', alignItems: 'center', py: 5 }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.1fr) minmax(380px, 0.9fr)' },
              gap: { xs: 5, md: 10 },
              alignItems: 'center'
            }}
          >
            <Stack spacing={2.5} sx={{ maxWidth: 600 }}>
              <Typography component="p" variant="h3" color="primary.main">
                InvitacionesPremium
              </Typography>
              <Typography component="h1" variant="h1">
                Tus Eventos, en un solo lugar.
              </Typography>
              <Typography color="text.secondary" sx={{ maxWidth: 480, fontSize: '1.08rem' }}>
                Consulta el estado de tus Eventos y la información financiera autorizada para tu cuenta.
              </Typography>
            </Stack>

            <Paper elevation={1} sx={{ p: { xs: 3, sm: 5 }, border: 1, borderColor: 'divider' }}>
              <Stack component="form" spacing={3} onSubmit={(event) => void submit(event)} noValidate>
                <Box>
                  <Typography component="h2" variant="h2">
                    Iniciar sesión
                  </Typography>
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Usa el acceso asignado a tu cuenta.
                  </Typography>
                </Box>
                {formError ? (
                  <Alert severity="error" role="alert">
                    {formError}
                  </Alert>
                ) : null}
                <TextField
                  label="Correo electrónico"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  error={Boolean(emailError)}
                  helperText={emailError}
                  required
                  fullWidth
                />
                <TextField
                  label="Contraseña"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={Boolean(passwordError)}
                  helperText={passwordError}
                  required
                  fullWidth
                />
                <Button type="submit" variant="contained" size="large" disabled={submitting}>
                  {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
                </Button>
                <MuiLink href={landingUrl} color="text.secondary" sx={{ textAlign: 'center' }}>
                  Volver al sitio
                </MuiLink>
              </Stack>
            </Paper>
          </Box>
        </Container>
      </Box>
    </AppThemeProvider>
  );
}
