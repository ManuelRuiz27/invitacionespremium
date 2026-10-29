import type { AdminFloorplan } from '@invitaciones/api-client';
import { Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';

const mappingPresets = ['Mesa', 'Pista', 'DJ / escenario', 'Baños', 'Barra', 'Entrada', 'Zona'] as const;

export function AdminFloorplanSvgMappingInspector({
  mappingPreset,
  mappingName,
  mappingCapacity,
  seatingMode,
  readOnly,
  pending,
  refreshRequired,
  reconciliationError,
  onPresetChange,
  onNameChange,
  onCapacityChange,
  onSave,
  onCancel
}: {
  mappingPreset: string;
  mappingName: string;
  mappingCapacity: number;
  seatingMode: AdminFloorplan['seatingMode'];
  readOnly: boolean;
  pending: boolean;
  refreshRequired: boolean;
  reconciliationError: boolean;
  onPresetChange: (preset: string) => void;
  onNameChange: (name: string) => void;
  onCapacityChange: (capacity: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Paper component="section" variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography component="h3" variant="h6">
            Clasificar {mappingName.trim() || mappingPreset}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Nuevo elemento del plano
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Guarda o cancela antes de seleccionar otro elemento.
        </Typography>
        <TextField
          select
          label="Tipo de elemento"
          value={mappingPreset}
          disabled={readOnly}
          onChange={(event) => onPresetChange(event.target.value)}
        >
          {mappingPresets.map((preset) => (
            <MenuItem key={preset} value={preset}>
              {preset}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Nombre"
          required
          value={mappingName}
          disabled={readOnly}
          onChange={(event) => onNameChange(event.target.value)}
        />
        {mappingPreset === 'Mesa' && seatingMode === 'TABLE' ? (
          <TextField
            label="Número de lugares"
            required
            type="number"
            value={mappingCapacity}
            disabled={readOnly}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
            onChange={(event) => onCapacityChange(Number(event.target.value))}
          />
        ) : mappingPreset === 'Mesa' ? (
          <Typography variant="body2">La capacidad se calcula a partir de los lugares.</Typography>
        ) : null}
        <Button variant="contained" disabled={readOnly || refreshRequired || reconciliationError} onClick={onSave}>
          Guardar
        </Button>
        <Button disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </Stack>
    </Paper>
  );
}
