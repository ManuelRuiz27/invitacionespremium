import { getLandingConfig } from '../config/landing-config';
import { createLandingRegistrationClient, type PlannerRegistrationClient } from '../registration-client';
import { ApiError, type RegisterPlannerInput } from '@invitaciones/api-client';
import CloseIcon from '@mui/icons-material/Close';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

const landingContent = getLandingConfig();

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

export interface RegisterPlannerModalProps {
  open: boolean;
  onClose: () => void;
  registrationClient?: PlannerRegistrationClient;
}

export function RegisterPlannerModal({ open, onClose, registrationClient }: RegisterPlannerModalProps) {
  const client = useMemo(() => registrationClient ?? createLandingRegistrationClient(), [registrationClient]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(false);
  const openRef = useRef(open);
  const submittingRef = useRef(false);
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const passwordRef = useRef('');

  openRef.current = open;

  const invalidateAttempt = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    submittingRef.current = false;
  }, []);

  const resetForm = useCallback(() => {
    passwordRef.current = '';
    setName('');
    setEmail('');
    setPassword('');
    setFieldErrors({});
    setRequestError(null);
    setSuccess(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      passwordRef.current = '';
      invalidateAttempt();
    };
  }, [invalidateAttempt]);

  useEffect(() => {
    if (!open) {
      invalidateAttempt();
      resetForm();
    }
  }, [invalidateAttempt, open, resetForm]);

  const handleClose = () => {
    invalidateAttempt();
    resetForm();
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const parsed = parseRegistrationInput({ name, email, password });
    setFieldErrors(parsed.errors);
    setRequestError(null);
    if (!parsed.input) return;
    if (!client) {
      setRequestError('El registro no está disponible temporalmente. Inténtalo más tarde.');
      return;
    }

    submittingRef.current = true;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);

    try {
      await client.registerPlanner(parsed.input, controller.signal);
      if (!ownsAttempt(generation, controller)) return;
      passwordRef.current = '';
      setPassword('');
      setName('');
      setEmail('');
      setSuccess(true);
    } catch (error) {
      if (!ownsAttempt(generation, controller) || isAbortError(error)) return;
      setRequestError(translateRegistrationError(error));
    } finally {
      if (ownsAttempt(generation, controller)) {
        controllerRef.current = null;
        submittingRef.current = false;
        setLoading(false);
      }
    }
  };

  const ownsAttempt = (generation: number, controller: AbortController) =>
    mountedRef.current &&
    openRef.current &&
    generationRef.current === generation &&
    controllerRef.current === controller &&
    !controller.signal.aborted;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth aria-labelledby="register-planner-dialog-title">
      <DialogTitle id="register-planner-dialog-title" sx={{ m: 0, p: 2.5, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon color="primary" />
            <Typography variant="h3" component="span" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {landingContent.registration.title}
            </Typography>
          </Box>
          <IconButton aria-label="Cerrar registro" onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5, pt: 1 }}>
        {success ? (
          <Stack spacing={2} sx={{ py: 1 }} aria-live="polite">
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              {landingContent.registration.success}
            </Alert>
            <Button
              variant="contained"
              fullWidth
              size="large"
              href={landingContent.urls.login}
              disabled={!landingContent.urls.login}
              sx={{ mt: 1, minHeight: 48, fontWeight: 700 }}
            >
              Ir a iniciar sesión
            </Button>
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {landingContent.registration.intro}
            </Typography>

            <Box aria-live="polite">
              {requestError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                  {requestError}
                </Alert>
              )}
            </Box>

            <Stack spacing={2}>
              <TextField
                required
                autoFocus
                autoComplete="name"
                fullWidth
                id="planner-name"
                label="Nombre del Planner"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={loading}
                error={Boolean(fieldErrors.name)}
                helperText={fieldErrors.name}
                slotProps={{ htmlInput: { minLength: 2, maxLength: 160 } }}
              />

              <TextField
                required
                autoComplete="email"
                fullWidth
                id="planner-email"
                label="Correo electrónico"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading}
                error={Boolean(fieldErrors.email)}
                helperText={fieldErrors.email}
                slotProps={{ htmlInput: { maxLength: 320 } }}
              />

              <TextField
                required
                autoComplete="new-password"
                fullWidth
                id="planner-password"
                label="Contraseña"
                type="password"
                value={password}
                onChange={(event) => {
                  passwordRef.current = event.target.value;
                  setPassword(event.target.value);
                }}
                disabled={loading}
                error={Boolean(fieldErrors.password)}
                helperText={fieldErrors.password ?? 'Entre 12 y 1024 caracteres, sin espacios al inicio o al final.'}
                slotProps={{ htmlInput: { minLength: 12, maxLength: 1024 } }}
              />

              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={loading}
                sx={{ mt: 1, minHeight: 48, fontWeight: 700 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" aria-label="Creando cuenta" /> : 'Crear cuenta'}
              </Button>
            </Stack>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function parseRegistrationInput(values: RegisterPlannerInput): {
  input?: RegisterPlannerInput;
  errors: FieldErrors;
} {
  const name = values.name.trim();
  const email = values.email.trim();
  const errors: FieldErrors = {};

  if (name.length < 2 || name.length > 160) errors.name = 'El nombre debe tener entre 2 y 160 caracteres.';
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Ingresa un correo electrónico válido de hasta 320 caracteres.';
  }
  if (values.password.length < 12 || values.password.length > 1024) {
    errors.password = 'La contraseña debe tener entre 12 y 1024 caracteres.';
  } else if (values.password.trim() !== values.password) {
    errors.password = 'La contraseña no debe tener espacios al inicio o al final.';
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { input: { name, email, password: values.password }, errors };
}

export function translateRegistrationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'UNEXPECTED_API_RESPONSE') return 'Recibimos una respuesta inesperada. Inténtalo más tarde.';
    if (error.status === 400 || error.status === 422) return 'Revisa los datos e inténtalo de nuevo.';
    if (error.status === 409) return 'Ya existe una cuenta asociada a ese correo.';
    if (error.status === 429) return 'Hubo demasiados intentos. Vuelve a intentarlo más tarde.';
    if (error.status >= 500) return 'El servicio no está disponible temporalmente. Inténtalo más tarde.';
  }
  if (error instanceof TypeError)
    return 'No fue posible conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.';
  return 'No fue posible crear la cuenta. Inténtalo más tarde.';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}
