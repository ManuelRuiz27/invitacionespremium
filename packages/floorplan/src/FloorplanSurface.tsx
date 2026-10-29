import type { FloorplanShapeInput } from '@invitaciones/api-client';
import { useElementSize } from '@invitaciones/ui';
import { Box, Button, Stack, Typography } from '@mui/material';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FloorplanDomRenderer } from './FloorplanDomRenderer';
import type { FloorplanRendererProps } from './FloorplanDomRenderer';
import { createHistory, commitHistory, redoHistory, undoHistory } from './floorplan-history';
import type { HistoryState } from './floorplan-history';
import { stagePointToNormalized } from './floorplan-scene';
import { floorplanColors } from './floorplan-sticker-style';
import { FloorplanToolbar } from './FloorplanToolbar';
import type { ViewportState } from './FloorplanKonvaRenderer';

const LazyKonvaRenderer = lazy(() =>
  import('./FloorplanKonvaRenderer').then((module) => ({ default: module.FloorplanKonvaRenderer }))
);

const defaultViewport: ViewportState = { scale: 1, x: 0, y: 0 };

export type FloorplanSurfaceProps = Omit<FloorplanRendererProps, 'showSeats' | 'snap' | 'panEnabled'> & {
  dock?: ReactNode;
};

export function FloorplanSurface(props: FloorplanSurfaceProps) {
  const ownerRef = useRef<HTMLDivElement>(null);
  const [measureOwner, ownerSize] = useElementSize<HTMLDivElement>();
  const setOwnerRef = useCallback(
    (node: HTMLDivElement | null) => {
      ownerRef.current = node;
      if (!props.tracePresentation) measureOwner(node);
    },
    [measureOwner, props.tracePresentation]
  );
  const [image, setImage] = useState<HTMLImageElement>();
  const [viewport, setViewport] = useState(defaultViewport);
  const [snap, setSnap] = useState(false);
  const [showSeats, setShowSeats] = useState(false);
  const [panEnabled, setPanEnabled] = useState(false);
  const [spacePanEnabled, setSpacePanEnabled] = useState(false);
  const [history, setHistory] = useState<HistoryState<FloorplanShapeInput> | undefined>(() =>
    props.draft ? createHistory(props.draft) : undefined
  );
  const historySelectedIdRef = useRef(props.selectedId);
  useEffect(() => {
    const selectedShapeChanged = historySelectedIdRef.current !== props.selectedId;
    historySelectedIdRef.current = props.selectedId;
    setHistory((current) => {
      if (!props.draft) return undefined;
      if (!current || selectedShapeChanged) return createHistory(props.draft);
      return sameFloorplanDraft(current.present, props.draft) ? current : commitHistory(current, props.draft);
    });
  }, [props.draft, props.selectedId]);

  useEffect(() => {
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = props.imageUrl;
    return () => {
      next.onload = null;
    };
  }, [props.imageUrl]);

  const stageWidth =
    props.tracePresentation && image?.naturalWidth && image.naturalHeight && ownerSize.height
      ? Math.min(ownerSize.width, (Math.max(1, ownerSize.height - 64) * image.naturalWidth) / image.naturalHeight)
      : ownerSize.width;
  const stageHeight = useMemo(() => {
    if (!image?.naturalWidth || !stageWidth) return 0;
    return (stageWidth * image.naturalHeight) / image.naturalWidth;
  }, [image, stageWidth]);

  const useKonva = Boolean(image && image.src === props.imageUrl && ownerSize.width > 0 && stageHeight > 0);

  const changeDraft = (next: FloorplanShapeInput) => {
    setHistory((current) => {
      if (!current) return createHistory(next);
      return sameFloorplanDraft(current.present, next) ? current : commitHistory(current, next);
    });
    props.onDraftChange(next);
  };

  const applyHistory = (direction: 'undo' | 'redo') => {
    if (props.disabled) return;
    setHistory((current) => {
      if (!current) return current;
      const next = direction === 'undo' ? undoHistory(current) : redoHistory(current);
      if (next !== current) props.onDraftChange(next.present);
      return next;
    });
  };

  const rendererProps = {
    ...props,
    draft: props.draft,
    snap,
    showSeats,
    panEnabled: panEnabled || spacePanEnabled,
    onDraftChange: changeDraft,
    onCanvasPlace:
      props.tracePresentation && props.onCanvasPlace
        ? (point: { x: number; y: number }, pendingId?: string) =>
            props.onCanvasPlace?.(point, pendingId, { width: stageWidth, height: stageHeight })
        : props.onCanvasPlace
  };

  return (
    <Box
      sx={{
        ...(props.tracePresentation ? { display: 'flex', flexDirection: 'column', flex: '1 1 0', minHeight: 0 } : {}),
        overflow: 'hidden',
        border: `1px solid ${floorplanColors.line}`,
        borderRadius: 2,
        bgcolor: floorplanColors.canvas,
        boxShadow: '0 18px 48px rgba(23, 35, 60, 0.08)'
      }}
    >
      <Box
        ref={props.tracePresentation ? measureOwner : undefined}
        sx={{
          position: 'relative',
          minHeight: props.tracePresentation ? 0 : { xs: 360, md: 520 },
          display: props.tracePresentation ? 'flex' : 'grid',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: props.tracePresentation ? '1 1 0' : undefined,
          placeItems: 'center'
        }}
      >
        <Box
          sx={{
            position: props.tracePresentation ? 'relative' : 'absolute',
            zIndex: 2,
            top: props.tracePresentation ? 0 : 12,
            left: props.tracePresentation ? 0 : 12,
            right: props.tracePresentation ? 0 : 12,
            width: props.tracePresentation ? '100%' : undefined,
            py: props.tracePresentation ? 0.5 : 0,
            pointerEvents: 'none'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: { xs: 'flex-start', sm: 'center' },
              overflowX: 'auto',
              scrollbarWidth: 'thin',
              pb: 0.5,
              '& > *': { pointerEvents: 'auto', flexShrink: 0 }
            }}
          >
            <FloorplanToolbar
              disabled={props.disabled}
              {...(props.readOnly === undefined ? {} : { readOnly: props.readOnly })}
              snap={snap}
              showSeats={showSeats}
              panEnabled={panEnabled}
              zoom={viewport.scale}
              canUndo={Boolean(history?.past.length)}
              canRedo={Boolean(history?.future.length)}
              onSnapChange={setSnap}
              onShowSeatsChange={setShowSeats}
              onPanEnabledChange={setPanEnabled}
              onZoomIn={() => setViewport((current) => ({ ...current, scale: Math.min(4, current.scale * 1.2) }))}
              onZoomOut={() => setViewport((current) => ({ ...current, scale: Math.max(0.5, current.scale / 1.2) }))}
              onFit={() => setViewport(defaultViewport)}
              onUndo={() => applyHistory('undo')}
              onRedo={() => applyHistory('redo')}
            />
          </Box>
        </Box>

        <Box
          ref={setOwnerRef}
          data-testid="floorplan-renderer-host"
          tabIndex={0}
          aria-label="Superficie interactiva del plano"
          sx={{
            width: props.tracePresentation && stageWidth ? stageWidth : '100%',
            maxWidth: '100%',
            overflow: 'hidden',
            bgcolor: floorplanColors.canvas,
            flexShrink: 0
          }}
          onPointerDownCapture={() => ownerRef.current?.focus({ preventScroll: true })}
          onKeyDown={(event) => {
            if (event.code === 'Space') {
              event.preventDefault();
              setSpacePanEnabled(true);
              return;
            }
            if (event.key === '0') {
              event.preventDefault();
              setViewport(defaultViewport);
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
              event.preventDefault();
              applyHistory(event.shiftKey ? 'redo' : 'undo');
              return;
            }
            if (!props.draft || props.disabled || !event.key.startsWith('Arrow')) return;
            event.preventDefault();
            const step = event.shiftKey ? 0.01 : 0.0025;
            changeDraft({
              ...props.draft,
              x: Math.min(
                1 - props.draft.width,
                Math.max(0, props.draft.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))
              ),
              y: Math.min(
                1 - props.draft.height,
                Math.max(0, props.draft.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))
              )
            });
          }}
          onKeyUp={(event) => {
            if (event.code === 'Space') setSpacePanEnabled(false);
          }}
          onBlur={() => setSpacePanEnabled(false)}
          onDragOver={(event) => {
            if (props.disabled || !props.onCanvasPlace) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            const pendingId = event.dataTransfer.getData('application/x-floorplan-pending-table');
            const bounds = ownerRef.current?.getBoundingClientRect();
            if (!pendingId || !bounds) return;
            event.preventDefault();
            const point = stagePointToNormalized(
              bounds.left + (event.clientX - bounds.left - viewport.x) / viewport.scale,
              bounds.top + (event.clientY - bounds.top - viewport.y) / viewport.scale,
              bounds
            );
            props.onCanvasPlace?.(point, pendingId);
          }}
        >
          {useKonva && image ? (
            <Suspense fallback={<FloorplanDomRenderer {...rendererProps} />}>
              <LazyKonvaRenderer
                {...rendererProps}
                image={image}
                width={stageWidth}
                height={stageHeight}
                viewport={viewport}
                onViewportChange={setViewport}
              />
            </Suspense>
          ) : (
            <FloorplanDomRenderer {...rendererProps} />
          )}
        </Box>
      </Box>

      {props.dock}

      <Box
        component="details"
        sx={{ borderTop: `1px solid ${floorplanColors.line}`, bgcolor: floorplanColors.paper, px: 2, py: 1.25 }}
      >
        <Typography component="summary" id="floorplan-elements-title" variant="subtitle2" sx={{ cursor: 'pointer' }}>
          Mesas y zonas ({props.floorplan.shapes.length})
        </Typography>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', pt: 1.25 }}>
          {props.floorplan.shapes.map((shape) => (
            <Button
              key={shape.id}
              size="small"
              variant={props.selectedId === shape.id ? 'contained' : 'outlined'}
              disabled={props.disabled || Boolean(props.draft)}
              onClick={() => props.onSelect(shape)}
              sx={{ minHeight: 44 }}
            >
              {shape.kind === 'TABLE' ? `${tableDisplayName(shape.name)} · ${shape.capacity}` : `Zona ${shape.name}`}
            </Button>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

function tableDisplayName(name: string) {
  const trimmed = name.trim();
  return /^mesa\b/i.test(trimmed) ? trimmed : `Mesa ${trimmed}`;
}

function sameFloorplanDraft(left: FloorplanShapeInput, right: FloorplanShapeInput) {
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
