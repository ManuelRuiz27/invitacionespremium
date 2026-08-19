import type {
  ApiClient,
  Event,
  Floorplan,
  FloorplanShape,
  FloorplanShapeInput,
  UpdateEventInput
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
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import RotateLeftRounded from '@mui/icons-material/RotateLeftRounded';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Drawer,
  FormControlLabel,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../wizard-utils';
import { usePrivateAssetUrl } from '../design/usePrivateAssetUrl';

type EditorMode = 'idle' | 'creating' | 'editing';
type Mutation = 'uploading' | 'saving' | 'deleting' | 'locking' | 'unlocking' | 'placing';
type Geometry = FloorplanShapeInput['geometry'];
type ShapeKind = FloorplanShapeInput['kind'];
type MutationResult<T> = { ok: true; value: T } | { ok: false };

const adjustmentStep = 0.01;
const rotationStep = 15;
const initialPolygon = [
  { x: 0.12, y: 0.12 },
  { x: 0.88, y: 0.12 },
  { x: 0.88, y: 0.88 },
  { x: 0.12, y: 0.88 }
];

const newDraft = (kind: ShapeKind): FloorplanShapeInput => ({
  name: '',
  kind,
  geometry: kind === 'TABLE' ? 'CIRCLE' : 'RECTANGLE',
  capacity: kind === 'TABLE' ? 1 : 0,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: kind === 'TABLE' ? 0.2 : 0.14,
  rotation: 0,
  polygonPoints: null
});

const editable = (shape: FloorplanShape): FloorplanShapeInput => ({
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

const geometryOptions: ReadonlyArray<{ value: Geometry; label: string; zonesOnly?: boolean }> = [
  { value: 'CIRCLE', label: 'Redonda' },
  { value: 'SQUARE', label: 'Cuadrada' },
  { value: 'RECTANGLE', label: 'Rectangular' },
  { value: 'POLYGON', label: 'Forma personalizada', zonesOnly: true }
];

function mutationError(reason: unknown, mutation: Mutation): string {
  const translated = errorMessage(reason);
  if (!translated.startsWith('No se pudo completar la operación')) return translated;
  if (mutation === 'deleting') return 'No pudimos eliminar este elemento. Inténtalo nuevamente.';
  if (mutation === 'locking') return 'No pudimos finalizar la distribución. Inténtalo nuevamente.';
  if (mutation === 'unlocking') return 'No pudimos habilitar la edición. Inténtalo nuevamente.';
  if (mutation === 'uploading') return 'No pudimos guardar el plano. Inténtalo nuevamente.';
  return 'No pudimos guardar los cambios. Inténtalo nuevamente.';
}

function geometryError(reason: FloorplanShapeValidationError, draft: FloorplanShapeInput): string {
  if (draft.geometry === 'POLYGON' && (draft.polygonPoints?.length ?? 0) < 3) {
    return 'La forma personalizada necesita al menos tres puntos.';
  }
  if (reason.message.includes('degenerado')) return 'Ajusta los puntos para formar un área visible.';
  return 'Ajusta la forma para que permanezca dentro del plano.';
}

export function FloorplanStep({
  apiClient,
  event,
  draft,
  disabled,
  onChange
}: {
  apiClient: ApiClient;
  event: Event;
  draft: UpdateEventInput;
  disabled: boolean;
  onChange: (patch: Partial<UpdateEventInput>) => void;
}) {
  const mutationLockRef = useRef(false);
  const refreshLockRef = useRef(false);
  const [floorplan, setFloorplan] = useState<Floorplan>();
  const [mode, setMode] = useState<EditorMode>('idle');
  const [selectedId, setSelectedId] = useState<string>();
  const [shape, setShape] = useState<FloorplanShapeInput>(() => newDraft('TABLE'));
  const [mutation, setMutation] = useState<Mutation>();
  const [refreshing, setRefreshing] = useState(false);
  const [reconciliationError, setReconciliationError] = useState(false);
  const [message, setMessage] = useState<string>();
  const [pendingTables, setPendingTables] = useState<PendingTable[]>([]);
  const [activePendingId, setActivePendingId] = useState<string>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const theme = useTheme();
  const compactLayout = useMediaQuery(theme.breakpoints.down('md'));

  const refresh = useCallback(async () => {
    const latest = await apiClient.floorplan.get(event.id);
    setFloorplan(latest);
    return latest;
  }, [apiClient, event.id]);

  useEffect(() => {
    if (!draft.floorplanEnabled) return;
    void refresh().catch(() => setFloorplan(undefined));
  }, [draft.floorplanEnabled, refresh]);

  useEffect(() => {
    if (pendingTables.length === 0) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [pendingTables.length]);

  const imageUrl = usePrivateAssetUrl(apiClient, event.id, floorplan?.image.fileAssetId);
  const selected = floorplan?.shapes.find((item) => item.id === selectedId);
  const editingActive = mode !== 'idle';
  const operationPending = mutation !== undefined || refreshing;
  const interactionDisabled = disabled || operationPending || floorplan?.locked === true;
  const equalSides = shape.geometry === 'SQUARE' || shape.geometry === 'CIRCLE';
  const distributedPlaces =
    floorplan?.shapes.filter((item) => item.kind === 'TABLE').reduce((total, item) => total + item.capacity, 0) ?? 0;

  const cancel = () => {
    setMode('idle');
    setSelectedId(undefined);
    setShape(newDraft('TABLE'));
    setMessage(undefined);
  };

  const startCreating = (kind: ShapeKind) => {
    if (editingActive || interactionDisabled) return;
    setSelectedId(undefined);
    setShape(newDraft(kind));
    setMode('creating');
    setMessage(undefined);
  };

  const selectExisting = (item: FloorplanShape) => {
    if (interactionDisabled || editingActive) return;
    setSelectedId(item.id);
    setShape(editable(item));
    setMode('editing');
    setMessage(undefined);
  };

  const runMutation = async <T,>(nextMutation: Mutation, work: () => Promise<T>): Promise<MutationResult<T>> => {
    if (mutationLockRef.current) return { ok: false };
    mutationLockRef.current = true;
    setMutation(nextMutation);
    setMessage(undefined);
    try {
      return { ok: true, value: await work() };
    } catch (reason) {
      setMessage(mutationError(reason, nextMutation));
      return { ok: false };
    } finally {
      mutationLockRef.current = false;
      setMutation(undefined);
    }
  };

  const refreshAfterConfirmedMutation = async () => {
    if (refreshLockRef.current) return;
    refreshLockRef.current = true;
    setRefreshing(true);
    setReconciliationError(false);
    try {
      await refresh();
    } catch {
      setReconciliationError(true);
    } finally {
      refreshLockRef.current = false;
      setRefreshing(false);
    }
  };

  const changeGeometry = (geometry: Geometry) => {
    setShape((current) => {
      const next = { ...current, geometry };
      if (geometry === 'SQUARE' || geometry === 'CIRCLE') {
        return normalizeFloorplanShape({ ...next, height: current.width, polygonPoints: null });
      }
      if (geometry === 'POLYGON') return { ...next, polygonPoints: initialPolygon.map((point) => ({ ...point })) };
      return { ...next, polygonPoints: null };
    });
  };

  const adjust = (property: 'x' | 'y' | 'width' | 'height', amount: number) => {
    setShape((current) => {
      const next = { ...current, [property]: current[property] + amount };
      if (equalSides && (property === 'width' || property === 'height')) {
        const side = property === 'width' ? next.width : next.height;
        next.width = side;
        next.height = side;
      }
      return normalizeFloorplanShape(next);
    });
  };

  const rotate = (amount: number) => {
    setShape((current) => normalizeFloorplanShape({ ...current, rotation: current.rotation + amount }));
  };

  const createInventory = (configurations: readonly InventoryConfiguration[]) => {
    if (!floorplan || editingActive || interactionDisabled) return;
    const requested = configurations.reduce((total, configuration) => total + configuration.quantity, 0);
    if (pendingTables.length + requested > 200) {
      setMessage('El inventario puede contener hasta 200 mesas pendientes.');
      return;
    }
    const reservedNames = [...floorplan.shapes, ...pendingTables.map((table) => table.input)];
    const created = createPendingTables(configurations, reservedNames);
    setPendingTables((current) => [...current, ...created]);
    setActivePendingId((current) => current ?? created[0]?.temporaryId);
    setMessage(undefined);
  };

  const persistPendingTable = async (table: PendingTable, point: { x: number; y: number }, refreshAfter = true) => {
    const input = placePendingTable(table, point);
    const result = await runMutation('placing', () => apiClient.floorplan.addShape(event.id, input));
    if (!result.ok) {
      try {
        const latest = await refresh();
        const reconciled = latest.shapes.find((candidate) => matchesAuthoritativeShape(table, candidate));
        if (!reconciled) return false;
        setPendingTables((current) => current.filter((candidate) => candidate.temporaryId !== table.temporaryId));
        setActivePendingId((current) => (current === table.temporaryId ? undefined : current));
        setMessage(undefined);
        return true;
      } catch {
        return false;
      }
    }
    setFloorplan((current) => (current ? { ...current, shapes: [...current.shapes, result.value] } : current));
    setPendingTables((current) => current.filter((candidate) => candidate.temporaryId !== table.temporaryId));
    setActivePendingId((current) => (current === table.temporaryId ? undefined : current));
    if (refreshAfter) await refreshAfterConfirmedMutation();
    return true;
  };

  const placePending = (point: { x: number; y: number }, requestedId?: string) => {
    if (interactionDisabled || editingActive) return;
    const id = requestedId ?? activePendingId;
    const table = pendingTables.find((candidate) => candidate.temporaryId === id);
    if (table) void persistPendingTable(table, point);
  };

  const autoPlace = async () => {
    if (interactionDisabled || editingActive || pendingTables.length === 0) return;
    const snapshot = [...pendingTables];
    let placed = 0;
    for (const [index, table] of snapshot.entries()) {
      if (!(await persistPendingTable(table, autoPlacePoint(index, snapshot.length), false))) break;
      placed += 1;
    }
    if (placed > 0) await refreshAfterConfirmedMutation();
  };

  const finalize = () => {
    if (pendingTables.length > 0) {
      setMessage(
        `Todavía hay ${pendingTables.length} ${pendingTables.length === 1 ? 'mesa pendiente' : 'mesas pendientes'}. Colócalas o conserva el inventario para continuar después.`
      );
      return;
    }
    void runMutation('locking', async () => {
      setFloorplan(await apiClient.floorplan.lock(event.id));
      cancel();
    });
  };

  const save = async () => {
    if (!shape.name.trim()) {
      setMessage(shape.kind === 'TABLE' ? 'Escribe el nombre o número de la mesa.' : 'Escribe el nombre de la zona.');
      return;
    }
    if (shape.kind === 'TABLE' && (!Number.isInteger(shape.capacity) || shape.capacity <= 0)) {
      setMessage('Indica un número de lugares mayor a cero.');
      return;
    }
    let normalized: FloorplanShapeInput;
    try {
      normalized = normalizeFloorplanShape({ ...shape, name: shape.name.trim() });
    } catch (reason) {
      setMessage(
        reason instanceof FloorplanShapeValidationError
          ? geometryError(reason, shape)
          : 'No pudimos colocar este elemento en esa posición.'
      );
      return;
    }
    const result = await runMutation('saving', () =>
      selected
        ? apiClient.floorplan.updateShape(event.id, selected.id, normalized)
        : apiClient.floorplan.addShape(event.id, normalized)
    );
    if (!result.ok) return;
    setFloorplan((current) => {
      if (!current) return current;
      return {
        ...current,
        shapes: selected
          ? current.shapes.map((item) => (item.id === selected.id ? result.value : item))
          : [...current.shapes, result.value]
      };
    });
    cancel();
    await refreshAfterConfirmedMutation();
  };

  const remove = async () => {
    if (!selected) return;
    const removedId = selected.id;
    const result = await runMutation('deleting', () => apiClient.floorplan.removeShape(event.id, removedId));
    if (!result.ok) return;
    setFloorplan((current) =>
      current ? { ...current, shapes: current.shapes.filter((item) => item.id !== removedId) } : current
    );
    cancel();
    await refreshAfterConfirmedMutation();
  };

  const uploadImage = async (file: File) => {
    if (editingActive || interactionDisabled) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessage('Selecciona una imagen JPG o PNG.');
      return;
    }
    await runMutation('uploading', async () => {
      const asset = await apiClient.fileAssets.upload(event.id, file, 'FLOORPLAN_IMAGE', 'FLOORPLAN');
      const latest = floorplan
        ? await apiClient.floorplan.replaceImage(event.id, asset.id)
        : await apiClient.floorplan.setImage(event.id, asset.id);
      setFloorplan(latest);
      cancel();
    });
  };

  const inventory =
    floorplan && !floorplan.locked && !editingActive ? (
      <FloorplanInventory
        disabled={disabled || operationPending}
        maxTables={200 - pendingTables.length}
        onCreate={createInventory}
      />
    ) : null;
  const inspector =
    floorplan && !floorplan.locked && mode !== 'idle' ? (
      <ShapeEditor
        mode={mode}
        shape={shape}
        disabled={disabled || operationPending}
        onShapeChange={setShape}
        onGeometryChange={changeGeometry}
        onAdjust={adjust}
        onRotate={rotate}
        onSave={() => void save()}
        onRemove={selected ? () => void remove() : undefined}
        onCancel={cancel}
        saving={mutation === 'saving'}
        deleting={mutation === 'deleting'}
      />
    ) : null;

  return (
    <Stack spacing={2} component="section" aria-labelledby="floorplan-title">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography component="h2" variant="h4" id="floorplan-title">
            Mesas y distribución
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Organiza las mesas y áreas de tu evento sobre el plano del lugar.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={draft.floorplanEnabled}
              disabled={disabled || operationPending || editingActive}
              onChange={(event) => {
                if (!editingActive) onChange({ floorplanEnabled: event.target.checked });
              }}
            />
          }
          label="Usar distribución de mesas"
        />
      </Stack>

      {draft.floorplanEnabled ? (
        <Stack spacing={2}>
          <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              component="label"
              variant={floorplan ? 'outlined' : 'contained'}
              disabled={disabled || operationPending || editingActive || floorplan?.locked}
              sx={{ minHeight: 44 }}
            >
              {mutation === 'uploading' ? 'Guardando plano…' : floorplan ? 'Cambiar plano' : 'Agregar plano del lugar'}
              <input
                hidden
                type="file"
                disabled={disabled || operationPending || editingActive || floorplan?.locked}
                accept="image/jpeg,image/png"
                aria-label="Seleccionar imagen del plano"
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (file) void uploadImage(file).finally(() => (input.value = ''));
                }}
              />
            </Button>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Lugares distribuidos: {distributedPlaces}
            </Typography>
            {compactLayout && inventory ? (
              <Button variant="outlined" onClick={() => setLibraryOpen(true)} sx={{ minHeight: 44 }}>
                Abrir biblioteca
              </Button>
            ) : null}
          </Stack>

          {floorplan ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'minmax(0, 1fr)',
                  md: inspector ? '240px minmax(0, 1fr) 280px' : '240px minmax(0, 1fr)'
                },
                gap: 2,
                alignItems: 'start'
              }}
            >
              {!compactLayout ? <Box component="aside">{inventory}</Box> : null}
              <Box sx={{ minWidth: 0 }}>
                {imageUrl ? (
                  <FloorplanSurface
                    floorplan={floorplan}
                    imageUrl={imageUrl}
                    selectedId={selectedId}
                    draft={mode === 'idle' ? undefined : shape}
                    disabled={interactionDisabled}
                    onSelect={selectExisting}
                    onDraftChange={setShape}
                    onCanvasPlace={pendingTables.length > 0 ? placePending : undefined}
                    dock={
                      !floorplan.locked && !editingActive ? (
                        <FloorplanTray
                          tables={pendingTables}
                          activeId={activePendingId}
                          disabled={disabled || operationPending}
                          onChoose={(id) => setActivePendingId((current) => (current === id ? undefined : id))}
                          onAutoPlace={() => void autoPlace()}
                        />
                      ) : undefined
                    }
                  />
                ) : (
                  <Paper variant="outlined" sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
                    <Typography color="text.secondary">Cargando el plano…</Typography>
                  </Paper>
                )}
              </Box>
              {!compactLayout && inspector ? <Box component="aside">{inspector}</Box> : null}
            </Box>
          ) : null}

          {floorplan ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              {floorplan.locked ? (
                <Alert severity="info" sx={{ flex: 1 }}>
                  Distribución finalizada y protegida contra cambios accidentales.
                </Alert>
              ) : (
                <Typography
                  variant="body2"
                  color={pendingTables.length ? 'warning.main' : 'text.secondary'}
                  sx={{ flex: 1 }}
                >
                  {pendingTables.length
                    ? `Falta colocar ${pendingTables.length} ${pendingTables.length === 1 ? 'mesa' : 'mesas'} antes de finalizar.`
                    : 'Todo listo para finalizar cuando termines de revisar el croquis.'}
                </Typography>
              )}
              {!floorplan.locked ? (
                <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
                  <Button
                    variant="outlined"
                    disabled={disabled || operationPending || editingActive}
                    onClick={() => startCreating('TABLE')}
                    sx={{ minHeight: 44 }}
                  >
                    Agregar mesa
                  </Button>
                  <Button
                    variant="outlined"
                    disabled={disabled || operationPending || editingActive}
                    onClick={() => startCreating('DECORATIVE_ZONE')}
                    sx={{ minHeight: 44 }}
                  >
                    Agregar zona
                  </Button>
                  <Button
                    variant="contained"
                    disabled={disabled || operationPending || editingActive || pendingTables.length > 0}
                    aria-describedby={pendingTables.length ? 'floorplan-finalize-help' : undefined}
                    onClick={finalize}
                    sx={{ minHeight: 44 }}
                  >
                    {mutation === 'locking' ? 'Finalizando…' : 'Finalizar distribución'}
                  </Button>
                  {pendingTables.length ? (
                    <Typography id="floorplan-finalize-help" variant="caption" sx={{ alignSelf: 'center' }}>
                      El inventario pendiente se conserva.
                    </Typography>
                  ) : null}
                </Stack>
              ) : (
                <Button
                  variant="outlined"
                  disabled={disabled || operationPending}
                  onClick={() =>
                    void runMutation('unlocking', async () => {
                      setFloorplan(await apiClient.floorplan.unlock(event.id));
                      cancel();
                    })
                  }
                  sx={{ minHeight: 44 }}
                >
                  {mutation === 'unlocking' ? 'Habilitando edición…' : 'Editar distribución'}
                </Button>
              )}
            </Stack>
          ) : null}

          <Drawer
            anchor="bottom"
            open={compactLayout && libraryOpen}
            onClose={() => setLibraryOpen(false)}
            slotProps={{ paper: { sx: { maxHeight: '82vh', borderRadius: '20px 20px 0 0', p: 2 } } }}
          >
            {inventory}
          </Drawer>
          <Drawer
            anchor="bottom"
            open={compactLayout && Boolean(inspector)}
            onClose={cancel}
            slotProps={{
              paper: {
                sx: {
                  maxHeight: '86vh',
                  borderRadius: '22px 22px 0 0',
                  bgcolor: 'transparent',
                  boxShadow: 'none',
                  '& > section': { borderRadius: '22px 22px 0 0', borderBottom: 0, p: 2 }
                }
              }
            }}
          >
            {inspector}
          </Drawer>
        </Stack>
      ) : null}

      {message ? (
        <Alert severity="warning" aria-live="assertive">
          {message}
        </Alert>
      ) : null}

      {reconciliationError ? (
        <Alert
          severity="warning"
          aria-live="assertive"
          action={
            <Button
              color="inherit"
              size="small"
              disabled={refreshing || editingActive}
              onClick={() => void refreshAfterConfirmedMutation()}
            >
              {refreshing ? 'Actualizando…' : 'Actualizar plano'}
            </Button>
          }
        >
          Los cambios se guardaron, pero no pudimos actualizar el plano. Vuelve a cargar la información.
        </Alert>
      ) : null}
    </Stack>
  );
}

function ShapeEditor({
  mode,
  shape,
  disabled,
  onShapeChange,
  onGeometryChange,
  onAdjust,
  onRotate,
  onSave,
  onRemove,
  onCancel,
  saving,
  deleting
}: {
  mode: EditorMode;
  shape: FloorplanShapeInput;
  disabled: boolean;
  onShapeChange: (shape: FloorplanShapeInput) => void;
  onGeometryChange: (geometry: Geometry) => void;
  onAdjust: (property: 'x' | 'y' | 'width' | 'height', amount: number) => void;
  onRotate: (amount: number) => void;
  onSave: () => void;
  onRemove?: (() => void) | undefined;
  onCancel: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const table = shape.kind === 'TABLE';
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement>();
  const saveLabel = mode === 'creating' ? (table ? 'Guardar mesa' : 'Guardar zona') : 'Guardar cambios';
  const precisionButtonSx = { minHeight: 44, borderRadius: 2, px: 1 } as const;
  return (
    <Box
      component="section"
      aria-labelledby="shape-editor-title"
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'rgba(255, 254, 251, 0.88)',
        boxShadow: '0 12px 36px rgba(23, 35, 60, 0.07)',
        backdropFilter: 'blur(16px)',
        p: 1.5
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: shape.geometry === 'CIRCLE' ? '50%' : shape.geometry === 'RECTANGLE' ? 1.5 : 1,
              border: '2px solid',
              borderColor: table ? 'primary.main' : 'warning.main',
              bgcolor: table ? 'rgba(49, 87, 200, 0.08)' : 'rgba(167, 101, 16, 0.12)',
              transform: `rotate(${shape.rotation}deg)`,
              transition: 'transform 160ms ease-out'
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h3" variant="overline" color="text.secondary" id="shape-editor-title">
              {mode === 'creating' ? 'Nuevo sticker' : table ? 'Mesa seleccionada' : 'Zona seleccionada'}
            </Typography>
            <InputBase
              value={shape.name}
              disabled={disabled}
              placeholder={table ? 'Nombre o número' : 'Nombre de zona'}
              inputProps={{
                'aria-label': table ? 'Nombre o número de mesa' : 'Nombre de la zona',
                maxLength: 120
              }}
              onChange={(event) => onShapeChange({ ...shape, name: event.target.value })}
              sx={{
                width: '100%',
                mt: -0.35,
                fontSize: '1.08rem',
                fontWeight: 760,
                letterSpacing: '-0.02em',
                '& input': { p: 0, borderBottom: '1px solid transparent' },
                '& input:hover': { borderColor: 'divider' },
                '& input:focus': { borderColor: 'primary.main' }
              }}
            />
          </Box>
          {onRemove ? (
            <IconButton
              aria-label="Más acciones"
              disabled={disabled}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{ width: 44, height: 44, borderRadius: 2 }}
            >
              <MoreHorizRounded />
            </IconButton>
          ) : null}
        </Stack>

        <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
          <Typography component="legend" variant="caption" color="text.secondary" sx={{ mb: 0.75 }}>
            Forma
          </Typography>
          <Box
            role="group"
            aria-label="Forma"
            sx={{ display: 'grid', gridTemplateColumns: `repeat(${table ? 3 : 4}, minmax(0, 1fr))`, gap: 0.5 }}
          >
            {geometryOptions
              .filter((option) => !option.zonesOnly || !table)
              .map((option) => (
                <GeometrySegment
                  key={option.value}
                  geometry={option.value}
                  label={option.label}
                  selected={shape.geometry === option.value}
                  disabled={disabled}
                  onClick={() => onGeometryChange(option.value)}
                />
              ))}
          </Box>
        </Box>

        {table ? (
          <PropertyRow label="Lugares">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 999,
                p: 0.25
              }}
            >
              <IconButton
                aria-label="Reducir número de lugares"
                disabled={disabled || shape.capacity <= 1}
                onClick={() => onShapeChange({ ...shape, capacity: Math.max(1, shape.capacity - 1) })}
                sx={{ width: 44, height: 44 }}
              >
                <RemoveRounded fontSize="small" />
              </IconButton>
              <Box
                component="input"
                type="number"
                aria-label="Número de lugares"
                value={shape.capacity}
                min={1}
                step={1}
                disabled={disabled}
                onChange={(event) => onShapeChange({ ...shape, capacity: Number(event.currentTarget.value) })}
                sx={{
                  width: 42,
                  border: 0,
                  outline: 0,
                  bgcolor: 'transparent',
                  color: 'text.primary',
                  textAlign: 'center',
                  font: 'inherit',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  '&::-webkit-inner-spin-button': { display: 'none' }
                }}
              />
              <IconButton
                aria-label="Aumentar número de lugares"
                disabled={disabled}
                onClick={() => onShapeChange({ ...shape, capacity: shape.capacity + 1 })}
                sx={{ width: 44, height: 44 }}
              >
                <AddRounded fontSize="small" />
              </IconButton>
            </Box>
          </PropertyRow>
        ) : null}

        <PropertyRow label="Rotación">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 999,
              p: 0.25
            }}
          >
            <IconButton
              aria-label="Girar a la izquierda"
              disabled={disabled}
              onClick={() => onRotate(-rotationStep)}
              sx={{ width: 44, height: 44 }}
            >
              <RotateLeftRounded fontSize="small" />
            </IconButton>
            <Typography
              component="output"
              aria-label="Rotación actual"
              sx={{ minWidth: 44, textAlign: 'center', fontWeight: 750 }}
            >
              {Math.round(shape.rotation)}°
            </Typography>
            <IconButton
              aria-label="Girar a la derecha"
              disabled={disabled}
              onClick={() => onRotate(rotationStep)}
              sx={{ width: 44, height: 44 }}
            >
              <RotateRightRounded fontSize="small" />
            </IconButton>
          </Box>
        </PropertyRow>

        <Box component="details" sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography
            component="summary"
            variant="caption"
            color="text.secondary"
            sx={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 700 }}
          >
            Ajustes precisos
          </Typography>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <ControlGroup title="Mover">
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('y', -adjustmentStep)}
                sx={precisionButtonSx}
              >
                Mover arriba
              </Button>
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('y', adjustmentStep)}
                sx={precisionButtonSx}
              >
                Mover abajo
              </Button>
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('x', -adjustmentStep)}
                sx={precisionButtonSx}
              >
                Mover a la izquierda
              </Button>
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('x', adjustmentStep)}
                sx={precisionButtonSx}
              >
                Mover a la derecha
              </Button>
            </ControlGroup>

            <ControlGroup title="Cambiar tamaño">
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('width', adjustmentStep)}
                sx={precisionButtonSx}
              >
                Hacer más ancho
              </Button>
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('width', -adjustmentStep)}
                sx={precisionButtonSx}
              >
                Hacer más angosto
              </Button>
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('height', adjustmentStep)}
                sx={precisionButtonSx}
              >
                Hacer más alto
              </Button>
              <Button
                disabled={disabled}
                variant="text"
                onClick={() => onAdjust('height', -adjustmentStep)}
                sx={precisionButtonSx}
              >
                Hacer más bajo
              </Button>
            </ControlGroup>
          </Stack>
        </Box>

        {shape.geometry === 'POLYGON' ? (
          <Typography variant="body2" color="text.secondary">
            Arrastra los puntos visibles sobre el plano para ajustar la forma personalizada.
          </Typography>
        ) : null}

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button
            variant="contained"
            aria-label={saveLabel}
            startIcon={<CheckRounded />}
            disabled={disabled}
            onClick={onSave}
            sx={{ minHeight: 44, flex: 1, borderRadius: 999, boxShadow: 'none' }}
          >
            {saving ? 'Guardando…' : mode === 'creating' ? 'Agregar' : 'Listo'}
          </Button>
          <IconButton
            aria-label="Cancelar"
            disabled={disabled}
            onClick={onCancel}
            sx={{ width: 44, height: 44, border: '1px solid', borderColor: 'divider' }}
          >
            <CloseRounded />
          </IconButton>
        </Stack>
      </Stack>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(undefined)}
        slotProps={{ paper: { sx: { borderRadius: 2, mt: 0.5, minWidth: 190 } } }}
      >
        {onRemove ? (
          <MenuItem
            disabled={disabled}
            onClick={() => {
              setMenuAnchor(undefined);
              onRemove();
            }}
            sx={{ minHeight: 44, color: 'error.main', gap: 1 }}
          >
            <DeleteOutlineRounded fontSize="small" />
            {deleting ? 'Eliminando…' : table ? 'Eliminar mesa' : 'Eliminar zona'}
          </MenuItem>
        ) : null}
      </Menu>
    </Box>
  );
}

function GeometrySegment({
  geometry,
  label,
  selected,
  disabled,
  onClick
}: {
  geometry: Geometry;
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      aria-label={`Forma ${label}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      sx={{
        minWidth: 0,
        minHeight: 58,
        borderRadius: 2,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'rgba(49, 87, 200, 0.08)' : 'transparent',
        color: selected ? 'primary.dark' : 'text.secondary',
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 0.35,
        transition: 'background-color 140ms ease, border-color 140ms ease, transform 140ms ease',
        '&:hover': { bgcolor: selected ? 'rgba(49, 87, 200, 0.11)' : 'rgba(23, 35, 60, 0.035)' },
        '&:active': { transform: 'scale(0.97)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 }
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          width: geometry === 'RECTANGLE' ? 26 : 20,
          height: geometry === 'RECTANGLE' ? 16 : 20,
          borderRadius: geometry === 'CIRCLE' ? '50%' : geometry === 'POLYGON' ? '45% 55% 38% 62%' : 0.75,
          border: '2px solid currentColor',
          transform: geometry === 'POLYGON' ? 'rotate(18deg)' : undefined
        }}
      />
      <Typography component="span" variant="caption" sx={{ fontSize: '0.66rem', fontWeight: 750 }}>
        {label.replace('Forma ', '')}
      </Typography>
    </ButtonBase>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      {children}
    </Stack>
  );
}

function ControlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack spacing={1} component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
      <Typography component="legend" variant="subtitle2">
        {title}
      </Typography>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
        {children}
      </Stack>
    </Stack>
  );
}
