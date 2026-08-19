import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import { Box, Button, Divider, IconButton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
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
    <Box component="section" aria-labelledby="inventory-title" sx={{ minWidth: 0 }}>
      <Stack spacing={2}>
        <Box>
          <Typography
            component="p"
            variant="overline"
            sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '0.12em' }}
          >
            Mesas por colocar
          </Typography>
          <Typography component="h3" variant="h4" id="inventory-title">
            Prepara tus mesas
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Define tus tipos una vez y arrastra cada mesa al plano.
          </Typography>
        </Box>

        <Stack spacing={1.25}>
          {configurations.map((configuration, index) => (
            <Box
              key={configuration.id}
              sx={{
                p: 1.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'rgba(255, 254, 251, 0.82)',
                boxShadow: '0 8px 24px rgba(23, 35, 60, 0.055)'
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2">Tipo {index + 1}</Typography>
                  <IconButton
                    aria-label={`Eliminar configuración ${index + 1}`}
                    disabled={disabled || configurations.length === 1}
                    onClick={() =>
                      setConfigurations((current) => current.filter((item) => item.id !== configuration.id))
                    }
                    size="small"
                    sx={{ width: 44, height: 44 }}
                  >
                    <CloseRounded fontSize="small" />
                  </IconButton>
                </Stack>

                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={configuration.geometry}
                  disabled={disabled}
                  onChange={(_, value: TableGeometry | null) => {
                    if (value) update(configuration.id, { geometry: value });
                  }}
                  aria-label={`Forma de la configuración ${index + 1}`}
                  sx={{ gap: 0.75, '& .MuiToggleButtonGroup-grouped': { border: '1px solid !important' } }}
                >
                  {(Object.keys(geometryLabels) as TableGeometry[]).map((geometry) => (
                    <ToggleButton
                      key={geometry}
                      value={geometry}
                      aria-label={`${geometryLabels[geometry]} en configuración ${index + 1}`}
                      sx={{
                        minHeight: 64,
                        px: 0.5,
                        borderRadius: '12px !important',
                        borderColor: 'divider !important',
                        display: 'grid',
                        gap: 0.5,
                        color: 'text.secondary',
                        '&.Mui-selected': {
                          bgcolor: 'rgba(49, 87, 200, 0.09)',
                          color: 'primary.dark',
                          borderColor: 'primary.main !important'
                        }
                      }}
                    >
                      <GeometryMark geometry={geometry} />
                      <Typography component="span" variant="caption" sx={{ fontWeight: 700 }}>
                        {geometryLabels[geometry]}
                      </Typography>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                <Stack spacing={1}>
                  <MetricStepper
                    label="Cantidad"
                    value={configuration.quantity}
                    disabled={disabled}
                    min={1}
                    max={Math.max(1, maxTables)}
                    onChange={(quantity) => update(configuration.id, { quantity })}
                  />
                  <MetricStepper
                    label="Lugares"
                    accessibleLabel="Número de lugares"
                    value={configuration.capacity}
                    disabled={disabled}
                    min={1}
                    max={500}
                    onChange={(capacity) => update(configuration.id, { capacity })}
                  />
                </Stack>
              </Stack>
            </Box>
          ))}
        </Stack>

        <Button
          variant="text"
          startIcon={<AddRounded />}
          disabled={disabled || total >= maxTables}
          onClick={() => setConfigurations((current) => [...current, newConfiguration()])}
          sx={{ alignSelf: 'flex-start', px: 1 }}
        >
          Otro tipo de mesa
        </Button>

        <Divider />

        <Stack spacing={1}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="body2" color="text.secondary">
              Total preparado
            </Typography>
            <Typography variant="h4" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {total}
            </Typography>
          </Stack>
          <Button
            variant="contained"
            disabled={disabled || !valid}
            onClick={() => onCreate(configurations)}
            fullWidth
            sx={{ minHeight: 48, borderRadius: 3 }}
          >
            Crear {total} {total === 1 ? 'mesa' : 'mesas'}
          </Button>
          <Typography
            variant="caption"
            color={total > maxTables ? 'error' : 'text.secondary'}
            aria-live="polite"
            sx={{ textAlign: 'center' }}
          >
            Puedes agregar hasta {maxTables} {maxTables === 1 ? 'mesa' : 'mesas'} pendientes.
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

function GeometryMark({ geometry }: { geometry: TableGeometry }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: geometry === 'RECTANGLE' ? 30 : 24,
        height: 24,
        borderRadius: geometry === 'CIRCLE' ? '50%' : geometry === 'RECTANGLE' ? 1.5 : 1,
        border: '2px solid currentColor',
        bgcolor: 'rgba(49, 87, 200, 0.06)'
      }}
    />
  );
}

function MetricStepper({
  label,
  accessibleLabel = label,
  value,
  disabled,
  min,
  max,
  onChange
}: {
  label: string;
  accessibleLabel?: string;
  value: number;
  disabled: boolean;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="body2" sx={{ fontWeight: 650 }}>
        {label}
      </Typography>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 999, p: 0.25 }}
      >
        <IconButton
          aria-label={`Reducir ${accessibleLabel.toLocaleLowerCase('es-MX')}`}
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          size="small"
          sx={{ width: 44, height: 44 }}
        >
          <RemoveRounded fontSize="small" />
        </IconButton>
        <Typography
          component="output"
          aria-label={accessibleLabel}
          sx={{ minWidth: 38, textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </Typography>
        <IconButton
          aria-label={`Aumentar ${accessibleLabel.toLocaleLowerCase('es-MX')}`}
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          size="small"
          sx={{ width: 44, height: 44 }}
        >
          <AddRounded fontSize="small" />
        </IconButton>
      </Stack>
    </Stack>
  );
}
