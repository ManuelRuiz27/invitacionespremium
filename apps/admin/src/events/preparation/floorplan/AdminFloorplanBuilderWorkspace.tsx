import {
  ApiError,
  type AdminEvent,
  type AdminFloorplan,
  type AdminFloorplanShape,
  type AdminFloorplanShapeInput,
  type ApiClient
} from '@invitaciones/api-client';
import {
  FloorplanInventory,
  FloorplanShapeValidationError,
  FloorplanStickerCatalog,
  FloorplanSurface,
  FloorplanTray,
  autoPlacePoint,
  createPendingTables,
  createStickerDraft,
  createUniqueFloorplanName,
  matchesAuthoritativeShape,
  normalizeFloorplanShape,
  placePendingTable,
  placeStickerDraft,
  type FloorplanStickerPresetId,
  type InventoryConfiguration,
  type PendingTable
} from '@invitaciones/floorplan';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import LockOpenRounded from '@mui/icons-material/LockOpenRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import TableRestaurantRounded from '@mui/icons-material/TableRestaurantRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { adminErrorMessage } from '../../../shared/admin-error';
import { AdminErrorState, AdminLoadingState } from '../../../shared/AdminStates';

type EditorMode = 'idle' | 'placing-preset' | 'creating-draft' | 'editing-existing';
type Mutation = 'uploading' | 'saving' | 'duplicating' | 'deleting' | 'locking' | 'unlocking' | 'placing' | 'seating';
type Geometry = AdminFloorplanShapeInput['geometry'];

const initialPolygon = [
  { x: 0.12, y: 0.12 },
  { x: 0.88, y: 0.12 },
  { x: 0.88, y: 0.88 },
  { x: 0.12, y: 0.88 }
];
const geometryLabels: ReadonlyArray<{ value: Geometry; label: string; zonesOnly?: boolean }> = [
  { value: 'CIRCLE', label: 'Redonda' },
  { value: 'SQUARE', label: 'Cuadrada' },
  { value: 'RECTANGLE', label: 'Rectangular' },
  { value: 'POLYGON', label: 'Forma personalizada', zonesOnly: true }
];
const emptyDraft = (): AdminFloorplanShapeInput => ({
  name: '',
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 8,
  x: 0.1,
  y: 0.1,
  width: 0.18,
  height: 0.18,
  rotation: 0,
  polygonPoints: null
});
const editable = (shape: AdminFloorplanShape): AdminFloorplanShapeInput => ({
  name: shape.name,
  kind: shape.kind,
  geometry: shape.geometry,
  capacity: shape.capacity,
  x: shape.x,
  y: shape.y,
  width: shape.width,
  height: shape.height,
  rotation: shape.rotation,
  polygonPoints: shape.polygonPoints ?? null
});
const nextSeatPoint = (table: AdminFloorplanShape, index: number, total: number) => {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(total, 1);
  const radius = 0.32;
  return {
    x: Math.min(0.99, Math.max(0.01, table.x + table.width * (0.5 + Math.cos(angle) * radius))),
    y: Math.min(0.99, Math.max(0.01, table.y + table.height * (0.5 + Math.sin(angle) * radius)))
  };
};

export function AdminFloorplanBuilderWorkspace({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const mutationLock = useRef(false);
  const refreshLock = useRef(false);
  const [floorplan, setFloorplan] = useState<AdminFloorplan>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(event.floorplanEnabled);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<EditorMode>('idle');
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedSeatId, setSelectedSeatId] = useState<string>();
  const [draft, setDraft] = useState<AdminFloorplanShapeInput>(emptyDraft);
  const [selectedPresetId, setSelectedPresetId] = useState<FloorplanStickerPresetId>();
  const [mutation, setMutation] = useState<Mutation>();
  const [message, setMessage] = useState<string>();
  const [reconciliationError, setReconciliationError] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [pendingTables, setPendingTables] = useState<PendingTable[]>([]);
  const [activePendingId, setActivePendingId] = useState<string>();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const theme = useTheme();
  const compactLayout = useMediaQuery(theme.breakpoints.down('lg'));
  const imageUrl = useAdminFloorplanImageUrl(apiClient, event, floorplan?.image.fileAssetId);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const latest = await apiClient.adminEventPreparation.getFloorplan(event.clientId, event.id, signal);
      setFloorplan(latest);
      setNotFound(false);
      setLoadError(false);
      return latest;
    },
    [apiClient, event.clientId, event.id]
  );

  useEffect(() => {
    if (!event.floorplanEnabled) return;
    const controller = new AbortController();
    setLoading(true);
    void load(controller.signal)
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404) {
          setFloorplan(undefined);
          setNotFound(true);
          setLoadError(false);
        } else setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [event.floorplanEnabled, load]);

  const selected = floorplan?.shapes.find((shape) => shape.id === selectedId);
  const selectedSeat = floorplan?.seats.find((seat) => seat.id === selectedSeatId);
  const pending = Boolean(mutation);
  const editing = mode !== 'idle';
  const readOnly = pending || floorplan?.locked === true;
  const dirty =
    mode === 'creating-draft' ||
    (mode === 'editing-existing' && Boolean(selected) && !sameShapeInput(draft, editable(selected!))) ||
    pendingTables.length > 0;
  const navigationBlocker = useBlocker(dirty);
  const places =
    floorplan?.shapes.filter((shape) => shape.kind === 'TABLE').reduce((total, shape) => total + shape.capacity, 0) ??
    0;
  const cancel = () => {
    setMode('idle');
    setSelectedId(undefined);
    setSelectedSeatId(undefined);
    setSelectedPresetId(undefined);
    setDraft(emptyDraft());
    setInspectorOpen(false);
  };

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (navigationBlocker.state !== 'blocked') return;
    if (window.confirm('Hay cambios del Croquis sin guardar. ¿Quieres salir y descartarlos?')) {
      navigationBlocker.proceed();
    } else {
      navigationBlocker.reset();
    }
  }, [navigationBlocker]);

  const adoptRecoveredFloorplan = (latest: AdminFloorplan, cause?: unknown) => {
    const selectedMissing = Boolean(selectedId) && !latest.shapes.some((shape) => shape.id === selectedId);
    const conflict = cause instanceof ApiError && cause.code === 'FLOORPLAN_CONCURRENCY_CONFLICT';
    if (latest.locked || selectedMissing || (conflict && mode === 'editing-existing')) cancel();
  };

  const recoverAfterFailedMutation = async (cause: unknown) => {
    const code = cause instanceof ApiError ? cause.code : undefined;
    const requiresImmediateAuthority =
      code === 'FLOORPLAN_CONCURRENCY_CONFLICT' ||
      code === 'FLOORPLAN_LAYOUT_LOCKED' ||
      code === 'FLOORPLAN_EVENT_STATE_LOCKED' ||
      code === 'FLOORPLAN_SHAPE_NOT_FOUND' ||
      code === 'FLOORPLAN_NOT_FOUND';
    if (!requiresImmediateAuthority) {
      setRefreshRequired(
        !(cause instanceof ApiError) || cause.status === 429 || cause.status >= 500 || cause.code === 'NETWORK_ERROR'
      );
      return;
    }
    try {
      const latest = await load();
      adoptRecoveredFloorplan(latest, cause);
      setRefreshRequired(false);
    } catch {
      setRefreshRequired(true);
    }
  };

  const runMutation = async <T,>(kind: Mutation, operation: () => Promise<T>, options: { recover?: boolean } = {}) => {
    if (mutationLock.current) return undefined;
    mutationLock.current = true;
    setMutation(kind);
    setMessage(undefined);
    try {
      return await operation();
    } catch (cause) {
      setMessage(mutationMessage(kind, cause));
      if (options.recover !== false) await recoverAfterFailedMutation(cause);
      return undefined;
    } finally {
      mutationLock.current = false;
      setMutation(undefined);
    }
  };
  const refreshAfterConfirmedMutation = async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setReconciliationError(false);
    setRefreshRequired(false);
    try {
      await load();
    } catch {
      setReconciliationError(true);
    } finally {
      refreshLock.current = false;
    }
  };
  const refreshAuthoritative = async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    try {
      const latest = await load();
      adoptRecoveredFloorplan(latest);
      setRefreshRequired(false);
      setReconciliationError(false);
    } catch {
      if (!reconciliationError) setRefreshRequired(true);
    } finally {
      refreshLock.current = false;
    }
  };
  const selectPreset = (presetId: FloorplanStickerPresetId) => {
    if (!floorplan || mode === 'editing-existing' || readOnly) return;
    const reservedNames = [
      ...floorplan.shapes.map(({ name }) => name),
      ...pendingTables.map(({ input }) => input.name)
    ];
    setSelectedId(undefined);
    setSelectedPresetId(presetId);
    setDraft(createStickerDraft(presetId, { existingNames: reservedNames }));
    setMode('placing-preset');
    setInspectorOpen(false);
    setMessage(undefined);
  };
  const selectShape = (shape: AdminFloorplanShape) => {
    if (editing || floorplan?.locked || pending) return;
    setSelectedPresetId(undefined);
    setSelectedId(shape.id);
    setSelectedSeatId(undefined);
    setDraft(editable(shape));
    setMode('editing-existing');
    setInspectorOpen(true);
    setMessage(undefined);
  };
  const addSeat = async () => {
    if (!floorplan || !selected || selected.kind !== 'TABLE' || readOnly) return;
    const tableSeats = floorplan.seats.filter((seat) => seat.floorplanShapeId === selected.id);
    const point = nextSeatPoint(selected, tableSeats.length, Math.max(selected.capacity, tableSeats.length + 1));
    const saved = await runMutation('seating', () =>
      apiClient.adminEventPreparation.createFloorplanSeat(event.clientId, event.id, selected.id, {
        label: `Lugar ${tableSeats.length + 1}`,
        ...point
      })
    );
    if (!saved) return;
    setFloorplan((current) => (current ? { ...current, seats: [...current.seats, saved] } : current));
    setSelectedSeatId(saved.id);
    await refreshAfterConfirmedMutation();
  };
  const removeSeat = async () => {
    if (!selectedSeat || readOnly) return;
    const removedId = selectedSeat.id;
    const succeeded = await runMutation('seating', async () => {
      await apiClient.adminEventPreparation.removeFloorplanSeat(event.clientId, event.id, removedId);
      return true;
    });
    if (!succeeded) return;
    setFloorplan((current) => current ? { ...current, seats: current.seats.filter((seat) => seat.id !== removedId) } : current);
    setSelectedSeatId(undefined);
    await refreshAfterConfirmedMutation();
  };
  const setSeatingMode = async (seatingMode: 'TABLE' | 'SEAT') => {
    if (!floorplan || floorplan.seatingMode === seatingMode || readOnly) return;
    const updated = await runMutation('seating', () =>
      apiClient.adminEventPreparation.setFloorplanSeatingMode(event.clientId, event.id, seatingMode)
    );
    if (!updated) return;
    setFloorplan(updated);
    setSelectedSeatId(undefined);
    await refreshAfterConfirmedMutation();
  };
  const upload = async (file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessage('Selecciona una imagen JPG o PNG.');
      return;
    }
    const updated = await runMutation('uploading', async () => {
      const asset = await apiClient.adminEventPreparation.uploadFloorplanAsset(event.clientId, event.id, file);
      return floorplan
        ? apiClient.adminEventPreparation.replaceFloorplanImage(event.clientId, event.id, {
            imageAssetId: asset.id
          })
        : apiClient.adminEventPreparation.createFloorplan(event.clientId, event.id, { imageAssetId: asset.id });
    });
    if (!updated) return;
    setFloorplan(updated);
    setNotFound(false);
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const save = async () => {
    if (!draft.name.trim()) {
      setMessage(draft.kind === 'TABLE' ? 'Escribe el nombre o número de la mesa.' : 'Escribe el nombre de la zona.');
      return;
    }
    if (draft.kind === 'TABLE' && (!Number.isInteger(draft.capacity) || draft.capacity < 1)) {
      setMessage('Indica un número de lugares mayor a cero.');
      return;
    }
    let normalized: AdminFloorplanShapeInput;
    try {
      normalized = normalizeFloorplanShape({ ...draft, name: draft.name.trim() });
    } catch (cause) {
      setMessage(
        cause instanceof FloorplanShapeValidationError
          ? 'Ajusta la forma para que permanezca dentro del plano.'
          : 'No pudimos preparar este elemento.'
      );
      return;
    }
    const saved = await runMutation('saving', () =>
      selected
        ? apiClient.adminEventPreparation.updateFloorplanShape(event.clientId, event.id, selected.id, normalized)
        : apiClient.adminEventPreparation.createFloorplanShape(event.clientId, event.id, normalized)
    );
    if (!saved) return;
    setFloorplan((current) =>
      current
        ? {
            ...current,
            shapes: selected
              ? current.shapes.map((shape) => (shape.id === selected.id ? saved : shape))
              : [...current.shapes, saved]
          }
        : current
    );
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const remove = async () => {
    if (!selected) return;
    const removedId = selected.id;
    const succeeded = await runMutation('deleting', async () => {
      await apiClient.adminEventPreparation.removeFloorplanShape(event.clientId, event.id, removedId);
      return true;
    });
    if (!succeeded) return;
    setFloorplan((current) =>
      current ? { ...current, shapes: current.shapes.filter((shape) => shape.id !== removedId) } : current
    );
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const duplicate = async () => {
    if (!selected || !floorplan || readOnly) return;
    const names = floorplan.shapes.map(({ name }) => name);
    const name =
      selected.kind === 'TABLE'
        ? createStickerDraft('round-table', { existingNames: names }).name
        : createUniqueFloorplanName(selected.name, names);
    const input = normalizeFloorplanShape({
      name,
      kind: selected.kind,
      geometry: selected.geometry,
      capacity: selected.kind === 'TABLE' ? selected.capacity : 0,
      x: selected.x + 0.02,
      y: selected.y + 0.02,
      width: selected.width,
      height: selected.height,
      rotation: selected.rotation,
      polygonPoints: selected.polygonPoints?.map(({ x, y }) => ({ x, y })) ?? null
    });
    const saved = await runMutation('duplicating', () =>
      apiClient.adminEventPreparation.createFloorplanShape(event.clientId, event.id, input)
    );
    if (!saved) return;
    setFloorplan((current) => (current ? { ...current, shapes: [...current.shapes, saved] } : current));
    cancel();
    await refreshAfterConfirmedMutation();
  };
  const createInventory = (configurations: readonly InventoryConfiguration[]) => {
    if (!floorplan || editing || readOnly) return;
    const requested = configurations.reduce((total, configuration) => total + configuration.quantity, 0);
    if (pendingTables.length + requested > 200) {
      setMessage('El inventario puede contener hasta 200 mesas pendientes.');
      return;
    }
    const reserved = [...floorplan.shapes, ...pendingTables.map((table) => table.input)];
    const created = createPendingTables(configurations, reserved);
    setPendingTables((current) => [...current, ...created]);
    setActivePendingId((current) => current ?? created[0]?.temporaryId);
    setInventoryOpen(false);
  };
  const persistPending = async (table: PendingTable, point: { x: number; y: number }, refresh = true) => {
    const input = placePendingTable(table, point);
    const saved = await runMutation(
      'placing',
      () => apiClient.adminEventPreparation.createFloorplanShape(event.clientId, event.id, input),
      { recover: false }
    );
    if (!saved) {
      try {
        const latest = await load();
        if (!latest.shapes.some((shape) => matchesAuthoritativeShape(table, shape))) {
          setRefreshRequired(true);
          return false;
        }
        setRefreshRequired(false);
      } catch {
        setRefreshRequired(true);
        return false;
      }
    } else {
      setFloorplan((current) => (current ? { ...current, shapes: [...current.shapes, saved] } : current));
    }
    setPendingTables((current) => current.filter((candidate) => candidate.temporaryId !== table.temporaryId));
    setActivePendingId((current) => (current === table.temporaryId ? undefined : current));
    if (refresh && saved) await refreshAfterConfirmedMutation();
    return true;
  };
  const placePending = (point: { x: number; y: number }, requestedId?: string) => {
    if (readOnly || mode === 'creating-draft' || mode === 'editing-existing') return;
    if (mode === 'placing-preset' && selectedPresetId) {
      setDraft((current) => placeStickerDraft(current, point));
      setMode('creating-draft');
      setInspectorOpen(true);
      return;
    }
    const table = pendingTables.find((candidate) => candidate.temporaryId === (requestedId ?? activePendingId));
    if (table) void persistPending(table, point);
  };
  const autoPlace = async () => {
    const snapshot = [...pendingTables];
    let placed = 0;
    for (const [index, table] of snapshot.entries()) {
      if (!(await persistPending(table, autoPlacePoint(index, snapshot.length), false))) break;
      placed += 1;
    }
    if (placed) await refreshAfterConfirmedMutation();
  };
  const changeLock = async () => {
    if (!floorplan) return;
    const kind = floorplan.locked ? 'unlocking' : 'locking';
    const updated = await runMutation(kind, () =>
      floorplan.locked
        ? apiClient.adminEventPreparation.unlockFloorplan(event.clientId, event.id)
        : apiClient.adminEventPreparation.lockFloorplan(event.clientId, event.id)
    );
    if (!updated) return;
    setFloorplan(updated);
    cancel();
    await refreshAfterConfirmedMutation();
  };

  if (!event.floorplanEnabled) {
    return (
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 4 }, borderRadius: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 620 }}>
          <Typography component="h2" variant="h4">
            Croquis deshabilitado
          </Typography>
          <Typography color="text.secondary">
            Habilita el Croquis en Datos cuando el Evento requiera distribución de mesas. No crearemos un plano sin esa
            decisión.
          </Typography>
          <Button
            component={Link}
            to={`/eventos/${event.id}/preparar/datos`}
            variant="contained"
            sx={{ alignSelf: 'flex-start' }}
          >
            Ir a Datos
          </Button>
        </Stack>
      </Paper>
    );
  }
  if (loading) return <AdminLoadingState label="Preparando el taller de Croquis..." />;
  if (loadError) return <AdminErrorState onRetry={() => void load().catch(() => setLoadError(true))} />;
  if (notFound || !floorplan) {
    return (
      <Paper
        variant="outlined"
        sx={{ minHeight: 430, display: 'grid', placeItems: 'center', p: 3, borderRadius: 3, bgcolor: 'grey.50' }}
      >
        <Stack spacing={2} sx={{ alignItems: 'center', maxWidth: 520, textAlign: 'center' }}>
          <ImageOutlined color="primary" sx={{ fontSize: 56 }} />
          <Typography component="h2" variant="h4">
            Comienza con el plano del lugar
          </Typography>
          <Typography color="text.secondary">
            Sube una imagen JPG o PNG para distribuir Mesas y Zonas sobre las medidas reales del salón.
          </Typography>
          <UploadButton
            label={mutation === 'uploading' ? 'Subiendo plano...' : 'Subir plano'}
            disabled={pending}
            onFile={upload}
          />
          {message ? <Alert severity="warning">{message}</Alert> : null}
          {refreshRequired ? (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" onClick={() => void refreshAuthoritative()}>
                  Actualizar plano
                </Button>
              }
            >
              No pudimos confirmar si el plano se creó. Actualiza antes de volver a subirlo.
            </Alert>
          ) : null}
        </Stack>
      </Paper>
    );
  }

  const inventory = (
    <FloorplanInventory
      disabled={readOnly || editing}
      maxTables={200 - pendingTables.length}
      onCreate={createInventory}
    />
  );
  const inspector = editing ? (
    <ShapeInspector
      mode={mode}
      value={draft}
      disabled={pending}
      onChange={setDraft}
      onSave={() => void save()}
      {...(selected ? { onDuplicate: () => void duplicate(), onDelete: () => void remove() } : {})}
      onCancel={cancel}
    />
  ) : null;
  return (
    <Stack spacing={1.5} component="section" aria-labelledby="admin-floorplan-title">
      <Paper variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          <Box sx={{ flex: 1 }}>
            <Typography id="admin-floorplan-title" component="h2" variant="h5">
              Taller de Croquis
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {floorplan.locked
                ? 'Distribución protegida en modo de lectura.'
                : 'Edita el plano operativo del proveedor.'}
            </Typography>
          </Box>
          <Chip
            label={
              mutation
                ? 'Guardando...'
                : message || reconciliationError || refreshRequired
                  ? 'Error al guardar'
                  : dirty
                    ? 'Cambios sin guardar'
                    : 'Guardado'
            }
            color={
              mutation
                ? 'warning'
                : message || reconciliationError || refreshRequired
                  ? 'error'
                  : dirty
                    ? 'warning'
                    : 'success'
            }
            variant="outlined"
            aria-live="polite"
          />
          <Chip label={`${floorplan.shapes.length} elementos · ${places} lugares`} variant="outlined" />
          <TextField
            select
            size="small"
            label="Asignación"
            value={floorplan.seatingMode}
            disabled={readOnly || editing}
            onChange={(event) => void setSeatingMode(event.target.value as 'TABLE' | 'SEAT')}
            sx={{ minWidth: 148 }}
          >
            <MenuItem value="TABLE">Por mesa</MenuItem>
            <MenuItem value="SEAT">Por lugar</MenuItem>
          </TextField>
          <UploadButton label="Cambiar plano" disabled={readOnly || editing} onFile={upload} />
          <Button
            variant={floorplan.locked ? 'contained' : 'outlined'}
            startIcon={floorplan.locked ? <LockOpenRounded /> : <LockRounded />}
            disabled={pending || editing || pendingTables.length > 0}
            onClick={() => void changeLock()}
            sx={{ minHeight: 44 }}
          >
            {floorplan.locked ? 'Editar distribución' : 'Finalizar distribución'}
          </Button>
        </Stack>
      </Paper>
      {message ? <Alert severity="warning">{message}</Alert> : null}
      {reconciliationError ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => void refreshAuthoritative()}>
              Actualizar plano
            </Button>
          }
        >
          El cambio se guardó, pero no pudimos actualizar el plano. La acción no se repetirá.
        </Alert>
      ) : null}
      {refreshRequired && !reconciliationError ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => void refreshAuthoritative()}>
              Actualizar plano
            </Button>
          }
        >
          No pudimos confirmar el estado final. Conservamos tu trabajo local; actualiza el plano antes de decidir si
          reintentas.
        </Alert>
      ) : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: inspector ? '248px minmax(0, 1fr) 320px' : '248px minmax(0, 1fr)'
          },
          gap: 1.5,
          alignItems: 'start'
        }}
      >
        <Paper
          component="aside"
          variant="outlined"
          sx={{ p: 1.5, borderRadius: 3, display: { xs: 'none', lg: 'block' } }}
        >
          <Stack spacing={1.5}>
            <Palette
              selectedPresetId={selectedPresetId}
              disabled={readOnly || mode === 'editing-existing'}
              onSelect={selectPreset}
              onInventory={() => setInventoryOpen(true)}
            />
            {!compactLayout && inventoryOpen ? inventory : null}
          </Stack>
        </Paper>
        <Box sx={{ minWidth: 0 }}>
          {mode === 'placing-preset' ? (
            <Alert
              severity="info"
              action={
                <Button color="inherit" onClick={cancel}>
                  Cancelar
                </Button>
              }
              sx={{ mb: 1 }}
            >
              Haz click o toca el punto del plano donde quieres colocar el elemento.
            </Alert>
          ) : null}
          {floorplan.seatingMode === 'SEAT' && selected?.kind === 'TABLE' ? (
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Button size="small" variant="outlined" disabled={readOnly} onClick={() => void addSeat()}>
                Agregar lugar a {selected.name}
              </Button>
              {selectedSeat ? (
                <Button size="small" color="error" disabled={readOnly || selectedSeat.occupied} onClick={() => void removeSeat()}>
                  Eliminar {selectedSeat.label}
                </Button>
              ) : null}
            </Stack>
          ) : null}
          {imageUrl ? (
            <FloorplanSurface
              floorplan={floorplan}
              imageUrl={imageUrl}
              selectedId={selectedId}
              selectedSeatId={selectedSeatId}
              draft={mode === 'creating-draft' || mode === 'editing-existing' ? draft : undefined}
              disabled={readOnly}
              onSelect={selectShape}
              onSeatSelect={(seatId) => {
                if (editing || readOnly) return;
                const seat = floorplan.seats.find((candidate) => candidate.id === seatId);
                if (!seat) return;
                setSelectedSeatId(seat.id);
                setSelectedId(seat.floorplanShapeId);
              }}
              onDraftChange={setDraft}
              onCanvasPlace={mode === 'placing-preset' || pendingTables.length ? placePending : undefined}
              dock={
                !floorplan.locked && mode === 'idle' ? (
                  <FloorplanTray
                    tables={pendingTables}
                    activeId={activePendingId}
                    disabled={pending}
                    onChoose={(id) => setActivePendingId((current) => (current === id ? undefined : id))}
                    onAutoPlace={() => void autoPlace()}
                  />
                ) : undefined
              }
            />
          ) : (
            <Paper variant="outlined" sx={{ minHeight: 460, display: 'grid', placeItems: 'center', borderRadius: 3 }}>
              <Typography color="text.secondary">Cargando imagen privada...</Typography>
            </Paper>
          )}
        </Box>
        {inspector ? (
          <Box component="aside" sx={{ display: { xs: 'none', lg: 'block' } }}>
            {inspector}
          </Box>
        ) : null}
      </Box>
      <Stack direction="row" spacing={1} sx={{ display: { xs: 'flex', lg: 'none' }, flexWrap: 'wrap' }}>
        <Palette
          selectedPresetId={selectedPresetId}
          disabled={readOnly || mode === 'editing-existing'}
          onSelect={selectPreset}
          onInventory={() => setInventoryOpen(true)}
        />
      </Stack>
      <Drawer
        anchor="bottom"
        open={compactLayout && inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        slotProps={{ paper: { sx: { p: 2, maxHeight: '82vh', borderRadius: '22px 22px 0 0' } } }}
      >
        {inventory}
      </Drawer>
      <Drawer
        anchor="right"
        open={compactLayout && inspectorOpen && Boolean(inspector)}
        onClose={cancel}
        slotProps={{ paper: { sx: { p: 2, width: 'min(360px, 92vw)' } } }}
      >
        {inspector}
      </Drawer>
    </Stack>
  );
}

function Palette({
  selectedPresetId,
  disabled,
  onSelect,
  onInventory
}: {
  selectedPresetId?: FloorplanStickerPresetId | undefined;
  disabled: boolean;
  onSelect: (presetId: FloorplanStickerPresetId) => void;
  onInventory: () => void;
}) {
  return (
    <Stack spacing={1.25} sx={{ minWidth: 0 }}>
      <FloorplanStickerCatalog selectedId={selectedPresetId} disabled={disabled} onSelect={onSelect} />
      <Button
        variant="text"
        startIcon={<TableRestaurantRounded />}
        disabled={disabled}
        onClick={onInventory}
        sx={{ minHeight: 44, justifyContent: 'flex-start' }}
      >
        Crear varias mesas
      </Button>
    </Stack>
  );
}

function ShapeInspector({
  mode,
  value,
  disabled,
  onChange,
  onSave,
  onDuplicate,
  onDelete,
  onCancel
}: {
  mode: EditorMode;
  value: AdminFloorplanShapeInput;
  disabled: boolean;
  onChange: (value: AdminFloorplanShapeInput) => void;
  onSave: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const table = value.kind === 'TABLE';
  return (
    <Paper component="section" variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            {mode === 'creating-draft' ? 'Nuevo elemento' : table ? 'Mesa seleccionada' : 'Zona seleccionada'}
          </Typography>
          <Typography component="h3" variant="h6">
            {table ? 'Mesa' : 'Zona'}
          </Typography>
        </Box>
        <TextField
          label={table ? 'Nombre o número' : 'Nombre de zona'}
          value={value.name}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
        {table ? (
          <TextField
            label="Número de lugares"
            type="number"
            value={value.capacity}
            disabled={disabled}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
            onChange={(event) => onChange({ ...value, capacity: Number(event.target.value) })}
          />
        ) : null}
        <TextField
          select
          label="Forma"
          value={value.geometry}
          disabled={disabled}
          onChange={(event) => {
            const geometry = event.target.value as Geometry;
            onChange(
              normalizeFloorplanShape({
                ...value,
                geometry,
                ...(geometry === 'CIRCLE' || geometry === 'SQUARE'
                  ? { height: value.width, polygonPoints: null }
                  : geometry === 'POLYGON'
                    ? { polygonPoints: initialPolygon }
                    : { polygonPoints: null })
              })
            );
          }}
        >
          {geometryLabels
            .filter((option) => !option.zonesOnly || !table)
            .map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
        </TextField>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={disabled} onClick={onSave} sx={{ minHeight: 44, flex: 1 }}>
            {mode === 'creating-draft' ? `Agregar ${table ? 'mesa' : 'zona'}` : 'Guardar cambios'}
          </Button>
          <Button disabled={disabled} onClick={onCancel} sx={{ minHeight: 44 }}>
            Cancelar
          </Button>
        </Stack>
        {onDuplicate ? (
          <Button startIcon={<ContentCopyRounded />} disabled={disabled} onClick={onDuplicate} sx={{ minHeight: 44 }}>
            Duplicar
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            color="error"
            startIcon={<DeleteOutlineRounded />}
            disabled={disabled}
            onClick={onDelete}
            sx={{ minHeight: 44 }}
          >
            {table ? 'Eliminar mesa' : 'Eliminar zona'}
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
}

function UploadButton({
  label,
  disabled,
  onFile
}: {
  label: string;
  disabled: boolean;
  onFile: (file: File) => Promise<void>;
}) {
  return (
    <Button
      component="label"
      variant="outlined"
      disabled={disabled}
      startIcon={<ImageOutlined />}
      sx={{ minHeight: 44 }}
    >
      {label}
      <input
        hidden
        type="file"
        accept="image/png,image/jpeg"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (file)
            void onFile(file).finally(() => {
              input.value = '';
            });
        }}
      />
    </Button>
  );
}

function useAdminFloorplanImageUrl(apiClient: ApiClient, event: AdminEvent, assetId?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!assetId) {
      setUrl(undefined);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void apiClient.adminEventPreparation
      .floorplanAssetContent(event.clientId, event.id, assetId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setUrl(undefined);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiClient, assetId, event.clientId, event.id]);
  return url;
}

function mutationMessage(kind: Mutation, cause: unknown) {
  if (cause instanceof ApiError) {
    if (cause.code === 'FLOORPLAN_CONCURRENCY_CONFLICT')
      return 'El plano cambió al mismo tiempo. Actualizamos la información sin repetir tu operación.';
    if (cause.code === 'FLOORPLAN_LAYOUT_LOCKED' || cause.code === 'FLOORPLAN_EVENT_STATE_LOCKED')
      return 'La distribución fue protegida y ahora está en modo de lectura.';
    if (cause.code === 'FLOORPLAN_SHAPE_NOT_FOUND')
      return 'Esta mesa o zona ya no está disponible. Actualizamos el plano.';
    if (cause.code === 'FLOORPLAN_TABLE_OCCUPIED') return 'Esta mesa tiene lugares asignados y no puede eliminarse.';
  }
  if (kind === 'deleting') return 'No pudimos eliminar este elemento. Inténtalo nuevamente.';
  if (kind === 'locking') return 'No pudimos finalizar la distribución. Inténtalo nuevamente.';
  if (kind === 'unlocking') return 'No pudimos habilitar la edición. Inténtalo nuevamente.';
  if (kind === 'uploading') return 'No pudimos guardar el plano. Inténtalo nuevamente.';
  return adminErrorMessage(cause).message || 'No pudimos guardar los cambios. Inténtalo nuevamente.';
}

function sameShapeInput(left: AdminFloorplanShapeInput, right: AdminFloorplanShapeInput) {
  return (
    left.name === right.name &&
    left.kind === right.kind &&
    left.geometry === right.geometry &&
    left.capacity === right.capacity &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotation === right.rotation &&
    JSON.stringify(left.polygonPoints ?? null) === JSON.stringify(right.polygonPoints ?? null)
  );
}
