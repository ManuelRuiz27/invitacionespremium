import type { ScannerInvitationResult, ScannerScanResponse } from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  FormGroup,
  Stack,
  Typography
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import HowToRegRounded from '@mui/icons-material/HowToRegRounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';

export type ScannerOperationalResult =
  ScannerScanResponse | (ScannerInvitationResult & { status: 'AVAILABLE' | 'NO_PENDING' });

export interface ScanResultPanelProps {
  scanResult: ScannerOperationalResult;
  onCheckIn: (assistantIds: string[]) => void;
  onCancel: () => void;
  selectedIds: string[];
  onSelectionChange: (assistantIds: string[]) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  floorplanSlot?: React.ReactNode;
}

export function ScanResultPanel({
  scanResult,
  onCheckIn,
  onCancel,
  selectedIds,
  onSelectionChange,
  isLoading = false,
  errorMessage,
  floorplanSlot
}: ScanResultPanelProps) {
  if (scanResult.status === 'NO_PENDING') {
    return (
      <Box
        component="section"
        sx={{
          animation: 'scannerResultFadeIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          '@keyframes scannerResultFadeIn': {
            '0%': { opacity: 0, transform: 'translateY(16px)' },
            '100%': { opacity: 1, transform: 'translateY(0)' }
          }
        }}
      >
        <Stack spacing={2}>
          <Alert severity="info">Todos los Asistentes confirmados de esta Invitación ya ingresaron.</Alert>
          {floorplanSlot}
          <Button
            variant="contained"
            size="large"
            onClick={onCancel}
            startIcon={<QrCodeScannerRounded />}
            sx={{ minHeight: 48, borderRadius: 2 }}
          >
            Siguiente escaneo
          </Button>
        </Stack>
      </Box>
    );
  }

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((candidate) => candidate !== id) : [...selectedIds, id]
    );
  };

  return (
    <Box
      component="section"
      aria-labelledby="scanner-result-title"
      sx={{
        animation: 'scannerResultSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        '@keyframes scannerResultSlideIn': {
          '0%': { opacity: 0, transform: 'translateY(24px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        }
      }}
    >
      {/* Acción rápida para regresar al scanner */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Button
          variant="outlined"
          size="medium"
          startIcon={<ArrowBackRounded />}
          onClick={onCancel}
          disabled={isLoading}
          sx={{ minHeight: 40, borderRadius: 999, px: 2, fontWeight: 600 }}
        >
          Volver al Scanner
        </Button>
        <Chip
          icon={<QrCodeScannerRounded />}
          label="Invitación escaneada"
          size="small"
          color="primary"
          variant="outlined"
        />
      </Box>

      <Card variant="outlined" sx={{ borderRadius: 3, mb: 2, boxShadow: (theme) => theme.shadows[1] }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography id="scanner-result-title" variant="h2">
            Asistentes pendientes
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {scanResult.invitation.mode === 'INDIVIDUAL' ? 'Invitación individual' : 'Invitación familiar nominal'} ·{' '}
            {scanResult.pendingCount} pendiente(s)
          </Typography>
          <FormGroup sx={{ mb: 2 }}>
            {scanResult.pendingAssistants.map((assistant) => (
              <FormControlLabel
                key={assistant.id}
                control={
                  <Checkbox
                    checked={selectedIds.includes(assistant.id)}
                    onChange={() => toggle(assistant.id)}
                    size="large"
                  />
                }
                label={`${assistant.name}${assistant.table ? ` · Mesa ${assistant.table.name}` : ''}${assistant.seat ? ` · Lugar ${assistant.seat.label}` : ''}`}
                sx={{
                  minHeight: 52,
                  py: 0.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:last-child': { borderBottom: 'none' }
                }}
              />
            ))}
          </FormGroup>
          {errorMessage ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
          ) : null}
          {selectedIds.length === 0 ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Selecciona al menos un Asistente.
            </Alert>
          ) : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="outlined"
              size="large"
              onClick={onCancel}
              disabled={isLoading}
              fullWidth
              sx={{ minHeight: 48, borderRadius: 2 }}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              size="large"
              startIcon={<HowToRegRounded />}
              onClick={() => onCheckIn(selectedIds)}
              disabled={selectedIds.length === 0 || isLoading}
              fullWidth
              sx={{ minHeight: 48, borderRadius: 2 }}
            >
              {isLoading ? 'Registrando…' : `Registrar ingreso (${selectedIds.length})`}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Croquis con el lugar o mesa asignada al invitado */}
      {floorplanSlot ? (
        <Box sx={{ mt: 2.5 }}>
          {floorplanSlot}
        </Box>
      ) : null}
    </Box>
  );
}
