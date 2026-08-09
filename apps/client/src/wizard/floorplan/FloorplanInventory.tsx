import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import type { InventoryConfiguration, TableGeometry } from './floorplan-inventory';

const geometryLabels: Record<TableGeometry, string> = {
  CIRCLE: 'Redonda',
  RECTANGLE: 'Rectangular',
  SQUARE: 'Cuadrada'
};

const newConfiguration = (): InventoryConfiguration => ({
  id: globalThis.crypto.randomUUID(),
  geometry: 'CIRCLE',
  quantity: 1,
  capacity: 10
});

export function FloorplanInventory({
  disabled,
  maxTables = 200,
  onCreate
}: {
  disabled: boolean;
  maxTables?: number;
  onCreate: (configurations: readonly InventoryConfiguration[]) => void;
}) {
  const [configurations, setConfigurations] = useState<InventoryConfiguration[]>([newConfiguration()]);
  const total = useMemo(
    () => configurations.reduce((sum, configuration) => sum + Math.max(0, configuration.quantity), 0),
    [configurations]
  );
  const valid =
    total > 0 && total <= maxTables && configurations.every(({ quantity, capacity }) => quantity > 0 && capacity > 0);

  const update = (id: string, patch: Partial<InventoryConfiguration>) => {
    setConfigurations((current) =>
      current.map((configuration) => (configuration.id === id ? { ...configuration, ...patch } : configuration))
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }} component="section" aria-labelledby="inventory-title">
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography component="h3" variant="h4" id="inventory-title">
            Inventario de mesas
          </Typography>
          <Typography color="text.secondary">
            Prepara varias mesas y después colócalas en el plano. Los elementos pendientes permanecen en esta pantalla.
          </Typography>
        </Stack>

        {configurations.map((configuration, index) => (
          <Stack
            key={configuration.id}
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { md: 'center' } }}
          >
            <TextField
              select
              label="Forma"
              value={configuration.geometry}
              disabled={disabled}
              onChange={(event) => update(configuration.id, { geometry: event.target.value as TableGeometry })}
              sx={{ minWidth: 180 }}
            >
              {Object.entries(geometryLabels).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Cantidad"
              type="number"
              value={configuration.quantity}
              disabled={disabled}
              slotProps={{ htmlInput: { min: 1, max: 200, step: 1 } }}
              onChange={(event) => update(configuration.id, { quantity: Number(event.target.value) })}
              sx={{ width: { md: 150 } }}
            />
            <TextField
              label="Número de lugares"
              type="number"
              value={configuration.capacity}
              disabled={disabled}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              onChange={(event) => update(configuration.id, { capacity: Number(event.target.value) })}
              sx={{ width: { md: 190 } }}
            />
            <IconButton
              aria-label={`Eliminar configuración ${index + 1}`}
              disabled={disabled || configurations.length === 1}
              onClick={() => setConfigurations((current) => current.filter((item) => item.id !== configuration.id))}
              sx={{ minWidth: 44, minHeight: 44 }}
            >
              <DeleteOutlineRounded />
            </IconButton>
          </Stack>
        ))}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          <Button
            variant="outlined"
            startIcon={<AddRounded />}
            disabled={disabled || total >= maxTables}
            onClick={() => setConfigurations((current) => [...current, newConfiguration()])}
            sx={{ minHeight: 44 }}
          >
            Agregar configuración
          </Button>
          <Button
            variant="contained"
            disabled={disabled || !valid}
            onClick={() => onCreate(configurations)}
            sx={{ minHeight: 44 }}
          >
            Crear inventario de {total} {total === 1 ? 'mesa' : 'mesas'}
          </Button>
          <Typography variant="body2" color={total > maxTables ? 'error' : 'text.secondary'} aria-live="polite">
            Puedes agregar hasta {maxTables} {maxTables === 1 ? 'mesa' : 'mesas'} pendientes.
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}
