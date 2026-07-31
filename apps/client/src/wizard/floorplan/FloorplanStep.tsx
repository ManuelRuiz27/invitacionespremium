import type { ApiClient, Event, FloorplanShape, FloorplanShapeInput, UpdateEventInput } from '@invitaciones/api-client';
import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../wizard-utils';
import { usePrivateAssetUrl } from '../design/usePrivateAssetUrl';
import { FloorplanShapeValidationError, normalizeFloorplanShape, polygonClipPath } from './floorplan-geometry';

const newShape: FloorplanShapeInput = {
  name: 'Nueva Mesa',
  kind: 'TABLE',
  geometry: 'RECTANGLE',
  capacity: 1,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.15,
  rotation: 0
};
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
  const [floorplan, setFloorplan] = useState<Awaited<ReturnType<ApiClient['floorplan']['get']>>>();
  const [selectedId, setSelectedId] = useState<string>();
  const [shape, setShape] = useState<FloorplanShapeInput>(newShape);
  const [message, setMessage] = useState<string>();
  const refresh = useCallback(
    () =>
      apiClient.floorplan
        .get(event.id)
        .then(setFloorplan)
        .catch(() => setFloorplan(undefined)),
    [apiClient, event.id]
  );
  useEffect(() => {
    if (draft.floorplanEnabled) void refresh();
  }, [draft.floorplanEnabled, refresh]);
  const imageUrl = usePrivateAssetUrl(apiClient, event.id, floorplan?.image.fileAssetId);
  const selected = floorplan?.shapes.find((item) => item.id === selectedId);
  useEffect(() => {
    if (selected) setShape(editable(selected));
  }, [selected]);
  const valid = shape.kind === 'TABLE' ? shape.capacity > 0 : shape.capacity === 0;
  const save = async () => {
    if (!valid) {
      setMessage(
        shape.kind === 'TABLE' ? 'Una Mesa requiere capacidad positiva.' : 'Una Zona requiere capacidad cero.'
      );
      return;
    }
    try {
      const normalized = normalizeFloorplanShape(shape);
      if (selected) await apiClient.floorplan.updateShape(event.id, selected.id, normalized);
      else await apiClient.floorplan.addShape(event.id, normalized);
      setSelectedId(undefined);
      setShape(newShape);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof FloorplanShapeValidationError ? reason.message : errorMessage(reason));
    }
  };
  const pointer = (ev: React.PointerEvent, source: FloorplanShape, mode: 'move' | 'resize' = 'move') => {
    if (disabled || floorplan?.locked) return;
    setSelectedId(source.id);
    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture?.(ev.pointerId);
    const canvas = target.closest('[aria-label="Canvas del Croquis"]') as HTMLElement | null;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const startX = ev.clientX,
      startY = ev.clientY,
      start = editable(source);
    const move = (next: PointerEvent) => {
      const deltaX = (next.clientX - startX) / bounds.width;
      const deltaY = (next.clientY - startY) / bounds.height;
      const nextShape = {
        ...start,
        ...(mode === 'move'
          ? { x: start.x + deltaX, y: start.y + deltaY }
          : start.geometry === 'SQUARE' || start.geometry === 'CIRCLE'
            ? { width: start.width + Math.max(deltaX, deltaY), height: start.height + Math.max(deltaX, deltaY) }
            : { width: start.width + deltaX, height: start.height + deltaY })
      };
      try {
        setShape(normalizeFloorplanShape(nextShape));
      } catch {
        // Keep the last valid geometry while the pointer is outside the editable range.
      }
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  const capacity =
    floorplan?.shapes.filter((item) => item.kind === 'TABLE').reduce((total, item) => total + item.capacity, 0) ?? 0;
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h3">
        Croquis, Mesas y Zonas
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={draft.floorplanEnabled}
            disabled={disabled}
            onChange={(e) => onChange({ floorplanEnabled: e.target.checked })}
          />
        }
        label="Usar Croquis"
      />
      {draft.floorplanEnabled ? (
        <>
          <Typography>Capacidad total de Mesas: {capacity}</Typography>
          <Button component="label" disabled={disabled || floorplan?.locked}>
            {floorplan ? 'Sustituir imagen del Croquis' : 'Subir imagen del Croquis'}
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void apiClient.fileAssets
                    .upload(event.id, file, 'FLOORPLAN_IMAGE', 'FLOORPLAN')
                    .then((asset) =>
                      floorplan
                        ? apiClient.floorplan.replaceImage(event.id, asset.id)
                        : apiClient.floorplan.setImage(event.id, asset.id)
                    )
                    .then(setFloorplan)
                    .catch((reason) => setMessage(errorMessage(reason)));
              }}
            />
          </Button>
          <Box
            aria-label="Canvas del Croquis"
            sx={{
              position: 'relative',
              aspectRatio: '4/3',
              maxWidth: 760,
              bgcolor: 'grey.100',
              overflow: 'hidden',
              backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          >
            {floorplan?.shapes.map((item) => (
              <Box
                component="button"
                type="button"
                key={item.id}
                data-geometry={item.geometry}
                style={{
                  borderRadius: item.geometry === 'CIRCLE' ? '50%' : '0',
                  clipPath: item.geometry === 'POLYGON' ? polygonClipPath(item.polygonPoints) : undefined
                }}
                aria-label={`Seleccionar ${item.kind === 'TABLE' ? 'Mesa' : 'Zona'} ${item.name}`}
                onClick={() => setSelectedId(item.id)}
                onPointerDown={(e) => pointer(e, item)}
                sx={{
                  position: 'absolute',
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.width * 100}%`,
                  height: `${item.height * 100}%`,
                  transform: `rotate(${item.rotation}deg)`,
                  border: selectedId === item.id ? 3 : 2,
                  borderColor: item.kind === 'TABLE' ? 'primary.main' : 'secondary.main',
                  borderRadius: item.geometry === 'CIRCLE' ? '50%' : 0,
                  clipPath: item.geometry === 'POLYGON' ? polygonClipPath(item.polygonPoints) : undefined,
                  bgcolor: 'rgba(255,255,255,.55)'
                }}
              >
                {item.name}
                <Box
                  aria-label={`Redimensionar ${item.name}`}
                  onPointerDown={(pointerEvent) => {
                    pointerEvent.stopPropagation();
                    pointer(pointerEvent, item, 'resize');
                  }}
                  sx={{
                    position: 'absolute',
                    right: -7,
                    bottom: -7,
                    width: 16,
                    height: 16,
                    bgcolor: 'primary.main',
                    cursor: 'nwse-resize'
                  }}
                />
              </Box>
            ))}
          </Box>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Button
              disabled={disabled || floorplan?.locked || !floorplan}
              onClick={() => {
                setSelectedId(undefined);
                setShape(newShape);
              }}
            >
              Nueva Mesa
            </Button>
            <Button
              disabled={disabled || floorplan?.locked || !floorplan}
              onClick={() => {
                setSelectedId(undefined);
                setShape({ ...newShape, name: 'Nueva Zona', kind: 'DECORATIVE_ZONE', capacity: 0 });
              }}
            >
              Nueva Zona
            </Button>
            {floorplan ? (
              <Button
                disabled={disabled}
                onClick={() =>
                  void (
                    floorplan.locked ? apiClient.floorplan.unlock(event.id) : apiClient.floorplan.lock(event.id)
                  ).then(setFloorplan)
                }
              >
                {floorplan.locked ? 'Desbloquear Croquis' : 'Bloquear Croquis'}
              </Button>
            ) : null}
          </Stack>
          {floorplan && !floorplan.locked ? (
            <Stack spacing={1} aria-label="Propiedades de la forma">
              <Typography component="h3" variant="h4">
                {selected ? 'Editar forma' : 'Crear forma'}
              </Typography>
              <TextField
                label="Nombre"
                value={shape.name}
                onChange={(e) => setShape({ ...shape, name: e.target.value })}
              />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <TextField
                  select
                  label="Tipo"
                  value={shape.kind}
                  onChange={(e) => {
                    const kind = e.target.value as FloorplanShapeInput['kind'];
                    setShape({ ...shape, kind, capacity: kind === 'TABLE' ? Math.max(1, shape.capacity) : 0 });
                  }}
                >
                  <MenuItem value="TABLE">Mesa</MenuItem>
                  <MenuItem value="DECORATIVE_ZONE">Zona</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Geometría"
                  value={shape.geometry}
                  onChange={(e) => setShape({ ...shape, geometry: e.target.value as FloorplanShapeInput['geometry'] })}
                >
                  {['RECTANGLE', 'SQUARE', 'CIRCLE', 'POLYGON'].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  type="number"
                  label="Capacidad"
                  value={shape.capacity}
                  onChange={(e) => setShape({ ...shape, capacity: Number(e.target.value) })}
                />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                {(['x', 'y', 'width', 'height', 'rotation'] as const).map((field) => (
                  <TextField
                    key={field}
                    type="number"
                    label={field}
                    value={shape[field]}
                    disabled={field === 'height' && (shape.geometry === 'SQUARE' || shape.geometry === 'CIRCLE')}
                    onChange={(e) => setShape({ ...shape, [field]: Number(e.target.value) })}
                  />
                ))}
              </Stack>
              {shape.geometry === 'POLYGON' ? (
                <TextField
                  label="Puntos del polígono (x,y; x,y)"
                  value={(shape.polygonPoints ?? []).map((point) => `${point.x},${point.y}`).join('; ')}
                  onChange={(e) =>
                    setShape({
                      ...shape,
                      polygonPoints: e.target.value
                        .split(';')
                        .map((part) => part.trim().split(',').map(Number))
                        .filter((pair) => pair.length === 2 && pair.every(Number.isFinite))
                        .map(([x, y]) => ({ x: x!, y: y! }))
                    })
                  }
                />
              ) : null}
              <Stack direction="row">
                <Button variant="contained" disabled={!valid} onClick={() => void save()}>
                  Guardar forma
                </Button>
                {selected ? (
                  <Button
                    color="error"
                    onClick={() =>
                      void apiClient.floorplan.removeShape(event.id, selected.id).then(() => {
                        setSelectedId(undefined);
                        return refresh();
                      })
                    }
                  >
                    Eliminar forma
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          ) : null}
        </>
      ) : null}
      {message ? <Alert severity="warning">{message}</Alert> : null}
    </Stack>
  );
}
