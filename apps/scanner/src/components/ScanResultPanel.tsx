import { useState } from 'react';
import { Box, Typography, Button, FormGroup, FormControlLabel, Checkbox, Alert } from '@mui/material';

export interface ScannerScanResponseDto {
  status: 'AVAILABLE' | 'NO_PENDING';
  invitation: { id: string; name?: string; guestName?: string };
  pendingAssistants: { id: string; name: string }[];
  checkedInCount: number;
  confirmedCount: number;
  pendingCount: number;
}

export interface ScanResultPanelProps {
  scanResult: ScannerScanResponseDto;
  onCheckIn: (assistantIds: string[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ScanResultPanel({ scanResult, onCheckIn, onCancel, isLoading }: ScanResultPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    scanResult.pendingAssistants?.map((a: { id: string }) => a.id) || []
  );

  if (scanResult.status === 'NO_PENDING') {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Todos los asistentes de esta invitación ({scanResult.invitation?.name || scanResult.invitation?.guestName}) ya ingresaron.
        </Alert>
        <Button variant="contained" fullWidth size="large" onClick={onCancel}>
          Cerrar
        </Button>
      </Box>
    );
  }

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    if (selectedIds.length > 0) {
      onCheckIn(selectedIds);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Invitación: {scanResult.invitation?.name || scanResult.invitation?.guestName}
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Selecciona quién ingresa ahora:
      </Typography>

      <FormGroup sx={{ mb: 3 }}>
        {scanResult.pendingAssistants?.map((assistant: { id: string, name: string }) => (
          <FormControlLabel
            key={assistant.id}
            control={
              <Checkbox
                checked={selectedIds.includes(assistant.id)}
                onChange={() => handleToggle(assistant.id)}
                size="large"
              />
            }
            label={assistant.name}
            sx={{
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              '& .MuiTypography-root': { fontSize: '1.2rem' } // Alto contraste/mobile
            }}
          />
        ))}
      </FormGroup>

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button 
          variant="outlined" 
          fullWidth 
          size="large" 
          onClick={onCancel}
          disabled={isLoading}
          sx={{ py: 2 }}
        >
          Cancelar
        </Button>
        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={handleConfirm}
          disabled={selectedIds.length === 0 || isLoading}
          sx={{ py: 2 }}
        >
          {isLoading ? 'Registrando...' : `Ingresan (${selectedIds.length})`}
        </Button>
      </Box>
    </Box>
  );
}
