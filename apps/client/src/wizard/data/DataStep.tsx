import {
  ApiError,
  type ApiClient,
  type AvailableService,
  type Event,
  type UpdateEventInput
} from '@invitaciones/api-client';
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
import { priceRuleForCapacity, serviceLabels, socialTypeLabels } from '../../shared/formatters';
import { instantToWallClock, supportedTimeZones, wallClockToInstant } from './timezone';
import { errorMessage } from '../wizard-utils';

export function DataStep({
  services,
  draft,
  disabled,
  onChange,
  apiClient,
  event,
  onResetInvitationDesign
}: {
  services: AvailableService[];
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (patch: Partial<UpdateEventInput>) => void;
  apiClient?: ApiClient;
  event?: Event | undefined;
  onResetInvitationDesign?: (serviceId: string) => Promise<void>;
}) {
  const zones = useMemo(supportedTimeZones, []);
  const zone = draft.timeZone ?? 'America/Mexico_City';
  const [wallClock, setWallClock] = useState(() => instantToWallClock(draft.eventDateTime, zone));
  const [dateError, setDateError] = useState<string>();
  const [pendingZone, setPendingZone] = useState<string>();
  const [editingWallClock, setEditingWallClock] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState<string>();
  const [failedServiceId, setFailedServiceId] = useState<string>();
  const [serviceBusy, setServiceBusy] = useState(false);
  const [serviceError, setServiceError] = useState<string>();
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
  const chooseService = async (serviceId: string) => {
    const current = services.find((service) => service.id === draft.serviceId);
    const target = services.find((service) => service.id === serviceId);
    const changesDigitalType =
      current &&
      target &&
      current.code !== target.code &&
      (current.code === 'FLYER' || current.code === 'FLIPBOOK') &&
      (target.code === 'FLYER' || target.code === 'FLIPBOOK');
    setServiceError(undefined);
    setFailedServiceId(undefined);
    if (!changesDigitalType || !event || !apiClient) {
      onChange({ serviceId: serviceId || null });
      return;
    }
    setServiceBusy(true);
    try {
      const design = await apiClient.design.get(event.id);
      if (design.type === target.code) onChange({ serviceId });
      else setPendingServiceId(serviceId);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'INVITATION_DESIGN_NOT_FOUND') {
        onChange({ serviceId });
      } else {
        setFailedServiceId(serviceId);
        setServiceError(errorMessage(reason));
      }
    } finally {
      setServiceBusy(false);
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
        disabled={disabled || serviceBusy}
        onChange={(e) => void chooseService(e.target.value)}
      >
        {services.map((service) => {
          const price = priceRuleForCapacity(service, draft.capacity);
          return (
            <MenuItem key={service.id} value={service.id}>
              {serviceLabels[service.code]} · {price ? `${price.credits} créditos` : 'precio según capacidad'}
            </MenuItem>
          );
        })}
      </TextField>
      {serviceError ? (
        <Alert
          severity="error"
          action={
            failedServiceId ? (
              <Button color="inherit" disabled={serviceBusy} onClick={() => void chooseService(failedServiceId)}>
                Reintentar
              </Button>
            ) : undefined
          }
        >
          No pudimos verificar el diseño actual. Inténtalo nuevamente antes de cambiar de servicio.
        </Alert>
      ) : null}
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
      <Dialog
        open={Boolean(pendingServiceId)}
        onClose={serviceBusy ? undefined : () => setPendingServiceId(undefined)}
        aria-labelledby="service-change-title"
      >
        <DialogTitle id="service-change-title">Cambiar el formato de la invitación</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            <Typography>
              Para cambiar entre Flyer y Flipbook se reiniciará únicamente el diseño de la invitación actual.
            </Typography>
            <Typography color="text.secondary">
              Tus contactos, invitaciones, confirmaciones, mesas y demás configuración se conservarán.
            </Typography>
            {serviceError ? <Alert severity="error">{serviceError}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={serviceBusy} onClick={() => setPendingServiceId(undefined)}>
            Conservar servicio actual
          </Button>
          <Button
            variant="contained"
            disabled={serviceBusy || !onResetInvitationDesign}
            onClick={() => {
              const next = pendingServiceId;
              if (!next || !onResetInvitationDesign) return;
              setServiceBusy(true);
              setServiceError(undefined);
              void onResetInvitationDesign(next)
                .then(() => setPendingServiceId(undefined))
                .catch((reason) => setServiceError(errorMessage(reason)))
                .finally(() => setServiceBusy(false));
            }}
          >
            {serviceBusy ? 'Cambiando…' : 'Reiniciar diseño y cambiar'}
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
