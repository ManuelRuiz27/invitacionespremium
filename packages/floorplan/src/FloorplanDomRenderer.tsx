import type { Floorplan, FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import { projectAspectAwareRect, relativeRectStyles, useElementSize } from '@invitaciones/ui';
import type { RenderedSize } from '@invitaciones/ui';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeFloorplanShape, polygonClipPath, screenDeltaToLocal } from './floorplan-geometry';
import { hasEqualPhysicalSides, stagePointToNormalized } from './floorplan-scene';
import { contrastingText, stickerColor } from './floorplan-sticker-style';
import { visualSeats } from './floorplan-visual-seats';

export interface FloorplanRendererProps {
  floorplan: Omit<Floorplan, 'seatingMode' | 'seats'> & Pick<Partial<Floorplan>, 'seatingMode' | 'seats'>;
  imageUrl: string;
  selectedId?: string | undefined;
  draft?: FloorplanShapeInput | undefined;
  disabled: boolean;
  showSeats: boolean;
  snap: boolean;
  panEnabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  onSelect: (shape: FloorplanShape) => void;
  onDraftChange: (shape: FloorplanShapeInput) => void;
  onCanvasPlace?: ((point: { x: number; y: number }, pendingId?: string) => void) | undefined;
  selectedSeatId?: string | undefined;
  onSeatSelect?: ((seatId: string) => void) | undefined;
}

export function FloorplanDomRenderer(props: FloorplanRendererProps) {
  const ownerRef = useRef<HTMLDivElement>(null);
  const [measureOwner, ownerSize] = useElementSize<HTMLDivElement>();
  const setOwnerRef = useCallback(
    (node: HTMLDivElement | null) => {
      ownerRef.current = node;
      measureOwner(node);
    },
    [measureOwner]
  );

  const placeFromEvent = (clientX: number, clientY: number, pendingId?: string) => {
    if (props.disabled) return;
    const bounds = ownerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    props.onCanvasPlace?.(stagePointToNormalized(clientX, clientY, bounds), pendingId);
  };

  return (
    <Box
      ref={setOwnerRef}
      aria-label="Plano interactivo de mesas y zonas"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        placeFromEvent(event.clientX, event.clientY);
      }}
      onDragOver={(event) => {
        if (props.disabled || !props.onCanvasPlace) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const pendingId = event.dataTransfer.getData('application/x-floorplan-pending-table');
        if (pendingId) placeFromEvent(event.clientX, event.clientY, pendingId);
      }}
      sx={{
        position: 'relative',
        width: '100%',
        lineHeight: 0,
        overflow: 'hidden',
        bgcolor: 'grey.100',
        outline: '1px solid',
        outlineColor: 'divider'
      }}
    >
      <Box
        component="img"
        src={props.imageUrl}
        alt="Plano del lugar"
        draggable={false}
        sx={{ display: 'block', width: '100%', height: 'auto' }}
      />
      {props.floorplan.shapes.map((shape) => {
        if (props.draft && props.selectedId === shape.id) return null;
        return (
          <ShapeButton
            key={shape.id}
            shape={shape}
            renderedSize={ownerSize}
            disabled={props.disabled || Boolean(props.draft)}
            readOnly={props.readOnly}
            showSeats={props.showSeats}
            onClick={() => props.onSelect(shape)}
          />
        );
      })}
      {props.floorplan.seatingMode === 'SEAT'
        ? (props.floorplan.seats ?? []).map((seat) => (
            <Box
              component="button"
              type="button"
              key={seat.id}
              aria-label={`Lugar ${seat.label}${seat.isBlocked ? ', bloqueado' : seat.occupied ? ', ocupado' : ', disponible'}`}
              onClick={() => props.onSeatSelect?.(seat.id)}
              disabled={props.disabled}
              sx={{ position: 'absolute', left: `${seat.x * 100}%`, top: `${seat.y * 100}%`, transform: 'translate(-50%, -50%)', width: 28, height: 28, borderRadius: '50%', border: 2, borderColor: props.selectedSeatId === seat.id ? 'warning.main' : seat.isBlocked ? 'grey.600' : seat.occupied ? 'primary.main' : 'success.main', bgcolor: seat.isBlocked ? 'grey.300' : seat.occupied ? 'primary.light' : 'background.paper', color: 'text.primary', fontSize: 11, fontWeight: 700, zIndex: 3, cursor: props.disabled ? 'default' : 'pointer' }}
            >
              {seat.label}
            </Box>
          ))
        : null}
      {props.draft ? (
        <EditableShape
          shape={props.draft}
          renderedSize={ownerSize}
          disabled={props.disabled}
          snap={props.snap}
          ownerRef={ownerRef}
          showSeats={props.showSeats}
          onChange={props.onDraftChange}
        />
      ) : null}
    </Box>
  );
}

function ShapeButton({
  shape,
  renderedSize,
  disabled,
  readOnly,
  showSeats,
  onClick
}: {
  shape: FloorplanShape;
  renderedSize: RenderedSize;
  disabled: boolean;
  readOnly?: boolean | undefined;
  showSeats: boolean;
  onClick: () => void;
}) {
  const kind = shape.kind === 'TABLE' ? 'Mesa' : 'Zona';
  return (
    <Box
      component="button"
      type="button"
      aria-label={`${readOnly ? 'Seleccionar' : 'Editar'} ${kind.toLowerCase()} ${shape.name}`}
      disabled={disabled}
      onClick={onClick}
      sx={{
        ...relativeRectStyles(projectAspectAwareRect(shape, renderedSize, hasEqualPhysicalSides(shape.geometry))),
        position: 'absolute',
        p: 0,
        border: 2,
        borderStyle: 'solid',
        borderColor: shape.kind === 'TABLE' ? 'primary.dark' : 'warning.dark',
        bgcolor: 'transparent',
        transform: `rotate(${shape.rotation}deg)`,
        transformOrigin: 'center',
        cursor: disabled ? 'default' : 'pointer',
        overflow: 'visible',
        '&:focus-visible': { outline: '3px solid', outlineColor: 'warning.main', outlineOffset: 3 }
      }}
    >
      <ShapeSurface shape={shape} selected={false} showSeats={showSeats} colorKey={shape.id} />
    </Box>
  );
}

function ShapeSurface({
  shape,
  selected,
  showSeats,
  colorKey
}: {
  shape: FloorplanShapeInput;
  selected: boolean;
  showSeats: boolean;
  colorKey: string;
}) {
  const table = shape.kind === 'TABLE';
  const background = stickerColor(colorKey, !table);
  const seats = table && showSeats ? visualSeats(shape.geometry, shape.capacity, 100, 100, 10) : [];
  return (
    <>
      {seats.map((seat, index) => (
        <Box
          key={index}
          aria-hidden="true"
          sx={{
            position: 'absolute',
            left: `${seat.x}%`,
            top: `${seat.y}%`,
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: background,
            border: '1px solid white',
            transform: 'translate(-50%, -50%)'
          }}
        />
      ))}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          borderRadius: shape.geometry === 'CIRCLE' ? '50%' : 1,
          clipPath: shape.geometry === 'POLYGON' ? polygonClipPath(shape.polygonPoints) : undefined,
          bgcolor: background,
          color: contrastingText(background)
        }}
      >
        <Stack spacing={0.25} sx={{ alignItems: 'center', lineHeight: 1.15, px: 0.5, maxWidth: '100%' }}>
          {selected ? <Chip size="small" label="Seleccionada" sx={{ height: 22 }} /> : null}
          <Typography component="span" variant="caption" sx={{ fontWeight: 800, lineHeight: 1.15, color: 'inherit' }}>
            {shape.name || (table ? 'Nueva mesa' : 'Nueva zona')}
          </Typography>
          <Typography component="span" variant="caption" sx={{ lineHeight: 1.15, color: 'inherit' }}>
            {table ? `${shape.capacity} lugares` : 'Zona'}
          </Typography>
        </Stack>
      </Box>
    </>
  );
}

function EditableShape({
  shape,
  renderedSize,
  disabled,
  snap,
  ownerRef,
  showSeats,
  onChange
}: {
  shape: FloorplanShapeInput;
  renderedSize: RenderedSize;
  disabled: boolean;
  snap: boolean;
  ownerRef: React.RefObject<HTMLDivElement | null>;
  showSeats: boolean;
  onChange: (shape: FloorplanShapeInput) => void;
}) {
  const [preview, setPreview] = useState(shape);
  const interactingRef = useRef(false);

  useEffect(() => {
    if (!interactingRef.current) setPreview(shape);
  }, [shape]);

  const startPointer = (
    event: React.PointerEvent<HTMLElement>,
    interaction: 'move' | 'resize' | 'vertex',
    vertexIndex?: number
  ) => {
    if (disabled) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...preview, polygonPoints: preview.polygonPoints?.map((point) => ({ ...point })) ?? null };
    const bounds = ownerRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    interactingRef.current = true;
    let finalShape: FloorplanShapeInput = start;
    const move = (next: PointerEvent) => {
      next.preventDefault();
      const screenDeltaX = next.clientX - startX;
      const screenDeltaY = next.clientY - startY;
      try {
        if (interaction === 'vertex' && vertexIndex !== undefined && start.polygonPoints) {
          const localDelta = screenDeltaToLocal(screenDeltaX, screenDeltaY, start.rotation);
          const localWidth = start.width * bounds.width;
          const localHeight = start.height * bounds.height;
          const points = start.polygonPoints.map((point, index) =>
            index === vertexIndex
              ? {
                  x: Math.min(1, Math.max(0, point.x + localDelta.x / localWidth)),
                  y: Math.min(1, Math.max(0, point.y + localDelta.y / localHeight))
                }
              : point
          );
          finalShape = normalizeFloorplanShape({ ...start, polygonPoints: points });
          setPreview(finalShape);
          return;
        }
        const canvasDeltaX = screenDeltaX / bounds.width;
        const canvasDeltaY = screenDeltaY / bounds.height;
        const localDelta = screenDeltaToLocal(screenDeltaX, screenDeltaY, start.rotation);
        const equalSides = hasEqualPhysicalSides(start.geometry);
        const equalSideDelta = Math.max(localDelta.x, localDelta.y) / Math.min(bounds.width, bounds.height);
        const nextShape =
          interaction === 'move'
            ? { ...start, x: start.x + canvasDeltaX, y: start.y + canvasDeltaY }
            : equalSides
              ? { ...start, width: start.width + equalSideDelta, height: start.width + equalSideDelta }
              : {
                  ...start,
                  width: start.width + localDelta.x / bounds.width,
                  height: start.height + localDelta.y / bounds.height
                };
        const normalized = normalizeFloorplanShape(nextShape);
        finalShape =
          snap && interaction === 'move'
            ? normalizeFloorplanShape({
                ...normalized,
                x: Math.round(normalized.x * 20) / 20,
                y: Math.round(normalized.y * 20) / 20
              })
            : normalized;
        setPreview(finalShape);
      } catch {
        // Keep the last valid shape while the pointer is outside the plan.
      }
    };
    const cleanup = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', cancelInteraction);
      interactingRef.current = false;
    };
    const finish = () => {
      cleanup();
      onChange(finalShape);
    };
    const cancelInteraction = () => {
      cleanup();
      setPreview(shape);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', cancelInteraction);
  };

  return (
    <Box
      role="group"
      aria-label={`${preview.kind === 'TABLE' ? 'Mesa' : 'Zona'} seleccionada ${preview.name || 'sin nombre'}`}
      sx={{
        ...relativeRectStyles(projectAspectAwareRect(preview, renderedSize, hasEqualPhysicalSides(preview.geometry))),
        position: 'absolute',
        transform: `rotate(${preview.rotation}deg)`,
        transformOrigin: 'center',
        border: '3px solid',
        borderColor: 'warning.dark',
        zIndex: 3,
        overflow: 'visible'
      }}
    >
      <Box
        aria-label={`Mover ${preview.kind === 'TABLE' ? 'mesa' : 'zona'} seleccionada`}
        onPointerDown={(event) => startPointer(event, 'move')}
        sx={{ position: 'absolute', inset: 0, cursor: disabled ? 'default' : 'move', touchAction: 'none' }}
      >
        <ShapeSurface shape={preview} selected showSeats={showSeats} colorKey={preview.name} />
      </Box>
      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-label={`Cambiar tamaño de ${preview.name || (preview.kind === 'TABLE' ? 'la mesa' : 'la zona')}`}
        onPointerDown={(event) => {
          event.stopPropagation();
          startPointer(event, 'resize');
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
      {preview.geometry === 'POLYGON'
        ? preview.polygonPoints?.map((point, index) => (
            <Box
              component="button"
              type="button"
              key={index}
              disabled={disabled}
              aria-label={`Mover punto ${index + 1} de la forma personalizada`}
              onPointerDown={(event) => {
                event.stopPropagation();
                startPointer(event, 'vertex', index);
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
