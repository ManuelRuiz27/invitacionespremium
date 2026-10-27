import {
  type AdminEvent,
  type AdminGeneratePhysicalPassesInput,
  type AdminGeneratePhysicalPassesResult,
  type ApiClient
} from '@invitaciones/api-client';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { adminQueryKeys } from '../../app/query-client';
import { adminErrorMessage, isUncertainFailure } from '../../shared/admin-error';
import { AdminErrorState, AdminLoadingState } from '../../shared/AdminStates';

export const accessReadinessKey = (event: Pick<AdminEvent, 'clientId' | 'id'>) =>
  ['admin', 'access-readiness', event.clientId, event.id] as const;

const blockerActions: Record<string, { message: string; section?: string }> = {
  EVENT_ACCESS_CONTROL_CONTEXT_INVALID: {
    message: 'Revisa que la Organización esté activa y tenga perfil gestionado.'
  },
  EVENT_SERVICE_NOT_AVAILABLE: { message: 'Revisa la disponibilidad del servicio de control de acceso.' },
  EVENT_ACCESS_MODE_INVALID: { message: 'Selecciona una modalidad de acceso válida.', section: 'datos' },
  EVENT_PLANNER_ASSIGNMENT_INVALID: {
    message: 'Asigna una Planner de Organización vigente desde el detalle del Evento.'
  },
  EVENT_BASIC_DATA_INCOMPLETE: { message: 'Completa los datos del Evento.', section: 'datos' },
  EVENT_ACCESS_CAPACITY_EXCEEDED: {
    message: 'Revisa la capacidad: los accesos vigentes superan el aforo.',
    section: 'datos'
  },
  EVENT_ACCESS_MATERIAL_MISSING: { message: 'Prepara al menos una credencial o pase vigente.' },
  EVENT_ACCESS_MATERIAL_INCONSISTENT: { message: 'Revisa el registro y material de acceso con la Organización.' },
  EVENT_ACCESS_CREDENTIAL_MISSING: { message: 'La Organización debe emitir las credenciales pendientes desde Client.' },
  EVENT_ACCESS_PRIOR_ENTRY: { message: 'Existe un ingreso previo a la activación. Revisa la incidencia técnica.' },
  EVENT_ACCESS_SEATING_INCOMPLETE: {
    message: 'Completa el acomodo de los accesos vigentes en las Mesas del Croquis.',
    section: 'croquis'
  },
  PHYSICAL_PASS_NUMBERING_INCONSISTENT: { message: 'Revisa la consistencia del historial de folios.' },
  EVENT_FLOORPLAN_MISSING: { message: 'Prepara el Croquis habilitado para este Evento.', section: 'croquis' },
  EVENT_FLOORPLAN_IMAGE_NOT_READY: { message: 'Prepara una imagen de Croquis válida.', section: 'croquis' },
  EVENT_FLOORPLAN_TABLE_MISSING: { message: 'Prepara al menos una Mesa en el Croquis.', section: 'croquis' },
  EVENT_FLOORPLAN_INCONSISTENT: { message: 'Revisa las Mesas y capacidades del Croquis.', section: 'croquis' }
};

export function AdminAccessSection({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const queryClient = useQueryClient();
  const readiness = useQuery({
    queryKey: accessReadinessKey(event),
    queryFn: ({ signal }) => apiClient.adminEventPreparation.getAccessReadiness(event.clientId, event.id, signal)
  });
  const floorplan = useQuery({
    queryKey: ['admin', 'access-pass-tables', event.clientId, event.id],
    queryFn: ({ signal }) => apiClient.adminEventPreparation.getFloorplan(event.clientId, event.id, signal),
    enabled: event.floorplanEnabled && event.accessMode === 'ANONYMOUS'
  });
  const [quantityInput, setQuantityInput] = useState('');
  const [tableShapeId, setTableShapeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<AdminGeneratePhysicalPassesResult>();
  const running = useRef(false);
  const mounted = useRef(true);
  const attempt = useRef<{ body: AdminGeneratePhysicalPassesInput; key: string } | undefined>(undefined);
  const blocker = useBlocker(busy || uncertain);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, uncertain]);

  const quantity = Number(quantityInput);
  const canGenerate =
    event.accessMode === 'ANONYMOUS' &&
    ['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE', 'ACTIVE', 'EVENT_DAY'].includes(event.status);
  const tables = floorplan.data?.shapes.filter((shape) => shape.kind === 'TABLE') ?? [];
  const valid =
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 150 &&
    (!event.floorplanEnabled ||
      (!floorplan.isPending && !floorplan.isError && tables.some((table) => table.id === tableShapeId)));

  async function generate() {
    if (running.current || (!attempt.current && (!canGenerate || !valid))) return;
    const operation = attempt.current ?? {
      body: { quantity, tableShapeId: event.floorplanEnabled ? tableShapeId : null },
      key: globalThis.crypto.randomUUID()
    };
    attempt.current = operation;
    running.current = true;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const generated = await apiClient.adminEventPreparation.generatePhysicalPasses(
        event.clientId,
        event.id,
        operation.body,
        operation.key
      );
      attempt.current = undefined;
      if (!mounted.current) return;
      setUncertain(false);
      setResult(generated);
      setQuantityInput('');
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: accessReadinessKey(event) }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.event(event.id) }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'access-pass-tables', event.clientId, event.id] })
      ]);
    } catch (cause) {
      if (!mounted.current) return;
      const pending = isUncertainFailure(cause);
      setUncertain(pending);
      if (!pending) attempt.current = undefined;
      setError(
        pending
          ? 'No pudimos confirmar el lote. Reintenta la misma operación; se conservarán su cantidad, Mesa y clave.'
          : adminErrorMessage(cause).message
      );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography component="h2" variant="h4">
              Preparación de accesos
            </Typography>
            {readiness.isPending ? (
              <AdminLoadingState label="Consultando requisitos de acceso…" />
            ) : readiness.isError ? (
              <AdminErrorState onRetry={() => void readiness.refetch()} />
            ) : (
              <>
                <Alert severity={event.activatedAt || readiness.data.complete ? 'success' : 'warning'}>
                  {event.activatedAt
                    ? 'La activación ya fue realizada.'
                    : readiness.data.complete
                      ? 'Accesos listos para activar.'
                      : 'Hay requisitos pendientes antes de activar.'}
                </Alert>
                <Typography>
                  Accesos vigentes: {readiness.data.activeMaterialCount} · Capacidad:{' '}
                  {readiness.data.capacity ?? 'Sin definir'}
                </Typography>
                {(['provider', 'venue'] as const).map((owner) => {
                  const blockers = readiness.data.blockers.filter((code) => {
                    const venue =
                      event.accessMode === 'NOMINAL' &&
                      [
                        'EVENT_ACCESS_MATERIAL_MISSING',
                        'EVENT_ACCESS_CREDENTIAL_MISSING',
                        'EVENT_ACCESS_SEATING_INCOMPLETE',
                        'EVENT_ACCESS_MATERIAL_INCONSISTENT'
                      ].includes(code);
                    return owner === 'venue' ? venue : !venue;
                  });
                  if (blockers.length === 0) return null;
                  return (
                    <Stack
                      key={owner}
                      spacing={1}
                      component="section"
                      aria-label={owner === 'provider' ? 'Pendiente de InvitacionesPremium' : 'Pendiente del salón'}
                    >
                      <Typography component="h3" variant="h6">
                        {owner === 'provider' ? 'Pendiente de InvitacionesPremium' : 'Pendiente del salón'}
                      </Typography>
                      {blockers.map((code) => {
                        const action =
                          code === 'EVENT_ACCESS_MATERIAL_MISSING'
                            ? {
                                message:
                                  event.accessMode === 'NOMINAL'
                                    ? 'El salón debe registrar invitados y emitir sus credenciales desde Client.'
                                    : 'Genera un lote de pases anónimos vigente.'
                              }
                            : code === 'EVENT_ACCESS_SEATING_INCOMPLETE' && event.accessMode === 'NOMINAL'
                              ? { message: 'La Organización debe completar el acomodo de los invitados desde Client.' }
                              : (blockerActions[code] ?? {
                                  message: 'Revisa el requisito técnico pendiente con soporte.'
                                });
                        const section = 'section' in action ? action.section : undefined;
                        const editable =
                          !event.deletedAt && ['DRAFT', 'CONFIGURED', 'READY_TO_ACTIVATE'].includes(event.status);
                        return (
                          <Alert
                            key={code}
                            severity="warning"
                            action={
                              editable && section && (section !== 'croquis' || event.floorplanEnabled) ? (
                                <Button
                                  component={Link}
                                  to={`/eventos/${event.id}/preparar/${section}`}
                                  color="inherit"
                                >
                                  Revisar
                                </Button>
                              ) : undefined
                            }
                          >
                            {action.message}
                            <Typography component="span" sx={{ display: 'block' }} variant="caption">
                              Referencia: {code}
                            </Typography>
                          </Alert>
                        );
                      })}
                    </Stack>
                  );
                })}
              </>
            )}
            <Button
              disabled={readiness.isFetching}
              onClick={() =>
                void Promise.all([
                  readiness.refetch(),
                  queryClient.invalidateQueries({ queryKey: adminQueryKeys.event(event.id) })
                ])
              }
            >
              Actualizar requisitos
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {event.accessMode === 'NOMINAL' ? (
        <Alert severity="info">
          La Organización registra invitados, emite las credenciales individuales y completa su acomodo desde Client.
          Provider prepara los datos y el Croquis; no emite credenciales nominales.
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <Stack
              spacing={2}
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <Typography component="h2" variant="h4">
                Generar pases anónimos
              </Typography>
              <Typography color="text.secondary">
                Provider genera los lotes. La Organización consulta, descarga y revoca sus pases desde Client.
              </Typography>
              {!canGenerate ? (
                <Alert severity="info">Este Evento está en consulta y no admite nuevos lotes.</Alert>
              ) : null}
              <TextField
                label="Cantidad de pases"
                type="number"
                value={quantityInput}
                disabled={!canGenerate || busy || uncertain}
                onChange={(e) => setQuantityInput(e.target.value)}
                slotProps={{ htmlInput: { min: 1, max: 150, step: 1 } }}
              />
              {event.floorplanEnabled ? (
                <>
                  <TextField
                    select
                    label="Mesa del lote"
                    value={tableShapeId}
                    disabled={!canGenerate || busy || uncertain || floorplan.isPending || floorplan.isError}
                    onChange={(e) => setTableShapeId(e.target.value)}
                  >
                    {tables.map((table) => (
                      <MenuItem key={table.id} value={table.id}>
                        {table.name} · {table.availableCapacity} lugares disponibles
                      </MenuItem>
                    ))}
                  </TextField>
                  {floorplan.isError ? (
                    <Alert severity="error">
                      No pudimos consultar las Mesas.{' '}
                      <Button onClick={() => void floorplan.refetch()}>Reintentar Mesas</Button>
                    </Alert>
                  ) : null}
                  {!floorplan.isPending && !floorplan.isError && tables.length === 0 ? (
                    <Alert severity="warning">Prepara las Mesas del Croquis antes de generar el lote.</Alert>
                  ) : null}
                </>
              ) : null}
              {error ? <Alert severity={uncertain ? 'warning' : 'error'}>{error}</Alert> : null}
              {result ? (
                <Alert severity="success">
                  Lote confirmado: {result.quantity} pases · folios {result.firstPassNumber}–{result.lastPassNumber}
                  {result.table ? ` · ${result.table.name}` : ''}.
                </Alert>
              ) : null}
              <Button type="submit" variant="contained" disabled={busy || (!uncertain && (!canGenerate || !valid))}>
                {busy ? 'Generando…' : uncertain ? 'Reintentar mismo lote' : 'Generar lote'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}
      <Dialog open={blocker.state === 'blocked'}>
        <DialogTitle>Conserva la operación de pases</DialogTitle>
        <DialogContent>
          Completa o reintenta el lote pendiente antes de salir para conservar su resultado y evitar una segunda
          emisión.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Permanecer en Accesos</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
