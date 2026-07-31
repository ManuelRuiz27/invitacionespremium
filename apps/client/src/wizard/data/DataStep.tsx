import type { AvailableService, UpdateEventInput } from '@invitaciones/api-client';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useMemo, useState } from 'react';
import { instantToWallClock, supportedTimeZones, wallClockToInstant } from './timezone';

export function DataStep({
  services,
  draft,
  disabled,
  onChange
}: {
  services: AvailableService[];
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (patch: Partial<UpdateEventInput>) => void;
}) {
  const zones = useMemo(supportedTimeZones, []);
  const zone = draft.timeZone ?? 'America/Mexico_City';
  const [wallClock, setWallClock] = useState(() => instantToWallClock(draft.eventDateTime, zone));
  const [dateError, setDateError] = useState<string>();
  const [pendingZone, setPendingZone] = useState<string>();
  const commitDate = (value: string, targetZone = zone) => {
    setWallClock(value);
    if (!value) {
      setDateError(undefined);
      onChange({ eventDateTime: null });
      return;
    }
    try {
      onChange({ eventDateTime: wallClockToInstant(value, targetZone) });
      setDateError(undefined);
    } catch (error) {
      setDateError(error instanceof Error ? error.message : 'Fecha inválida.');
    }
  };
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Datos del Evento
      </Typography>
      <TextField
        select
        required
        label="Servicio"
        value={draft.serviceId ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ serviceId: e.target.value || null })}
      >
        {services.map((service) => (
          <MenuItem key={service.id} value={service.id}>
            {service.code} · {service.credits} créditos
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Nombre"
        value={draft.name ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ name: e.target.value || null })}
      />
      <TextField
        select
        label="Tipo social"
        value={draft.socialType ?? ''}
        disabled={disabled}
        onChange={(e) =>
          onChange({
            socialType: (e.target.value || null) as NonNullable<UpdateEventInput['socialType']> | null
          })
        }
      >
        <MenuItem value="">Sin definir</MenuItem>
        {['WEDDING', 'QUINCEANERA', 'CORPORATE', 'BIRTHDAY', 'OTHER'].map((value) => (
          <MenuItem key={value} value={value}>
            {value}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="datetime-local"
        label="Fecha y hora del Evento"
        value={wallClock}
        disabled={disabled}
        error={Boolean(dateError)}
        helperText={dateError ?? `Hora local en ${zone}`}
        slotProps={{ inputLabel: { shrink: true } }}
        onChange={(e) => commitDate(e.target.value)}
      />
      <TextField
        select
        label="Zona horaria IANA"
        value={zone}
        disabled={disabled}
        onChange={(e) => setPendingZone(e.target.value)}
      >
        {zones.map((item) => (
          <MenuItem key={item} value={item}>
            {item}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="number"
        label="Capacidad"
        value={draft.capacity ?? ''}
        disabled={disabled}
        slotProps={{ htmlInput: { min: 1 } }}
        onChange={(e) => onChange({ capacity: e.target.value ? Number(e.target.value) : null })}
      />
      <TextField
        type="url"
        label="Ubicación (HTTPS)"
        value={draft.locationUrl ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ locationUrl: e.target.value || null })}
      />
      <TextField
        type="url"
        label="Mesa de regalos (HTTPS)"
        value={draft.giftRegistryUrl ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ giftRegistryUrl: e.target.value || null })}
      />
      {dateError ? <Alert severity="error">{dateError}</Alert> : null}
      <Dialog open={Boolean(pendingZone)} onClose={() => setPendingZone(undefined)} aria-labelledby="zone-title">
        <DialogTitle id="zone-title">Cambiar zona horaria</DialogTitle>
        <DialogContent>
          La hora escrita se conservará y se reinterpretará en {pendingZone}. Confirma este cambio.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingZone(undefined)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              const next = pendingZone;
              if (!next) return;
              onChange({ timeZone: next });
              commitDate(wallClock, next);
              setPendingZone(undefined);
            }}
          >
            Cambiar zona
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
