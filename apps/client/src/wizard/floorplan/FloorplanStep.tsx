import type {
  ApiClient,
  Event,
  Floorplan,
  FloorplanShape,
  FloorplanShapeInput,
  UpdateEventInput
} from '@invitaciones/api-client';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  FormHelperText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { relativeRectStyles } from '../../shared/relative-rect';
import { errorMessage } from '../wizard-utils';
import { usePrivateAssetUrl } from '../design/usePrivateAssetUrl';
import {
  FloorplanShapeValidationError,
  normalizeFloorplanShape,
  polygonClipPath,
  screenDeltaToLocal
} from './floorplan-geometry';

type EditorMode = 'idle' | 'creating' | 'editing';
type Mutation = 'uploading' | 'saving' | 'deleting' | 'locking' | 'unlocking';
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

function visibleGeometry(geometry: Geometry): string {
  return geometryOptions.find((option) => option.value === geometry)?.label ?? 'Rectangular';
}

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
  const canvasRef = useRef<HTMLDivElement>(null);
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

  const refresh = useCallback(async () => {
    const latest = await apiClient.floorplan.get(event.id);
    setFloorplan(latest);
    return latest;
  }, [apiClient, event.id]);

  useEffect(() => {
    if (!draft.floorplanEnabled) return;
    void refresh().catch(() => setFloorplan(undefined));
  }, [draft.floorplanEnabled, refresh]);

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

  const startPointer = (
    event: React.PointerEvent<HTMLElement>,
    interaction: 'move' | 'resize' | 'vertex',
    vertexIndex?: number
  ) => {
    if (interactionDisabled || mode === 'idle') return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...shape, polygonPoints: shape.polygonPoints?.map((point) => ({ ...point })) ?? null };
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;

    const move = (next: PointerEvent) => {
      next.preventDefault();
      const screenDeltaX = next.clientX - startX;
      const screenDeltaY = next.clientY - startY;
      try {
        if (interaction === 'vertex' && vertexIndex !== undefined && start.polygonPoints) {
          const localDelta = screenDeltaToLocal(screenDeltaX, screenDeltaY, start.rotation);
          const localWidth = start.width * bounds.width;
          const localHeight = start.height * bounds.height;
          if (!localWidth || !localHeight) return;
          const points = start.polygonPoints.map((point, index) =>
            index === vertexIndex
              ? {
                  x: Math.min(1, Math.max(0, point.x + localDelta.x / localWidth)),
                  y: Math.min(1, Math.max(0, point.y + localDelta.y / localHeight))
                }
              : point
          );
          setShape(normalizeFloorplanShape({ ...start, polygonPoints: points }));
          return;
        }
        const canvasDeltaX = screenDeltaX / bounds.width;
        const canvasDeltaY = screenDeltaY / bounds.height;
        const localDelta = screenDeltaToLocal(screenDeltaX, screenDeltaY, start.rotation);
        const deltaWidth = localDelta.x / bounds.width;
        const deltaHeight = localDelta.y / bounds.height;
        const nextShape =
          interaction === 'move'
            ? { ...start, x: start.x + canvasDeltaX, y: start.y + canvasDeltaY }
            : equalSides
              ? {
                  ...start,
                  width: start.width + Math.max(deltaWidth, deltaHeight),
                  height: start.width + Math.max(deltaWidth, deltaHeight)
                }
              : { ...start, width: start.width + deltaWidth, height: start.height + deltaHeight };
        setShape(normalizeFloorplanShape(nextShape));
      } catch {
        // The last valid visual position stays visible while the pointer is outside the plan.
      }
    };
    const finish = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
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

  return (
    <Stack spacing={2.5} component="section" aria-labelledby="floorplan-title">
      <Stack spacing={0.5}>
        <Typography component="h2" variant="h3" id="floorplan-title">
          Mesas y distribución
        </Typography>
        <Typography color="text.secondary">
          Organiza las mesas y áreas de tu evento sobre el plano del lugar.
        </Typography>
      </Stack>

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

      {draft.floorplanEnabled ? (
        <Stack spacing={2.5}>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                <Button
                  component="label"
                  variant={floorplan ? 'outlined' : 'contained'}
                  disabled={disabled || operationPending || editingActive || floorplan?.locked}
                  sx={{ minHeight: 44, alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
                >
                  {mutation === 'uploading'
                    ? 'Guardando plano…'
                    : floorplan
                      ? 'Cambiar plano'
                      : 'Agregar plano del lugar'}
                  <input
                    hidden
                    type="file"
                    disabled={disabled || operationPending || editingActive || floorplan?.locked}
                    accept="image/jpeg,image/png"
                    aria-label="Seleccionar imagen del plano"
                    onChange={(event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0];
                      if (file)
                        void uploadImage(file).finally(() => {
                          input.value = '';
                        });
                    }}
                  />
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Sube una imagen del espacio para colocar las mesas y áreas del evento.
                </Typography>
              </Stack>

              <Typography sx={{ fontWeight: 700 }}>Lugares distribuidos: {distributedPlaces}</Typography>
            </Stack>
          </Paper>

          {floorplan && imageUrl ? (
            <Box
              ref={canvasRef}
              aria-label="Plano interactivo de mesas y zonas"
              sx={{
                position: 'relative',
                width: '100%',
                maxWidth: 820,
                lineHeight: 0,
                overflow: 'hidden',
                bgcolor: 'grey.100',
                outline: '1px solid',
                outlineColor: 'divider'
              }}
            >
              <Box
                component="img"
                src={imageUrl}
                alt="Plano del lugar"
                draggable={false}
                sx={{ display: 'block', width: '100%', height: 'auto' }}
              />

              {floorplan.shapes.map((item) => {
                if (mode === 'editing' && selectedId === item.id) return null;
                return (
                  <ShapeButton
                    key={item.id}
                    shape={item}
                    selected={false}
                    disabled={interactionDisabled || editingActive}
                    onClick={() => selectExisting(item)}
                  />
                );
              })}

              {mode !== 'idle' ? (
                <EditableShape
                  shape={shape}
                  disabled={interactionDisabled}
                  onMove={(event) => startPointer(event, 'move')}
                  onResize={(event) => startPointer(event, 'resize')}
                  onVertex={(event, index) => startPointer(event, 'vertex', index)}
                />
              ) : null}
            </Box>
          ) : floorplan ? (
            <Box sx={{ minHeight: 180, display: 'grid', placeItems: 'center', bgcolor: 'grey.100' }}>
              <Typography color="text.secondary">Cargando el plano…</Typography>
            </Box>
          ) : null}

          {floorplan ? (
            <Stack spacing={1.5}>
              {floorplan.locked ? (
                <Alert severity="info">
                  La distribución está finalizada. El plano permanece visible y protegido contra cambios accidentales.
                </Alert>
              ) : (
                <Typography color="text.secondary">
                  Finaliza la distribución para evitar cambios accidentales y continuar con la configuración del evento.
                </Typography>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
                {!floorplan.locked ? (
                  <>
                    <Button
                      variant="contained"
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
                      disabled={disabled || operationPending || editingActive}
                      onClick={() =>
                        void runMutation('locking', async () => {
                          setFloorplan(await apiClient.floorplan.lock(event.id));
                          cancel();
                        })
                      }
                      sx={{ minHeight: 44 }}
                    >
                      {mutation === 'locking' ? 'Finalizando…' : 'Finalizar distribución'}
                    </Button>
                  </>
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
            </Stack>
          ) : null}

          {floorplan && !floorplan.locked && mode !== 'idle' ? (
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
          ) : null}
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

function ShapeButton({
  shape,
  selected,
  disabled,
  onClick
}: {
  shape: FloorplanShape;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const kind = shape.kind === 'TABLE' ? 'Mesa' : 'Zona';
  return (
    <Box
      component="button"
      type="button"
      aria-label={`Editar ${kind.toLowerCase()} ${shape.name}`}
      disabled={disabled}
      onClick={onClick}
      sx={{
        ...relativeRectStyles(shape),
        position: 'absolute',
        p: 0,
        border: selected ? 3 : 2,
        borderStyle: selected ? 'solid' : 'dashed',
        borderColor: shape.kind === 'TABLE' ? 'primary.main' : 'secondary.main',
        bgcolor: 'transparent',
        transform: `rotate(${shape.rotation}deg)`,
        transformOrigin: 'center',
        cursor: disabled ? 'default' : 'pointer',
        '&:focus-visible': { outline: '3px solid', outlineColor: 'warning.main', outlineOffset: 3 }
      }}
    >
      <ShapeSurface shape={shape} selected={selected} />
    </Box>
  );
}

function ShapeSurface({ shape, selected }: { shape: FloorplanShapeInput; selected: boolean }) {
  const table = shape.kind === 'TABLE';
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        borderRadius: shape.geometry === 'CIRCLE' ? '50%' : 0,
        clipPath: shape.geometry === 'POLYGON' ? polygonClipPath(shape.polygonPoints) : undefined,
        bgcolor: table ? 'rgba(255,255,255,.82)' : 'rgba(255,248,225,.82)',
        color: 'text.primary'
      }}
    >
      <Stack spacing={0.25} sx={{ alignItems: 'center', lineHeight: 1.15, px: 0.5, maxWidth: '100%' }}>
        {selected ? <Chip size="small" label="Seleccionada" sx={{ height: 22 }} /> : null}
        <Typography component="span" variant="caption" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
          {shape.name || (table ? 'Nueva mesa' : 'Nueva zona')}
        </Typography>
        <Typography component="span" variant="caption" sx={{ lineHeight: 1.15 }}>
          {table ? `Mesa · ${shape.capacity} lugares` : 'Zona'}
        </Typography>
      </Stack>
    </Box>
  );
}

function EditableShape({
  shape,
  disabled,
  onMove,
  onResize,
  onVertex
}: {
  shape: FloorplanShapeInput;
  disabled: boolean;
  onMove: (event: React.PointerEvent<HTMLElement>) => void;
  onResize: (event: React.PointerEvent<HTMLElement>) => void;
  onVertex: (event: React.PointerEvent<HTMLElement>, index: number) => void;
}) {
  return (
    <Box
      role="group"
      aria-label={`${shape.kind === 'TABLE' ? 'Mesa' : 'Zona'} seleccionada ${shape.name || 'sin nombre'}`}
      sx={{
        ...relativeRectStyles(shape),
        position: 'absolute',
        transform: `rotate(${shape.rotation}deg)`,
        transformOrigin: 'center',
        border: '3px solid',
        borderColor: 'warning.dark',
        zIndex: 3
      }}
    >
      <Box
        aria-label={`Mover ${shape.kind === 'TABLE' ? 'mesa' : 'zona'} seleccionada`}
        onPointerDown={onMove}
        sx={{ position: 'absolute', inset: 0, cursor: disabled ? 'default' : 'move', touchAction: 'none' }}
      >
        <ShapeSurface shape={shape} selected />
      </Box>
      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-label={`Cambiar tamaño de ${shape.name || (shape.kind === 'TABLE' ? 'la mesa' : 'la zona')}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          onResize(event);
        }}
        sx={{
          position: 'absolute',
          right: -22,
          bottom: -22,
          width: 44,
          height: 44,
          p: 0,
          border: 0,
          bgcolor: 'transparent',
          cursor: disabled ? 'default' : 'nwse-resize',
          touchAction: 'none',
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 8,
            bottom: 8,
            width: 13,
            height: 13,
            borderRight: '4px solid',
            borderBottom: '4px solid',
            borderColor: 'warning.dark'
          },
          '&:focus-visible': { outline: '3px solid', outlineColor: 'warning.main' }
        }}
      />
      {shape.geometry === 'POLYGON'
        ? shape.polygonPoints?.map((point, index) => (
            <Box
              component="button"
              type="button"
              key={index}
              disabled={disabled}
              aria-label={`Mover punto ${index + 1} de la forma personalizada`}
              onPointerDown={(event) => {
                event.stopPropagation();
                onVertex(event, index);
              }}
              sx={{
                position: 'absolute',
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                width: 44,
                height: 44,
                p: 0,
                border: 0,
                bgcolor: 'transparent',
                transform: 'translate(-50%, -50%)',
                touchAction: 'none',
                cursor: disabled ? 'default' : 'grab',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 14,
                  borderRadius: '50%',
                  bgcolor: 'warning.dark',
                  border: '2px solid white'
                },
                '&:focus-visible': { outline: '3px solid', outlineColor: 'warning.main' }
              }}
            />
          ))
        : null}
    </Box>
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
  const actionButtonSx = { minHeight: 44 } as const;
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 } }} component="section" aria-labelledby="shape-editor-title">
      <Stack spacing={2}>
        <Stack spacing={0.5}>
          <Typography component="h3" variant="h4" id="shape-editor-title">
            {mode === 'creating' ? (table ? 'Agregar mesa' : 'Agregar zona') : table ? 'Editar mesa' : 'Editar zona'}
          </Typography>
          <Typography color="text.secondary">
            Coloca este elemento sobre el lugar correspondiente del plano y ajusta su tamaño u orientación.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Guarda o cancela los cambios actuales antes de continuar con otro elemento.
          </Typography>
        </Stack>

        <TextField
          label={table ? 'Nombre o número de mesa' : 'Nombre de la zona'}
          value={shape.name}
          disabled={disabled}
          slotProps={{ htmlInput: { maxLength: 120 } }}
          onChange={(event) => onShapeChange({ ...shape, name: event.target.value })}
          fullWidth
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            select
            label="Forma"
            value={shape.geometry}
            disabled={disabled}
            onChange={(event) => onGeometryChange(event.target.value as Geometry)}
            sx={{ minWidth: 190 }}
          >
            {geometryOptions
              .filter((option) => !option.zonesOnly || !table)
              .map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
          </TextField>
          {table ? (
            <TextField
              type="number"
              label="Número de lugares"
              value={shape.capacity}
              disabled={disabled}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              onChange={(event) => onShapeChange({ ...shape, capacity: Number(event.target.value) })}
              sx={{ minWidth: 190 }}
            />
          ) : null}
        </Stack>
        <FormHelperText>Forma actual: {visibleGeometry(shape.geometry)}</FormHelperText>

        <ControlGroup title="Mover">
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('y', -adjustmentStep)}
            sx={actionButtonSx}
          >
            Mover arriba
          </Button>
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('y', adjustmentStep)}
            sx={actionButtonSx}
          >
            Mover abajo
          </Button>
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('x', -adjustmentStep)}
            sx={actionButtonSx}
          >
            Mover a la izquierda
          </Button>
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('x', adjustmentStep)}
            sx={actionButtonSx}
          >
            Mover a la derecha
          </Button>
        </ControlGroup>

        <ControlGroup title="Cambiar tamaño">
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('width', adjustmentStep)}
            sx={actionButtonSx}
          >
            Hacer más ancho
          </Button>
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('width', -adjustmentStep)}
            sx={actionButtonSx}
          >
            Hacer más angosto
          </Button>
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('height', adjustmentStep)}
            sx={actionButtonSx}
          >
            Hacer más alto
          </Button>
          <Button
            disabled={disabled}
            variant="outlined"
            onClick={() => onAdjust('height', -adjustmentStep)}
            sx={actionButtonSx}
          >
            Hacer más bajo
          </Button>
        </ControlGroup>

        <ControlGroup title="Orientación">
          <Button disabled={disabled} variant="outlined" onClick={() => onRotate(-rotationStep)} sx={actionButtonSx}>
            Girar a la izquierda
          </Button>
          <Button disabled={disabled} variant="outlined" onClick={() => onRotate(rotationStep)} sx={actionButtonSx}>
            Girar a la derecha
          </Button>
        </ControlGroup>

        {shape.geometry === 'POLYGON' ? (
          <Typography variant="body2" color="text.secondary">
            Arrastra los puntos visibles sobre el plano para ajustar la forma personalizada.
          </Typography>
        ) : null}

        <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button variant="contained" disabled={disabled} onClick={onSave} sx={actionButtonSx}>
            {saving
              ? 'Guardando…'
              : mode === 'creating'
                ? table
                  ? 'Guardar mesa'
                  : 'Guardar zona'
                : 'Guardar cambios'}
          </Button>
          {onRemove ? (
            <Button color="error" disabled={disabled} onClick={onRemove} sx={actionButtonSx}>
              {deleting ? 'Eliminando…' : table ? 'Eliminar mesa' : 'Eliminar zona'}
            </Button>
          ) : null}
          <Button disabled={disabled} onClick={onCancel} sx={actionButtonSx}>
            Cancelar
          </Button>
        </Stack>
      </Stack>
    </Paper>
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
