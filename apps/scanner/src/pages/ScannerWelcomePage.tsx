import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Card, CardContent, Container, Stack, TextField, Typography } from '@mui/material';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { BrandLockup, StatusChip } from '@invitaciones/ui';

export function ScannerWelcomePage() {
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleStart = (token?: string) => {
    const raw = (token ?? tokenInput).trim();
    if (!raw) {
      setError('Ingresa el token o URL de Staff asignado.');
      return;
    }
    // Si pegan una URL completa tipo http://localhost:5175/scanner/st1.xxx o /scanner/st1.xxx
    const match = raw.match(/\/scanner\/([a-zA-Z0-9._-]+)/);
    const cleanedToken = match ? match[1] : raw;
    navigate(`/scanner/${cleanedToken}`);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
      {/* Brand Header */}
      <Box
        component="header"
        sx={{
          py: 1.5,
          px: { xs: 2, sm: 3 },
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: { xs: 3, sm: 5 }
        }}
      >
        <BrandLockup size="small" />
        <StatusChip label="Control de Acceso" tone="neutral" />
      </Box>

      <Container maxWidth="xs">
        <Stack spacing={3.5} sx={{ textAlign: 'center', alignItems: 'center' }}>
          {/* Icon Badge */}
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              bgcolor: 'action.selected',
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: (theme) => theme.shadows[1]
            }}
          >
            <QrCodeScannerRounded sx={{ fontSize: 32 }} />
          </Box>

          <Stack spacing={1}>
            <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.1rem' } }}>
              Control de Acceso
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, mx: 'auto', lineHeight: 1.5 }}>
              Microaplicación de escaneo y check-in para el staff de recepción del evento.
            </Typography>
          </Stack>

          <Card
            variant="outlined"
            sx={{
              width: '100%',
              borderRadius: 3,
              boxShadow: (theme) => theme.shadows[1],
              textAlign: 'left'
            }}
          >
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Ingreso con enlace o token Staff
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Escanea el código QR que te compartió el organizador desde tu cámara o ingresa tu token a
                  continuación:
                </Typography>

                <TextField
                  fullWidth
                  size="small"
                  label="Token o Enlace Staff"
                  placeholder="st1.ejemplo..."
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleStart();
                  }}
                  error={Boolean(error)}
                  helperText={error}
                />

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  endIcon={<ArrowForwardRounded />}
                  onClick={() => handleStart()}
                  sx={{ minHeight: 46 }}
                >
                  Acceder a la sesión
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {/* Instrucciones breves */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', textAlign: 'left', px: 1 }}>
            <ShieldOutlined sx={{ fontSize: 20, color: 'text.secondary', mt: 0.25 }} />
            <Typography variant="caption" color="text.secondary">
              Cada sesión Staff es exclusiva y valida el acceso en tiempo real contra la base de datos del evento.
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
