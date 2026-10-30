import type { Floorplan, FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import { projectAspectAwareRect, relativeRectStyles, useElementSize } from '@invitaciones/ui';
import type { RenderedSize } from '@invitaciones/ui';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeFloorplanShape, polygonClipPath, screenDeltaToLocal } from './floorplan-geometry';
import { hasEqualPhysicalSides, stagePointToNormalized } from './floorplan-scene';
import { contrastingText, stickerColor } from './floorplan-sticker-style';
import { resolveSvgTableVisualState } from './floorplan-svg-table-state';
import { visualSeats } from './floorplan-visual-seats';
import { createPlacementGestureGuard } from './floorplan-placement-gesture';

export interface FloorplanRendererProps {
  floorplan: Omit<Floorplan, 'seatingMode' | 'seats'> & Pick<Partial<Floorplan>, 'seatingMode' | 'seats'>;
  imageUrl: string;
  selectedId?: string | undefined;
  draft?: FloorplanShapeInput | undefined;
  tracePresentation?: boolean | undefined;
  disabled: boolean;
  showSeats: boolean;
  snap: boolean;
  panEnabled?: boolean | undefined;
  readOnly?: boolean | undefined;
  onSelect: (shape: FloorplanShape) => void;
  onDraftChange: (shape: FloorplanShapeInput) => void;
  onCanvasPlace?:
    ((point: { x: number; y: number }, pendingId?: string, canvasSize?: RenderedSize) => void) | undefined;
  captureCanvasClicks?: boolean | undefined;
  selectedSeatId?: string | undefined;
  selectedSeatIds?: readonly string[] | undefined;
  onSeatSelect?: ((seatId: string, options: { additive: boolean }) => void) | undefined;
  onSeatMove?: ((seatId: string, point: { x: number; y: number }) => void) | undefined;
  onSeatFocus?: ((seatId: string | undefined) => void) | undefined;
  svgSource?:
    | {
        selectableElements: Array<{
          sourceElementId: string;
          bbox: { x: number; y: number; width: number; height: number };
        }>;
      }
    | undefined;
  selectedSourceElementId?: string | undefined;
  onSourceSelect?: ((sourceElementId: string) => void) | undefined;
}

export function FloorplanDomRenderer(props: FloorplanRendererProps) {
  const renderedSeats = props.tracePresentation
    ? [...(props.floorplan.seats ?? [])].sort((left, right) => {
        const rank = (id: string) => (props.selectedSeatId === id ? 2 : props.selectedSeatIds?.includes(id) ? 1 : 0);
        return rank(left.id) - rank(right.id);
      })
    : (props.floorplan.seats ?? []);
  const selectedIsMapped = props.floorplan.shapes.some(
    (shape) =>
      shape.id === props.selectedId &&
      shape.sourceElementId &&
      props.svgSource?.selectableElements.some((element) => element.sourceElementId === shape.sourceElementId)
  );
  const ownerRef = useRef<HTMLDivElement>(null);
  const placementGesture = useRef(createPlacementGestureGuard());
  const [measureOwner, ownerSize] = useElementSize<HTMLDivElement>();
  const setOwnerRef = useCallback(
    (node: HTMLDivElement | null) => {
      ownerRef.current = node;
      measureOwner(node);
    },
    [measureOwner]
  );

  const placeFromEvent = (clientX: number, clientY: number, pendingId?: string) => {
    if (props.disabled || props.panEnabled || !placementGesture.current.canPlace()) return;
    const bounds = ownerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    props.onCanvasPlace?.(stagePointToNormalized(clientX, clientY, bounds), pendingId);
  };

  return (
    <Box
      ref={setOwnerRef}
      aria-label="Plano interactivo de mesas y zonas"
      onPointerDownCapture={(event) => {
        placementGesture.current.start(event, event.isPrimary !== false && event.button === 0);
        if (props.panEnabled) placementGesture.current.cancel();
      }}
      onPointerMoveCapture={(event) => placementGesture.current.move(event)}
      onPointerUpCapture={(event) => placementGesture.current.move(event)}
      onPointerCancelCapture={() => placementGesture.current.cancel()}
      onDragStartCapture={() => placementGesture.current.cancel()}
      onWheelCapture={() => placementGesture.current.cancel()}
      onClick={(event) => {
        if (event.detail > 1) return;
        if (!props.captureCanvasClicks && (event.target as HTMLElement).closest('button')) return;
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
      {props.svgSource?.selectableElements.map((element, index) => {
        const mapped = props.floorplan.shapes.find((shape) => shape.sourceElementId === element.sourceElementId);
        const selected =
          props.selectedSourceElementId === element.sourceElementId ||
          Boolean(mapped && props.selectedId === mapped.id);
        const tableState = mapped
          ? resolveSvgTableVisualState(props.floorplan, mapped, {
              selected,
              readOnly: Boolean(props.readOnly || props.disabled)
            })
          : undefined;
        return (
          <Box
            component="button"
            key={element.sourceElementId}
            type="button"
            aria-label={
              tableState?.accessibleLabel ??
              (mapped ? `${mapped.name}, vinculado al plano` : `Elemento del plano ${index + 1}, sin vincular`)
            }
            aria-pressed={selected}
            disabled={props.disabled || Boolean(props.draft) || Boolean(props.captureCanvasClicks)}
            onClick={(event) => {
              event.stopPropagation();
              if (mapped) props.onSelect(mapped);
              else props.onSourceSelect?.(element.sourceElementId);
            }}
            sx={{
              position: 'absolute',
              left: `${element.bbox.x * 100}%`,
              top: `${element.bbox.y * 100}%`,
              width: `${element.bbox.width * 100}%`,
              height: `${element.bbox.height * 100}%`,
              border: tableState
                ? `3px ${tableState.borderStyle} ${tableState.occupancyState === 'FULL' ? '#a03d2f' : tableState.occupancyState === 'PARTIAL' ? '#9a6700' : '#356ae6'}`
                : selected
                  ? '3px solid #356ae6'
                  : mapped
                    ? '2px dashed #356ae6'
                    : '0 solid transparent',
              bgcolor: 'transparent',
              cursor: props.disabled ? 'default' : 'pointer',
              zIndex: 1,
              p: 0,
              opacity: tableState && (props.readOnly || props.disabled) ? 0.72 : 1,
              '&:focus-visible': { outline: '3px solid #f0a500', outlineOffset: 2 }
            }}
          >
            {tableState ? (
              <Box
                component="span"
                sx={{
                  position: 'absolute',
                  top: 3,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  maxWidth: 'calc(100% - 6px)',
                  px: 0.5,
                  py: 0.125,
                  borderRadius: 0.5,
                  bgcolor: 'rgba(255,255,255,0.88)',
                  color: 'text.primary',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  pointerEvents: 'none'
                }}
              >
                {tableState.label}
              </Box>
            ) : null}
          </Box>
        );
      })}
      {props.floorplan.shapes.map((shape) => {
        if (
          shape.sourceElementId &&
          props.svgSource?.selectableElements.some((element) => element.sourceElementId === shape.sourceElementId)
        )
          return null;
        if (props.draft && props.selectedId === shape.id) return null;
        return (
          <ShapeButton
            key={shape.id}
            shape={shape}
            selected={props.selectedId === shape.id}
            renderedSize={ownerSize}
            disabled={props.disabled || Boolean(props.draft) || Boolean(props.captureCanvasClicks)}
            readOnly={props.readOnly}
            showSeats={props.showSeats}
            tracePresentation={props.tracePresentation}
            onClick={() => props.onSelect(shape)}
          />
        );
      })}
      {props.floorplan.seatingMode === 'SEAT'
        ? renderedSeats.map((seat) => (
            <SeatButton
              key={seat.id}
              seat={seat}
              selected={props.selectedSeatIds?.includes(seat.id) ?? props.selectedSeatId === seat.id}
              disabled={props.disabled || Boolean(props.tracePresentation && props.panEnabled)}
              placementActive={props.captureCanvasClicks === true}
              ownerRef={ownerRef}
              onSelect={(options) => props.onSeatSelect?.(seat.id, options)}
              onMove={props.onSeatMove}
              tracePresentation={props.tracePresentation}
              onFocus={props.onSeatFocus}
            />
          ))
        : null}
      {props.draft && !selectedIsMapped ? (
        <EditableShape
          shape={props.draft}
          renderedSize={ownerSize}
          disabled={props.disabled}
          snap={props.snap}
          ownerRef={ownerRef}
          showSeats={props.showSeats}
          tracePresentation={props.tracePresentation}
          onChange={props.onDraftChange}
        />
      ) : null}
    </Box>
  );
}

function SeatButton({
  seat,
  selected,
  disabled,
  placementActive,
  ownerRef,
  onSelect,
  onMove,
  tracePresentation,
  onFocus
}: {
  seat: NonNullable<FloorplanRendererProps['floorplan']['seats']>[number];
  selected: boolean;
  disabled: boolean;
  placementActive: boolean;
  ownerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (options: { additive: boolean }) => void;
  onMove?: FloorplanRendererProps['onSeatMove'];
  tracePresentation?: boolean | undefined;
  onFocus?: FloorplanRendererProps['onSeatFocus'];
}) {
  const [preview, setPreview] = useState({ x: seat.x, y: seat.y });
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const traceDisabled = Boolean(tracePresentation && disabled);
  useEffect(() => {
    if (!dragging.current) setPreview({ x: seat.x, y: seat.y });
  }, [seat.x, seat.y, traceDisabled]);
  return (
    <Box
      component="button"
      type="button"
      aria-label={`Lugar ${seat.label}${seat.isBlocked ? ', bloqueado' : seat.occupied ? ', ocupado' : ', disponible'}`}
      aria-pressed={selected}
      title={tracePresentation ? seat.label : undefined}
      onFocus={() => onFocus?.(seat.id)}
      onBlur={() => onFocus?.(undefined)}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled || placementActive) return;
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onSelect({ additive: event.shiftKey || event.ctrlKey || event.metaKey });
      }}
      onPointerDown={(event) => {
        if (disabled || placementActive || !onMove) return;
        event.stopPropagation();
        event.preventDefault();
        const bounds = ownerRef.current?.getBoundingClientRect();
        if (!bounds?.width || !bounds.height) return;
        const target = event.currentTarget;
        dragging.current = true;
        const start = { x: event.clientX, y: event.clientY };
        let moved = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const move = (next: PointerEvent) => {
          moved ||= Math.hypot(next.clientX - start.x, next.clientY - start.y) >= 3;
          const point = stagePointToNormalized(next.clientX, next.clientY, bounds);
          setPreview(point);
        };
        const finish = (next: PointerEvent) => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', finish);
          target.removeEventListener('pointercancel', cancel);
          dragging.current = false;
          if (moved) {
            const point = stagePointToNormalized(next.clientX, next.clientY, bounds);
            setPreview(point);
            suppressClick.current = true;
            onMove(seat.id, point);
          } else {
            setPreview({ x: seat.x, y: seat.y });
          }
        };
        const cancel = () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', finish);
          target.removeEventListener('pointercancel', cancel);
          dragging.current = false;
          setPreview({ x: seat.x, y: seat.y });
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', finish);
        target.addEventListener('pointercancel', cancel);
      }}
      disabled={disabled}
      sx={{
        position: 'absolute',
        left: `${preview.x * 100}%`,
        top: `${preview.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: 0,
        bgcolor: 'transparent',
        color: 'text.primary',
        zIndex: tracePresentation ? (selected ? 6 : 5) : 3,
        cursor: disabled ? 'default' : onMove ? 'grab' : 'pointer',
        pointerEvents: placementActive ? 'none' : 'auto',
        touchAction: 'none',
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: tracePresentation ? 15 : 8,
          borderRadius: '50%',
          border: 2,
          borderColor: selected
            ? 'warning.main'
            : seat.isBlocked
              ? 'grey.600'
              : seat.occupied
                ? 'primary.main'
                : 'success.main',
          bgcolor: seat.isBlocked ? 'grey.300' : seat.occupied ? 'primary.light' : 'background.paper'
        },
        '&:focus-visible': { outline: '3px solid', outlineColor: 'warning.main' }
      }}
    >
      <Box component="span" sx={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: 700 }}>
        {tracePresentation ? (seat.isBlocked ? '×' : '') : seat.label}
      </Box>
    </Box>
  );
}

function ShapeButton({
  shape,
  selected = false,
  renderedSize,
  disabled,
  readOnly,
  showSeats,
  tracePresentation,
  onClick
}: {
  shape: FloorplanShape;
  selected?: boolean;
  renderedSize: RenderedSize;
  disabled: boolean;
  readOnly?: boolean | undefined;
  showSeats: boolean;
  tracePresentation?: boolean | undefined;
  onClick: () => void;
}) {
  const kind = shape.kind === 'TABLE' ? 'Mesa' : 'Zona';
  return (
    <Box
      component="button"
      type="button"
      aria-label={`${readOnly ? 'Seleccionar' : 'Editar'} ${kind.toLowerCase()} ${shape.name}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      sx={{
        ...relativeRectStyles(projectAspectAwareRect(shape, renderedSize, hasEqualPhysicalSides(shape.geometry))),
        position: 'absolute',
        p: 0,
        border: selected ? 3 : 2,
        borderStyle: 'solid',
        borderColor: selected ? 'warning.main' : shape.kind === 'TABLE' ? 'primary.dark' : 'warning.dark',
        bgcolor: 'transparent',
        borderRadius: tracePresentation && shape.geometry === 'CIRCLE' ? '50%' : undefined,
        boxShadow:
          !tracePresentation && selected
            ? '0 0 0 3px rgba(245, 158, 11, 0.4), 0 0 14px rgba(245, 158, 11, 0.6)'
            : undefined,
        transform: `rotate(${shape.rotation}deg)`,
        transformOrigin: 'center',
        cursor: disabled ? 'default' : 'pointer',
        overflow: 'visible',
        zIndex: selected ? 2 : 1,
        '&:focus-visible': { outline: '3px solid', outlineColor: 'warning.main', outlineOffset: 3 }
      }}
    >
      <ShapeSurface
        tracePresentation={tracePresentation}
        shape={shape}
        selected={selected}
        showSeats={showSeats}
        colorKey={shape.id}
      />
    </Box>
  );
}

function ShapeSurface({
  shape,
  selected,
  showSeats,
  colorKey,
  tracePresentation
}: {
  shape: FloorplanShapeInput;
  selected: boolean;
  showSeats: boolean;
  colorKey: string;
  tracePresentation?: boolean | undefined;
}) {
  const table = shape.kind === 'TABLE';
  const background = stickerColor(colorKey, !table);
  const seats = table && showSeats ? visualSeats(shape.geometry, shape.capacity, 100, 100, 10) : [];
  if (tracePresentation && table)
    return (
      <Typography
        component="span"
        variant="caption"
        sx={{
          position: 'absolute',
          bottom: 'calc(100% + 4px)',
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          bgcolor: 'rgba(255,255,255,.9)',
          color: 'primary.dark',
          px: 0.5,
          lineHeight: 1.5
        }}
      >
        {shape.name || 'Nueva mesa'}
      </Typography>
    );
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
  tracePresentation,
  onChange
}: {
  shape: FloorplanShapeInput;
  renderedSize: RenderedSize;
  disabled: boolean;
  snap: boolean;
  ownerRef: React.RefObject<HTMLDivElement | null>;
  showSeats: boolean;
  tracePresentation?: boolean | undefined;
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
        borderColor: tracePresentation ? 'primary.main' : 'warning.dark',
        borderRadius: tracePresentation && preview.geometry === 'CIRCLE' ? '50%' : undefined,
        zIndex: 3,
        overflow: 'visible'
      }}
    >
      <Box
        aria-label={`Mover ${preview.kind === 'TABLE' ? 'mesa' : 'zona'} seleccionada`}
        onPointerDown={(event) => startPointer(event, 'move')}
        sx={{ position: 'absolute', inset: 0, cursor: disabled ? 'default' : 'move', touchAction: 'none' }}
      >
        <ShapeSurface
          tracePresentation={tracePresentation}
          shape={preview}
          selected
          showSeats={showSeats}
          colorKey={preview.name}
        />
      </Box>
      {!tracePresentation ? (
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
      ) : null}
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
