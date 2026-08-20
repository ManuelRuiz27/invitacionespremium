import type {
  AdminEvent,
  AdminPilotObservation,
  AdminPilotObservationInput,
  AdminPilotObservationJournal,
  ApiClient
} from '@invitaciones/api-client';
import { Alert, Box, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminErrorMessage } from '../../../shared/admin-error';

const kindLabels = {
  PREPARATION_TIME: 'Tiempo de preparación',
  INCIDENT: 'Incidencia',
  PLANNER_SUPPORT: 'Soporte a Planner',
  LAST_MINUTE_CHANGE: 'Cambio de último minuto',
  MANUAL_WORK: 'Trabajo manual repetitivo'
} as const;
const areaLabels = {
  GENERAL: 'General',
  INVITATION: 'Invitación',
  FLOORPLAN: 'Croquis',
  GUESTS: 'Invitados',
  RSVP: 'RSVP',
  SEATING: 'Mesas',
  STAFF: 'Staff',
  CHECKIN: 'Check-in',
  CLOSE_REPORT: 'Cierre y reporte'
} as const;
const durationRequired = new Set<AdminPilotObservationInput['kind']>([
  'PREPARATION_TIME',
  'PLANNER_SUPPORT',
  'MANUAL_WORK'
]);

type Draft = {
  kind: AdminPilotObservationInput['kind'];
  area: AdminPilotObservationInput['area'];
  durationMinutes: string;
  count: string;
  note: string;
};

const emptyDraft: Draft = {
  kind: 'PREPARATION_TIME',
  area: 'GENERAL',
  durationMinutes: '',
  count: '1',
  note: ''
};

export function AdminPilotOperationalLog({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const [journal, setJournal] = useState<AdminPilotObservationJournal>();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmation, setConfirmation] = useState<string>();
  const [refreshRequired, setRefreshRequired] = useState(false);
  const mutationLock = useRef(false);

  const load = async (signal?: AbortSignal) => {
    const next = await apiClient.adminEventPreparation.listPilotObservations(event.clientId, event.id, signal);
    setJournal(next);
    setRefreshRequired(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(adminErrorMessage(cause).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [event.clientId, event.id]);

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (mutationLock.current) return;
    const validation = validate(draft);
    if (validation) {
      setError(validation);
      return;
    }
    mutationLock.current = true;
    setBusy(true);
    setError(undefined);
    setConfirmation(undefined);
    const input = toInput(draft);
    try {
      const created = await apiClient.adminEventPreparation.createPilotObservation(event.clientId, event.id, input);
      setConfirmation('Actividad registrada.');
      setDraft(emptyDraft);
      try {
        await load();
      } catch (cause) {
        setJournal((current) => appendConfirmed(current, created));
        setRefreshRequired(true);
        setError(
          `La actividad quedó registrada, pero no se pudo actualizar el resumen. ${adminErrorMessage(cause).message}`
        );
      }
    } catch (cause) {
      setError(adminErrorMessage(cause).message);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError(undefined);
    try {
      await load();
    } catch (cause) {
      setError(adminErrorMessage(cause).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Alert severity="warning">
        No incluyas nombres, teléfonos ni datos personales de invitados. Tampoco registres credenciales ni información
        sensible; usa notas breves y operativas.
      </Alert>
      {error ? <Alert severity={refreshRequired ? 'warning' : 'error'}>{error}</Alert> : null}
      {confirmation ? <Alert severity="success">{confirmation}</Alert> : null}
      {refreshRequired ? (
        <Button variant="outlined" onClick={() => void refresh()} disabled={loading} sx={{ alignSelf: 'flex-start' }}>
          Actualizar registro
        </Button>
      ) : null}

      <Summary journal={journal} loading={loading} />

      <Card>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={(submitEvent) => void submit(submitEvent)}>
            <Typography component="h2" variant="h4">
              Registrar actividad
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
              <TextField
                select
                label="Tipo de actividad"
                value={draft.kind}
                onChange={(change) =>
                  setDraft((current) => ({ ...current, kind: change.target.value as Draft['kind'] }))
                }
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Área"
                value={draft.area}
                onChange={(change) =>
                  setDraft((current) => ({ ...current, area: change.target.value as Draft['area'] }))
                }
              >
                {Object.entries(areaLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Tiempo invertido (min)"
                type="number"
                required={durationRequired.has(draft.kind)}
                value={draft.durationMinutes}
                onChange={(change) => setDraft((current) => ({ ...current, durationMinutes: change.target.value }))}
                slotProps={{ htmlInput: { min: 1, max: 1440, step: 1 } }}
              />
              {draft.kind === 'INCIDENT' || draft.kind === 'LAST_MINUTE_CHANGE' ? (
                <TextField
                  label="Cantidad"
                  type="number"
                  required
                  value={draft.count}
                  onChange={(change) => setDraft((current) => ({ ...current, count: change.target.value }))}
                  slotProps={{ htmlInput: { min: 1, max: 10_000, step: 1 } }}
                />
              ) : null}
            </Box>
            <TextField
              label="Nota operativa (opcional)"
              multiline
              minRows={3}
              value={draft.note}
              onChange={(change) => setDraft((current) => ({ ...current, note: change.target.value }))}
              helperText={`${draft.note.length}/500 caracteres`}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
            <Button type="submit" variant="contained" disabled={busy} sx={{ minHeight: 44, alignSelf: 'flex-start' }}>
              {busy ? 'Registrando…' : 'Registrar actividad'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <History observations={journal?.observations ?? []} loading={loading} />
    </Stack>
  );
}

function Summary({ journal, loading }: { journal: AdminPilotObservationJournal | undefined; loading: boolean }) {
  const summary = journal?.summary;
  const metrics = [
    ['Preparación total', `${summary?.preparationMinutesTotal ?? 0} min`],
    ['Invitación', `${summary?.invitationPreparationMinutes ?? 0} min`],
    ['Croquis', `${summary?.floorplanPreparationMinutes ?? 0} min`],
    ['Invitados', `${summary?.guestCount ?? 0} invitados`],
    ['Mesas', `${summary?.tableCount ?? 0} mesas`],
    ['Incidencias', plural(summary?.incidents ?? 0, 'incidencia', 'incidencias')],
    [
      'Soporte Planner',
      `${summary?.plannerSupportMinutes ?? 0} min · ${summary?.plannerSupportEntries ?? 0} registros`
    ],
    ['Cambios de último minuto', plural(summary?.lastMinuteChanges ?? 0, 'cambio', 'cambios')],
    ['Trabajo manual', `${summary?.manualWorkMinutes ?? 0} min · ${summary?.manualWorkEntries ?? 0} registros`]
  ];
  return (
    <Stack spacing={1.5}>
      <Typography component="h2" variant="h4">
        Resumen operativo
      </Typography>
      <Box
        data-testid="pilot-summary"
        aria-busy={loading}
        sx={{
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }
        }}
      >
        {metrics.map(([label, value]) => (
          <Card key={label} variant="outlined">
            <CardContent>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="h6">{loading && !journal ? 'Cargando…' : value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}

function History({ observations, loading }: { observations: AdminPilotObservation[]; loading: boolean }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography component="h2" variant="h4">
            Historial
          </Typography>
          {loading && observations.length === 0 ? <Typography>Cargando registro…</Typography> : null}
          {!loading && observations.length === 0 ? (
            <Typography color="text.secondary">Aún no hay actividad registrada.</Typography>
          ) : null}
          {observations.map((observation) => (
            <Box key={observation.id} component="article" sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}>
              <Typography component="h3" variant="subtitle1">
                {kindLabels[observation.kind]} · {areaLabels[observation.area]}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDate(observation.createdAt)}
                {observation.durationMinutes ? ` · ${observation.durationMinutes} min` : ''}
                {observation.kind === 'INCIDENT'
                  ? ` · ${plural(observation.count, 'incidencia', 'incidencias')}`
                  : observation.kind === 'LAST_MINUTE_CHANGE'
                    ? ` · ${plural(observation.count, 'cambio', 'cambios')}`
                    : observation.count > 1
                      ? ` · ${observation.count} registros`
                      : ''}
              </Typography>
              {observation.note ? <Typography sx={{ mt: 0.5 }}>{observation.note}</Typography> : null}
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function validate(draft: Draft): string | undefined {
  if (durationRequired.has(draft.kind) && !draft.durationMinutes) return 'Indica la duración en minutos.';
  if (draft.durationMinutes && !validInteger(draft.durationMinutes, 1, 1440))
    return 'La duración debe estar entre 1 y 1440 minutos.';
  if (!validInteger(draft.count, 1, 10_000)) return 'La cantidad debe estar entre 1 y 10000.';
  if (draft.note.trim().length > 500) return 'La nota no puede exceder 500 caracteres.';
  return undefined;
}

function validInteger(value: string, minimum: number, maximum: number): boolean {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum;
}

function toInput(draft: Draft): AdminPilotObservationInput {
  return {
    kind: draft.kind,
    area: draft.area,
    ...(draft.durationMinutes ? { durationMinutes: Number(draft.durationMinutes) } : {}),
    count: draft.kind === 'INCIDENT' || draft.kind === 'LAST_MINUTE_CHANGE' ? Number(draft.count) : 1,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {})
  };
}

function appendConfirmed(
  journal: AdminPilotObservationJournal | undefined,
  created: AdminPilotObservation
): AdminPilotObservationJournal | undefined {
  return journal ? { ...journal, observations: [created, ...journal.observations] } : undefined;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function plural(count: number, singular: string, pluralValue: string): string {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}
