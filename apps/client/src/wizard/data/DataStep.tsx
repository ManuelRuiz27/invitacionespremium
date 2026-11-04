import {
  ApiError,
  type ApiClient,
  type AvailableService,
  type Event,
  type UpdateEventInput
} from '@invitaciones/api-client';
import {
  Alert,
  Box,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  IconButton,
  Tabs,
  Tab
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import CelebrationOutlined from '@mui/icons-material/CelebrationOutlined';
import FavoriteBorder from '@mui/icons-material/FavoriteBorder';
import CakeOutlined from '@mui/icons-material/CakeOutlined';
import BusinessCenterOutlined from '@mui/icons-material/BusinessCenterOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import CardGiftcardOutlined from '@mui/icons-material/CardGiftcardOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Add from '@mui/icons-material/Add';
import ClearOutlined from '@mui/icons-material/ClearOutlined';
import { DataBlock } from './DataBlock';
import { EventCalendar } from './EventCalendar';
import { EventCountdown } from './EventCountdown';
import { EventLocation } from './EventLocation';
import { giftProvider, mapEmbedHref, previewHref } from './event-link-preview';
import type { SaveState } from '../wizard-model';
import { priceRuleForCapacity, serviceLabels, socialTypeLabels } from '../../shared/formatters';
import { instantToWallClock, supportedTimeZones, wallClockToInstant } from './timezone';
import { errorMessage } from '../../shared/client-utils';
import type { EventFieldErrors } from './event-field-errors';

export function DataStep({
  services,
  draft,
  disabled,
  onChange,
  apiClient,
  event,
  confirmedDraft,
  fieldErrors = {},
  saveState = 'idle',
  onPendingDateChange,
  onResetInvitationDesign
}: {
  services: AvailableService[];
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (patch: Partial<UpdateEventInput>) => void;
  apiClient?: ApiClient;
  event?: Event | undefined;
  confirmedDraft?: UpdateEventInput | undefined;
  fieldErrors?: EventFieldErrors;
  saveState?: SaveState;
  onPendingDateChange?: (pending: boolean) => void;
  onResetInvitationDesign?: (serviceId: string) => Promise<void>;
}) {
  const zones = useMemo(supportedTimeZones, []);
  const desktop = useMediaQuery('(min-width:1200px) and (min-height:1100px)');
  const compactNavigation = useMediaQuery('(max-width:1199px), (max-height:799px)');
  const [activeSection, setActiveSection] = useState('celebration');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [giftEditing, setGiftEditing] = useState(false);
  const zone = draft.timeZone ?? 'America/Mexico_City';
  const [wallClock, setWallClock] = useState(() => instantToWallClock(draft.eventDateTime, zone));
  const localInstant = useRef(draft.eventDateTime);
  const localZone = useRef(zone);
  const [dateError, setDateError] = useState<string>();
  const [pendingZone, setPendingZone] = useState<string>();
  const [zoneError, setZoneError] = useState<string>();
  const [editingWallClock, setEditingWallClock] = useState(false);
  const [pendingServiceId, setPendingServiceId] = useState<string>();
  const [failedServiceId, setFailedServiceId] = useState<string>();
  const [serviceBusy, setServiceBusy] = useState(false);
  const [serviceError, setServiceError] = useState<string>();
  useEffect(() => {
    if (
      !editingWallClock &&
      !pendingZone &&
      (draft.eventDateTime !== localInstant.current || zone !== localZone.current)
    ) {
      setWallClock(instantToWallClock(draft.eventDateTime, zone));
      localInstant.current = draft.eventDateTime;
      localZone.current = zone;
      setDateError(undefined);
    }
  }, [draft.eventDateTime, editingWallClock, pendingZone, zone]);
  const commitDate = (value: string, targetZone = zone) => {
    setWallClock(value);
    if (!value) {
      setDateError(undefined);
      localInstant.current = null;
      onChange({ eventDateTime: null });
      return;
    }
    try {
      const eventDateTime = wallClockToInstant(value, targetZone);
      localInstant.current = eventDateTime;
      onChange({ eventDateTime });
      setDateError(undefined);
    } catch (error) {
      setDateError(error instanceof Error ? error.message : 'Fecha inválida.');
    }
  };
  const selectedDate = wallClock.split('T')[0] ?? '';
  const selectedTime = wallClock.split('T')[1] ?? '';
  const pendingDate =
    !disabled && Boolean(selectedDate || selectedTime) && wallClock !== instantToWallClock(draft.eventDateTime, zone);
  useEffect(() => {
    onPendingDateChange?.(pendingDate);
  }, [onPendingDateChange, pendingDate]);
  const today = instantToWallClock(new Date().toISOString(), zone).slice(0, 10);
  const chooseDateTime = (date: string, time: string) => {
    if (date && time) commitDate(`${date}T${time}`);
    else {
      setWallClock(`${date}T${time}`);
      setDateError(undefined);
    }
  };
  const locationHref = fieldErrors.locationUrl ? null : previewHref(draft.locationUrl);
  const giftHref = fieldErrors.giftRegistryUrl ? null : previewHref(draft.giftRegistryUrl);
  const locationError =
    fieldErrors.locationUrl ??
    (draft.locationUrl && !locationHref
      ? 'Revisa el enlace de ubicación. Pega un enlace web seguro y completo.'
      : undefined);
  const giftError =
    fieldErrors.giftRegistryUrl ??
    (draft.giftRegistryUrl && !giftHref
      ? 'Revisa el enlace de la mesa de regalos. Pega un enlace web seguro y completo.'
      : undefined);
  const mapHref = mapEmbedHref(locationHref, import.meta.env.VITE_GOOGLE_MAPS_EMBED_API_KEY);
  useEffect(() => {
    if (!compactNavigation) return;
    if (fieldErrors.name || fieldErrors.socialType || fieldErrors.serviceId || fieldErrors.capacity)
      setActiveSection('celebration');
    else if (fieldErrors.eventDateTime || fieldErrors.timeZone) setActiveSection('event-date');
    else if (fieldErrors.locationUrl) setActiveSection('event-location');
    else if (fieldErrors.giftRegistryUrl) setActiveSection('event-gifts');
  }, [compactNavigation, fieldErrors]);
  const blockProps = { draft, event, confirmedDraft, saveState };
  const calendar = (
    <EventCalendar
      value={selectedDate}
      today={today}
      disabled={disabled}
      onChange={(date) => {
        chooseDateTime(date, selectedTime);
        setCalendarOpen(false);
      }}
    />
  );
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
    <Stack component="section" aria-label="Datos del evento" spacing={1.5} sx={{ minWidth: 0 }}>
      {compactNavigation ? (
        <Tabs
          value={activeSection}
          variant="fullWidth"
          sx={{ '& .MuiTab-root': { minWidth: 0, px: 0.5, minHeight: 44, fontSize: '.75rem' } }}
          aria-label="Secciones de datos del evento"
          onChange={(_, value: string) => setActiveSection(value)}
        >
          <Tab id="data-tab-celebration" aria-controls="celebration-panel" value="celebration" label="Celebración" />
          <Tab id="data-tab-event-date" aria-controls="event-date-panel" value="event-date" label="Fecha y hora" />
          <Tab id="data-tab-event-location" aria-controls="event-location-panel" value="event-location" label="Lugar" />
          <Tab id="data-tab-event-gifts" aria-controls="event-gifts-panel" value="event-gifts" label="Regalos" />
        </Tabs>
      ) : null}
      <Box
        data-testid="event-data-grid"
        sx={{
          display: 'grid',
          gridTemplateColumns: compactNavigation
            ? 'minmax(0,1fr)'
            : { xs: 'minmax(0,1fr)', md: 'repeat(2,minmax(0,1fr))' },
          gap: 1.5,
          alignItems: 'start',
          '& .MuiTextField-root': { '& .MuiInputBase-root': { minHeight: 44 } }
        }}
      >
        <DataBlock
          {...blockProps}
          id="celebration"
          tabId={compactNavigation ? 'data-tab-celebration' : undefined}
          selected={!compactNavigation || activeSection === 'celebration'}
          title="Tu celebración"
          icon={<CelebrationOutlined />}
          fields={['name', 'socialType', 'serviceId', 'capacity']}
          inlineError={!serviceError}
          error={
            fieldErrors.name ?? fieldErrors.socialType ?? fieldErrors.serviceId ?? fieldErrors.capacity ?? serviceError
          }
        >
          <Stack spacing={1.5}>
            <TextField
              size="small"
              fullWidth
              label="Nombre del evento"
              error={Boolean(fieldErrors.name)}
              helperText={fieldErrors.name}
              placeholder="Ej. Boda de Ana y Carlos"
              value={draft.name ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ name: e.target.value || null })}
              sx={{ '& input': { fontSize: '1.15rem', fontFamily: 'h2.fontFamily' } }}
            />
            <Box>
              <Typography id="celebration-type" variant="body2" sx={{ mb: 1 }}>
                Tipo de celebración
              </Typography>
              <ToggleButtonGroup
                exclusive
                aria-labelledby="celebration-type"
                value={draft.socialType ?? ''}
                disabled={disabled}
                onChange={(_, value: UpdateEventInput['socialType']) => onChange({ socialType: value || null })}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', sm: 'repeat(5,minmax(0,1fr))' },
                  gap: 1,
                  '& .MuiToggleButtonGroup-grouped': {
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '8px !important',
                    m: 0,
                    minHeight: 44,
                    px: 1,
                    flexDirection: { xs: 'row', sm: 'column' },
                    gap: 0.75,
                    color: 'text.secondary',
                    '&.Mui-selected': { bgcolor: 'action.selected', borderColor: 'text.primary', color: 'text.primary' }
                  }
                }}
              >
                {celebrationTypes.map(([value, Icon]) => (
                  <ToggleButton key={value} value={value} aria-label={socialTypeLabels[value]}>
                    <Icon fontSize="small" />
                    <Typography variant="caption">{socialTypeLabels[value]}</Typography>
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {fieldErrors.socialType ? (
                <Typography variant="body2" color="error">
                  {fieldErrors.socialType}
                </Typography>
              ) : null}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                select
                required
                label="Servicio"
                error={Boolean(fieldErrors.serviceId)}
                helperText={fieldErrors.serviceId}
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
              <TextField
                size="small"
                fullWidth
                type="number"
                label="Cantidad de invitados"
                name="capacity"
                error={Boolean(fieldErrors.capacity)}
                helperText={fieldErrors.capacity}
                value={draft.capacity ?? ''}
                disabled={disabled}
                slotProps={{ htmlInput: { min: 1 } }}
                onChange={(e) => onChange({ capacity: e.target.value ? Number(e.target.value) : null })}
              />
            </Box>
            {serviceError && failedServiceId ? (
              <Button
                sx={{ alignSelf: 'flex-start' }}
                disabled={serviceBusy}
                onClick={() => void chooseService(failedServiceId)}
              >
                Reintentar
              </Button>
            ) : null}
            {serviceError && failedServiceId ? (
              <Typography variant="body2" color="error">
                No pudimos verificar el diseño actual. Inténtalo nuevamente antes de cambiar de servicio.
              </Typography>
            ) : null}
          </Stack>
        </DataBlock>
        <DataBlock
          {...blockProps}
          id="event-date"
          tabId={compactNavigation ? 'data-tab-event-date' : undefined}
          selected={!compactNavigation || activeSection === 'event-date'}
          title="Fecha y hora del evento"
          icon={<CalendarMonthOutlined />}
          fields={['eventDateTime', 'timeZone']}
          pending={pendingDate}
          error={dateError ?? fieldErrors.eventDateTime ?? fieldErrors.timeZone}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr)',
              gap: 1.5,
              alignItems: 'start'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
              {desktop ? (
                <Box sx={{ flex: 1, minWidth: 0 }}>{calendar}</Box>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<CalendarMonthOutlined />}
                  disabled={disabled}
                  onClick={() => setCalendarOpen(true)}
                  sx={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'flex-start', textAlign: 'left' }}
                >
                  {selectedDate ? dateSummary(selectedDate) : 'Elegir fecha del evento'}
                </Button>
              )}
              {wallClock ? (
                <IconButton
                  aria-label="Quitar fecha y hora"
                  title="Quitar fecha y hora"
                  disabled={disabled}
                  onClick={() => commitDate('')}
                  sx={{ minWidth: 44, minHeight: 44 }}
                >
                  <ClearOutlined fontSize="small" />
                </IconButton>
              ) : null}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 1.5 }}>
                <TextField
                  size="small"
                  fullWidth
                  type="time"
                  label="Hora de inicio"
                  sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
                  value={selectedTime}
                  disabled={disabled}
                  error={Boolean(dateError ?? fieldErrors.eventDateTime)}
                  helperText={fieldErrors.eventDateTime}
                  slotProps={{ inputLabel: { shrink: true } }}
                  onFocus={() => setEditingWallClock(true)}
                  onBlur={() => setEditingWallClock(false)}
                  onChange={(e) => chooseDateTime(selectedDate, e.target.value)}
                />
                <TextField
                  size="small"
                  fullWidth
                  select
                  label="Zona horaria"
                  sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
                  error={Boolean(fieldErrors.timeZone)}
                  helperText={fieldErrors.timeZone}
                  value={zone}
                  disabled={disabled}
                  onChange={(e) => {
                    setZoneError(undefined);
                    setPendingZone(e.target.value);
                  }}
                >
                  {[...new Set([zone, ...zones])].map((item) => (
                    <MenuItem key={item} value={item}>
                      {timeZoneLabel(item)}
                    </MenuItem>
                  ))}
                </TextField>
                {selectedDate && !selectedTime ? (
                  <Typography variant="body2" color="text.secondary">
                    Elige la hora de inicio para completar la fecha.
                  </Typography>
                ) : null}
              </Box>
              <EventCountdown target={pendingDate ? null : draft.eventDateTime} zone={zone} />
            </Box>
          </Box>
        </DataBlock>
        <DataBlock
          {...blockProps}
          id="event-location"
          tabId={compactNavigation ? 'data-tab-event-location' : undefined}
          selected={!compactNavigation || activeSection === 'event-location'}
          title="Lugar del evento"
          icon={<LocationOnOutlined />}
          fields={['locationUrl']}
          inlineError
          error={locationError}
        >
          <EventLocation
            value={draft.locationUrl}
            href={locationHref}
            embedHref={mapHref}
            error={locationError}
            disabled={disabled}
            onChange={(locationUrl) => onChange({ locationUrl })}
          />
        </DataBlock>
        <DataBlock
          {...blockProps}
          id="event-gifts"
          tabId={compactNavigation ? 'data-tab-event-gifts' : undefined}
          selected={!compactNavigation || activeSection === 'event-gifts'}
          title="Mesa de regalos"
          icon={<CardGiftcardOutlined />}
          fields={['giftRegistryUrl']}
          inlineError
          error={giftError}
        >
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                bgcolor: 'background.default',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              <CardGiftcardOutlined sx={{ fontSize: 24, color: 'text.secondary' }} />
            </Box>
            {giftEditing || giftError ? (
              <>
                <TextField
                  size="small"
                  autoFocus
                  fullWidth
                  type="url"
                  label="Mesa de regalos"
                  name="giftRegistryUrl"
                  error={Boolean(giftError)}
                  helperText={giftError ?? 'Pega el enlace de tu mesa de regalos.'}
                  value={draft.giftRegistryUrl ?? ''}
                  disabled={disabled}
                  onChange={(e) => onChange({ giftRegistryUrl: e.target.value || null })}
                />
                <Button disabled={!giftHref} onClick={() => setGiftEditing(false)}>
                  Ver tarjeta
                </Button>
              </>
            ) : giftHref ? (
              <>
                <Typography variant="h3">{giftProvider(giftHref)}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {new URL(giftHref).hostname}
                </Typography>
                <Button
                  href={giftHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  endIcon={<OpenInNew fontSize="small" />}
                >
                  Abrir mesa de regalos
                </Button>
                <Button disabled={disabled} onClick={() => setGiftEditing(true)}>
                  Editar
                </Button>
              </>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Comparte un lugar para encontrar el regalo ideal.
                </Typography>
                <Button variant="outlined" startIcon={<Add />} disabled={disabled} onClick={() => setGiftEditing(true)}>
                  Agregar mesa de regalos
                </Button>
              </>
            )}
          </Stack>
        </DataBlock>
      </Box>
      <Dialog
        open={!desktop && calendarOpen}
        onClose={() => setCalendarOpen(false)}
        aria-labelledby="calendar-title"
        fullWidth
        maxWidth="xs"
        slotProps={{ paper: { sx: { m: 0.5, width: 'calc(100% - 8px)' } } }}
      >
        <DialogTitle id="calendar-title">Elegir fecha del evento</DialogTitle>
        <DialogContent sx={{ px: 0 }}>{calendar}</DialogContent>
        <DialogActions>
          <Button onClick={() => setCalendarOpen(false)}>Cerrar calendario</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(pendingZone)} onClose={() => setPendingZone(undefined)} aria-labelledby="zone-title">
        <DialogTitle id="zone-title">Cambiar zona horaria</DialogTitle>
        <DialogContent>
          La hora escrita se conservará para {pendingZone ? timeZoneLabel(pendingZone) : ''}. Confirma este cambio.
          {zoneError ? <Alert severity="error">{zoneError}</Alert> : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingZone(undefined)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => {
              const next = pendingZone;
              if (!next) return;
              try {
                const eventDateTime =
                  selectedDate && selectedTime
                    ? wallClockToInstant(wallClock, next)
                    : draft.eventDateTime
                      ? wallClockToInstant(instantToWallClock(draft.eventDateTime, zone), next)
                      : null;
                localInstant.current = eventDateTime;
                localZone.current = next;
                onChange({ timeZone: next, eventDateTime });
                setDateError(undefined);
                setPendingZone(undefined);
              } catch (error) {
                setZoneError(error instanceof Error ? error.message : 'Fecha inválida.');
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

const celebrationTypes = [
  ['WEDDING', FavoriteBorder],
  ['QUINCEANERA', AutoAwesomeOutlined],
  ['CORPORATE', BusinessCenterOutlined],
  ['BIRTHDAY', CakeOutlined],
  ['OTHER', CelebrationOutlined]
] as const;

function dateSummary(value: string) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`)
  );
}
