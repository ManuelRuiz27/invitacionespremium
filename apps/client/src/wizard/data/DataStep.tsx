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
import { useEffect, useMemo, useState } from 'react';
import { serviceLabels, socialTypeLabels } from '../../shared/formatters';
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
  const [editingWallClock, setEditingWallClock] = useState(false);
  useEffect(() => {
    if (!editingWallClock && !pendingZone) setWallClock(instantToWallClock(draft.eventDateTime, zone));
  }, [draft.eventDateTime, editingWallClock, pendingZone, zone]);
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
            {serviceLabels[service.code]} · {service.credits} créditos
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Nombre del evento"
        helperText="Ej. Boda de Ana y Carlos"
        value={draft.name ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ name: e.target.value || null })}
      />
      <TextField
        select
        label="Tipo de evento"
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
            {socialTypeLabels[value as NonNullable<UpdateEventInput['socialType']>]}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        type="datetime-local"
        label="Fecha y hora"
        value={wallClock}
        disabled={disabled}
        error={Boolean(dateError)}
        helperText={dateError ?? `Hora local de ${timeZoneLabel(zone)}`}
        slotProps={{ inputLabel: { shrink: true } }}
        onFocus={() => setEditingWallClock(true)}
        onBlur={() => setEditingWallClock(false)}
        onChange={(e) => commitDate(e.target.value)}
      />
      <TextField
        select
        label="Zona horaria"
        value={zone}
        disabled={disabled}
        onChange={(e) => setPendingZone(e.target.value)}
      >
        {zones.map((item) => (
          <MenuItem key={item} value={item}>
            {timeZoneLabel(item)}
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
        label="Ubicación"
        helperText="Pega el enlace de Google Maps o la ubicación del evento."
        value={draft.locationUrl ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ locationUrl: e.target.value || null })}
      />
      <TextField
        type="url"
        label="Mesa de regalos"
        helperText="Pega el enlace de la mesa de regalos."
        value={draft.giftRegistryUrl ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ giftRegistryUrl: e.target.value || null })}
      />
      {dateError ? <Alert severity="error">{dateError}</Alert> : null}
      <Dialog open={Boolean(pendingZone)} onClose={() => setPendingZone(undefined)} aria-labelledby="zone-title">
        <DialogTitle id="zone-title">Cambiar zona horaria</DialogTitle>
        <DialogContent>
          La hora escrita se conservará para {pendingZone ? timeZoneLabel(pendingZone) : ''}. Confirma este cambio.
          {dateError ? <Alert severity="error">{dateError}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingZone(undefined)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              const next = pendingZone;
              if (!next) return;
              try {
                const eventDateTime = wallClock ? wallClockToInstant(wallClock, next) : null;
                onChange({ timeZone: next, eventDateTime });
                setDateError(undefined);
                setPendingZone(undefined);
              } catch (error) {
                setDateError(error instanceof Error ? error.message : 'Fecha inválida.');
              }
            }}
          >
            Cambiar zona
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

const knownTimeZones: Record<string, string> = {
  'America/Mexico_City': 'Ciudad de México',
  'America/Cancun': 'Cancún',
  'America/Tijuana': 'Tijuana',
  UTC: 'Tiempo universal (UTC)'
};

function timeZoneLabel(value: string): string {
  return knownTimeZones[value] ?? value.split('/').at(-1)?.replaceAll('_', ' ') ?? value;
}
