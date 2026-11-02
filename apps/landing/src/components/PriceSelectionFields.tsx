import { Box, TextField } from '@mui/material';
import { capacityOptions, type PriceSelection } from '../commercial-selection';
import { getLandingConfig } from '../config/landing-config';

export function PriceSelectionFields({
  value,
  onChange,
  disabled = false
}: {
  value: PriceSelection;
  onChange: (value: PriceSelection) => void;
  disabled?: boolean;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
      <TextField
        select
        label="Servicio"
        value={value.sku}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, sku: event.target.value as PriceSelection['sku'] })}
        slotProps={{ select: { native: true } }}
      >
        {getLandingConfig().services.items.map((service) => (
          <option key={service.code} value={service.code}>
            {service.name}
          </option>
        ))}
      </TextField>
      <TextField
        select
        label="Capacidad del evento"
        value={value.capacityMax}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...value, capacityMax: Number(event.target.value) as PriceSelection['capacityMax'] })
        }
        slotProps={{ select: { native: true } }}
      >
        {capacityOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </TextField>
    </Box>
  );
}
