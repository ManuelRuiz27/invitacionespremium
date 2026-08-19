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
  FloorplanSurface,
  FloorplanTray,
  autoPlacePoint,
  createPendingTables,
  matchesAuthoritativeShape,
  normalizeFloorplanShape,
  placePendingTable,
  type InventoryConfiguration,
  type PendingTable
} from '@invitaciones/floorplan';
import AddRounded from '@mui/icons-material/AddRounded';
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
import { Link } from 'react-router-dom';
import { adminErrorMessage } from '../../../shared/admin-error';
import { AdminErrorState, AdminLoadingState } from '../../../shared/AdminStates';

type EditorMode = 'idle' | 'creating' | 'editing';
type Mutation = 'uploading' | 'saving' | 'deleting' | 'locking' | 'unlocking' | 'placing';
type ShapeKind = AdminFloorplanShapeInput['kind'];
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
const newDraft = (kind: ShapeKind): AdminFloorplanShapeInput => ({
  name: '',
  kind,
  geometry: kind === 'TABLE' ? 'CIRCLE' : 'RECTANGLE',
  capacity: kind === 'TABLE' ? 8 : 0,
  x: 0.1,
  y: 0.1,
  width: 0.18,
  height: kind === 'TABLE' ? 0.18 : 0.14,
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

export function AdminFloorplanBuilderWorkspace({ apiClient, event }: { apiClient: ApiClient; event: AdminEvent }) {
  const mutationLock = useRef(false);
  const refreshLock = useRef(false);
  const [floorplan, setFloorplan] = useState<AdminFloorplan>();
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(event.floorplanEnabled);
  const [loadError, setLoadError] = useState(false);
  const [mode, setMode] = useState<EditorMode>('idle');
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<AdminFloorplanShapeInput>(() => newDraft('TABLE'));
  const [mutation, setMutation] = useState<Mutation>();
  const [message, setMessage] = useState<string>();
  const [reconciliationError, setReconciliationError] = useState(false);
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
  const pending = Boolean(mutation);
  const editing = mode !== 'idle';
  const readOnly = pending || floorplan?.locked === true;
  const places =
    floorplan?.shapes.filter((shape) => shape.kind === 'TABLE').reduce((total, shape) => total + shape.capacity, 0) ??
    0;
  const cancel = () => {
    setMode('idle');
    setSelectedId(undefined);
    setDraft(newDraft('TABLE'));
    setInspectorOpen(false);
  };

  const runMutation = async <T,>(kind: Mutation, operation: () => Promise<T>) => {
    if (mutationLock.current) return undefined;
    mutationLock.current = true;
    setMutation(kind);
    setMessage(undefined);
    try {
      return await operation();
    } catch (cause) {
      setMessage(mutationMessage(kind, cause));
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
    try {
      await load();
    } catch {
      setReconciliationError(true);
    } finally {
      refreshLock.current = false;
    }
  };
  const startCreating = (kind: ShapeKind) => {
    if (!floorplan || editing || readOnly) return;
    setSelectedId(undefined);
    setDraft(newDraft(kind));
    setMode('creating');
    setInspectorOpen(true);
    setMessage(undefined);
  };
  const selectShape = (shape: AdminFloorplanShape) => {
    if (editing || floorplan?.locked || pending) return;
    setSelectedId(shape.id);
    setDraft(editable(shape));
    setMode('editing');
    setInspectorOpen(true);
    setMessage(undefined);
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
    const saved = await runMutation('placing', () =>
      apiClient.adminEventPreparation.createFloorplanShape(event.clientId, event.id, input)
    );
    if (!saved) {
      try {
        const latest = await load();
        if (!latest.shapes.some((shape) => matchesAuthoritativeShape(table, shape))) return false;
      } catch {
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
    if (readOnly || editing) return;
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
      {...(selected ? { onDelete: () => void remove() } : {})}
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
            label={mutation ? 'Guardando...' : message || reconciliationError ? 'Error al guardar' : 'Guardado'}
            color={mutation ? 'warning' : message || reconciliationError ? 'error' : 'success'}
            variant="outlined"
            aria-live="polite"
          />
          <Chip label={`${floorplan.shapes.length} elementos · ${places} lugares`} variant="outlined" />
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
            <Button color="inherit" onClick={() => void refreshAfterConfirmedMutation()}>
              Actualizar plano
            </Button>
          }
        >
          El cambio se guardó, pero no pudimos actualizar el plano. La acción no se repetirá.
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
              disabled={readOnly || editing}
              onTable={() => startCreating('TABLE')}
              onZone={() => startCreating('DECORATIVE_ZONE')}
              onInventory={() => setInventoryOpen(true)}
            />
            {!compactLayout && inventoryOpen ? inventory : null}
          </Stack>
        </Paper>
        <Box sx={{ minWidth: 0 }}>
          {imageUrl ? (
            <FloorplanSurface
              floorplan={floorplan}
              imageUrl={imageUrl}
              selectedId={selectedId}
              draft={editing ? draft : undefined}
              disabled={readOnly}
              onSelect={selectShape}
              onDraftChange={setDraft}
              onCanvasPlace={pendingTables.length ? placePending : undefined}
              dock={
                !floorplan.locked && !editing ? (
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
          compact
          disabled={readOnly || editing}
          onTable={() => startCreating('TABLE')}
          onZone={() => startCreating('DECORATIVE_ZONE')}
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
  compact = false,
  disabled,
  onTable,
  onZone,
  onInventory
}: {
  compact?: boolean;
  disabled: boolean;
  onTable: () => void;
  onZone: () => void;
  onInventory: () => void;
}) {
  const buttons = [
    { label: 'Agregar mesa', icon: <TableRestaurantRounded />, action: onTable },
    { label: 'Agregar zona', icon: <AddRounded />, action: onZone },
    { label: 'Crear varias mesas', icon: <TableRestaurantRounded />, action: onInventory }
  ];
  return (
    <Stack spacing={compact ? 0 : 1} direction={compact ? 'row' : 'column'} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {!compact ? (
        <Typography variant="overline" color="text.secondary">
          Paleta
        </Typography>
      ) : null}
      {buttons.map((item) => (
        <Button
          key={item.label}
          variant="text"
          startIcon={item.icon}
          disabled={disabled}
          onClick={item.action}
          sx={{ minHeight: 44, justifyContent: 'flex-start' }}
        >
          {item.label}
        </Button>
      ))}
    </Stack>
  );
}

function ShapeInspector({
  mode,
  value,
  disabled,
  onChange,
  onSave,
  onDelete,
  onCancel
}: {
  mode: EditorMode;
  value: AdminFloorplanShapeInput;
  disabled: boolean;
  onChange: (value: AdminFloorplanShapeInput) => void;
  onSave: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const table = value.kind === 'TABLE';
  return (
    <Paper component="section" variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="overline" color="text.secondary">
            {mode === 'creating' ? 'Nuevo elemento' : table ? 'Mesa seleccionada' : 'Zona seleccionada'}
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
            {mode === 'creating' ? `Agregar ${table ? 'mesa' : 'zona'}` : 'Guardar cambios'}
          </Button>
          <Button disabled={disabled} onClick={onCancel} sx={{ minHeight: 44 }}>
            Cancelar
          </Button>
        </Stack>
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
  if (kind === 'deleting') return 'No pudimos eliminar este elemento. Inténtalo nuevamente.';
  if (kind === 'locking') return 'No pudimos finalizar la distribución. Inténtalo nuevamente.';
  if (kind === 'unlocking') return 'No pudimos habilitar la edición. Inténtalo nuevamente.';
  if (kind === 'uploading') return 'No pudimos guardar el plano. Inténtalo nuevamente.';
  return adminErrorMessage(cause).message || 'No pudimos guardar los cambios. Inténtalo nuevamente.';
}
