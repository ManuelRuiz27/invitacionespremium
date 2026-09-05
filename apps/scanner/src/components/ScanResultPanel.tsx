import type { ScannerInvitationResult, ScannerScanResponse } from '@invitaciones/api-client';
import { Alert, Box, Button, Checkbox, FormControlLabel, FormGroup, Stack, Typography } from '@mui/material';

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
}

export function ScanResultPanel({
  scanResult,
  onCheckIn,
  onCancel,
  selectedIds,
  onSelectionChange,
  isLoading = false,
  errorMessage
}: ScanResultPanelProps) {
  if (scanResult.status === 'NO_PENDING') {
    return (
      <Stack spacing={2}>
        <Alert severity="info">Todos los Asistentes confirmados de esta Invitación ya ingresaron.</Alert>
        <Button variant="contained" size="large" onClick={onCancel}>
          Siguiente escaneo
        </Button>
      </Stack>
    );
  }

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((candidate) => candidate !== id) : [...selectedIds, id]
    );
  };

  return (
    <Box component="section" aria-labelledby="scanner-result-title">
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
            sx={{ minHeight: 52, borderBottom: 1, borderColor: 'divider' }}
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
        <Button variant="outlined" size="large" onClick={onCancel} disabled={isLoading} fullWidth>
          Cancelar
        </Button>
        <Button
          variant="contained"
          size="large"
          onClick={() => onCheckIn(selectedIds)}
          disabled={selectedIds.length === 0 || isLoading}
          fullWidth
        >
          {isLoading ? 'Registrando…' : `Registrar ingreso (${selectedIds.length})`}
        </Button>
      </Stack>
    </Box>
  );
}
