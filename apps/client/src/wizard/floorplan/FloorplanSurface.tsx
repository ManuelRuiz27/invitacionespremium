import type { FloorplanShapeInput } from '@invitaciones/api-client';
import { useElementSize } from '@invitaciones/ui';
import { Box, Button, Stack, Typography } from '@mui/material';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloorplanDomRenderer } from './FloorplanDomRenderer';
import type { FloorplanRendererProps } from './FloorplanDomRenderer';
import { createHistory, commitHistory, redoHistory, undoHistory } from './floorplan-history';
import type { HistoryState } from './floorplan-history';
import { stagePointToNormalized } from './floorplan-scene';
import { FloorplanToolbar } from './FloorplanToolbar';
import type { ViewportState } from './FloorplanKonvaRenderer';

const LazyKonvaRenderer = lazy(() =>
  import('./FloorplanKonvaRenderer').then((module) => ({ default: module.FloorplanKonvaRenderer }))
);

const defaultViewport: ViewportState = { scale: 1, x: 0, y: 0 };

type FloorplanSurfaceProps = Omit<FloorplanRendererProps, 'showSeats' | 'snap'>;

export function FloorplanSurface(props: FloorplanSurfaceProps) {
  const ownerRef = useRef<HTMLDivElement>(null);
  const [measureOwner, ownerSize] = useElementSize<HTMLDivElement>();
  const setOwnerRef = useCallback(
    (node: HTMLDivElement | null) => {
      ownerRef.current = node;
      measureOwner(node);
    },
    [measureOwner]
  );
  const [image, setImage] = useState<HTMLImageElement>();
  const [viewport, setViewport] = useState(defaultViewport);
  const [snap, setSnap] = useState(false);
  const [showSeats, setShowSeats] = useState(false);
  const [history, setHistory] = useState<HistoryState<FloorplanShapeInput> | undefined>(() =>
    props.draft ? createHistory(props.draft) : undefined
  );
  const historyIdentity = `${props.selectedId ?? 'new'}:${props.draft?.kind ?? 'idle'}`;

  useEffect(() => {
    if (!props.draft) {
      setHistory(undefined);
      return;
    }
    setHistory(createHistory(props.draft));
  }, [historyIdentity]);

  useEffect(() => {
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = props.imageUrl;
    return () => {
      next.onload = null;
    };
  }, [props.imageUrl]);

  const stageHeight = useMemo(() => {
    if (!image?.naturalWidth || !ownerSize.width) return 0;
    return (ownerSize.width * image.naturalHeight) / image.naturalWidth;
  }, [image, ownerSize.width]);
  const useKonva =
    import.meta.env.MODE !== 'test' &&
    Boolean(image && image.src === props.imageUrl && ownerSize.width > 0 && stageHeight > 0);

  const changeDraft = (next: FloorplanShapeInput) => {
    setHistory((current) => {
      if (!current) return createHistory(next);
      const synchronized =
        props.draft && current.present !== props.draft ? commitHistory(current, props.draft) : current;
      return commitHistory(synchronized, next);
    });
    props.onDraftChange(next);
  };

  const applyHistory = (direction: 'undo' | 'redo') => {
    if (!history) return;
    const next = direction === 'undo' ? undoHistory(history) : redoHistory(history);
    if (next === history) return;
    setHistory(next);
    props.onDraftChange(next.present);
  };

  const rendererProps = {
    ...props,
    draft: props.draft,
    snap,
    showSeats,
    onDraftChange: changeDraft
  };

  return (
    <Stack spacing={1.5}>
      <FloorplanToolbar
        disabled={props.disabled}
        snap={snap}
        showSeats={showSeats}
        canUndo={Boolean(history?.past.length)}
        canRedo={Boolean(history?.future.length)}
        onSnapChange={setSnap}
        onShowSeatsChange={setShowSeats}
        onZoomIn={() => setViewport((current) => ({ ...current, scale: Math.min(4, current.scale * 1.2) }))}
        onZoomOut={() => setViewport((current) => ({ ...current, scale: Math.max(0.5, current.scale / 1.2) }))}
        onFit={() => setViewport(defaultViewport)}
        onUndo={() => applyHistory('undo')}
        onRedo={() => applyHistory('redo')}
      />
      <Box
        ref={import.meta.env.MODE === 'test' ? undefined : setOwnerRef}
        sx={{ width: '100%', maxWidth: 960, overflow: 'hidden', bgcolor: 'grey.100', borderRadius: 1 }}
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
              width={ownerSize.width}
              height={stageHeight}
              viewport={viewport}
              onViewportChange={setViewport}
            />
          </Suspense>
        ) : (
          <FloorplanDomRenderer {...rendererProps} />
        )}
      </Box>

      <Box component="section" aria-labelledby="floorplan-elements-title">
        <Typography id="floorplan-elements-title" variant="subtitle2" sx={{ mb: 1 }}>
          Elementos del plano
        </Typography>
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
          {props.floorplan.shapes.map((shape) => (
            <Button
              key={shape.id}
              size="small"
              variant={props.selectedId === shape.id ? 'contained' : 'outlined'}
              disabled={props.disabled || Boolean(props.draft)}
              onClick={() => props.onSelect(shape)}
              sx={{ minHeight: 44 }}
            >
              {shape.kind === 'TABLE' ? `Mesa ${shape.name} · ${shape.capacity}` : `Zona ${shape.name}`}
            </Button>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
