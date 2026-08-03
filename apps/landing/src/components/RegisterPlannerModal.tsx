import { landingContent } from '../landing-content';
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
import { useState, type FormEvent } from 'react';

export interface RegisterPlannerModalProps {
  open: boolean;
  onClose: () => void;
}

export function RegisterPlannerModal({ open, onClose }: RegisterPlannerModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setError(null);
    setSuccess(false);
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (!email.includes('@') || email.trim().length < 5) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }
    if (password.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(landingContent.urls.registerPlannerApi, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password
        })
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(errorData?.message || 'Error al registrar la cuenta. Verifica los datos prestados.');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    window.location.href = landingContent.urls.login;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth aria-labelledby="register-planner-dialog-title">
      <DialogTitle id="register-planner-dialog-title" sx={{ m: 0, p: 2.5, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon color="primary" />
            <Typography variant="h3" component="span" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
              Registro de Planner
            </Typography>
          </Box>
          <IconButton aria-label="Cerrar ventana" onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5, pt: 1 }}>
        {success ? (
          <Stack spacing={2} sx={{ py: 1 }}>
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              ¡Registro exitoso! Tu cuenta de Planner independiente ha sido creada correctamente.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Ahora puedes iniciar sesión en el panel del cliente para comenzar a administrar tus Eventos.
            </Typography>
            <Button
              variant="contained"
              fullWidth
              size="large"
              onClick={handleGoToLogin}
              sx={{ mt: 1, minHeight: 48, fontWeight: 700 }}
            >
              Ir a Iniciar Sesión
            </Button>
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit} noValidate sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Registro exclusivo para Planners independientes. Acceso inmediato a la plataforma.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <Stack spacing={2}>
              <TextField
                required
                fullWidth
                id="planner-name"
                label="Nombre o Firma del Planner"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                placeholder="Ej. Sofía Martínez Planners"
                slotProps={{ htmlInput: { maxLength: 160 } }}
              />

              <TextField
                required
                fullWidth
                id="planner-email"
                label="Correo Electrónico"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="correo@ejemplo.com"
                slotProps={{ htmlInput: { maxLength: 320 } }}
              />

              <TextField
                required
                fullWidth
                id="planner-password"
                label="Contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                helperText="Mínimo 12 caracteres"
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
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Crear Cuenta de Planner'}
              </Button>
            </Stack>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
