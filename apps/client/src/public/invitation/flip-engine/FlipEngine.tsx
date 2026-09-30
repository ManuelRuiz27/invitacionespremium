import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { BookState } from './book-state';
import { GestureController } from './gesture-controller';
import { pageTurnGeometry } from './page-geometry';
import { PageRenderer } from './page-renderer';
import { PageTurnController } from './page-turn-controller';
import { ZoomController, type ZoomSnapshot } from './zoom-controller';
import type {
  BookSnapshot,
  FlipDirection,
  FlipEnginePhase,
  FlipLayout,
  PageRenderContext,
  PointerPoint,
  TurnSnapshot
} from './types';

export type FlipEnginePageContext = PageRenderContext;

export interface FlipEngineHandle {
  flipNext: () => boolean;
  flipPrev: () => boolean;
  turnToPage: (page: number) => boolean;
}

interface ActiveTurn {
  direction: FlipDirection;
  reveal: number;
  source: number;
}

export interface FlipEngineProps {
  className?: string;
  layout: FlipLayout;
  onChangeState?: (phase: FlipEnginePhase) => void;
  onPageChange?: (snapshot: BookSnapshot) => void;
  onReady?: (snapshot: BookSnapshot) => void;
  onTurnProgress?: (snapshot: { direction: FlipDirection; progress: number }) => void;
  pageCount: number;
  reducedMotion?: boolean;
  renderPage: (context: PageRenderContext) => ReactNode;
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

export const FlipEngine = forwardRef<FlipEngineHandle, FlipEngineProps>(function FlipEngine(
  {
    className,
    layout,
    onChangeState,
    onPageChange,
    onReady,
    onTurnProgress,
    pageCount,
    reducedMotion = false,
    renderPage
  },
  forwardedRef
) {
  const stateRef = useRef(new BookState(pageCount, layout));
  const controllerRef = useRef(new PageTurnController());
  const gestureRef = useRef(new GestureController());
  const zoomRef = useRef(new ZoomController());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const movingRef = useRef<HTMLDivElement | null>(null);
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const frameRef = useRef<number | null>(null);
  const originYRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [snapshot, setSnapshot] = useState<BookSnapshot>(() => stateRef.current.snapshot());
  const [activeTurn, setActiveTurn] = useState<ActiveTurn | null>(null);

  const emitSnapshot = useCallback(
    (next: BookSnapshot, changed = true) => {
      setSnapshot(next);
      if (changed) onPageChange?.(next);
    },
    [onPageChange]
  );

  const applyZoom = useCallback((next: ZoomSnapshot) => {
    const root = rootRef.current;
    if (!root) return;
    if (next.scale > 1) root.dataset.zoomed = 'true';
    else delete root.dataset.zoomed;
    root.style.setProperty('--flip-engine-zoom', next.scale.toFixed(3));
    root.style.setProperty('--flip-engine-zoom-x', `${next.x.toFixed(2)}px`);
    root.style.setProperty('--flip-engine-zoom-y', `${next.y.toFixed(2)}px`);
  }, []);

  const resetZoom = useCallback(() => applyZoom(zoomRef.current.reset()), [applyZoom]);

  const clearVisualState = useCallback(() => {
    const root = rootRef.current;
    const moving = movingRef.current;
    if (root) {
      root.dataset.phase = 'idle';
      root.style.removeProperty('--flip-engine-back-opacity');
      root.style.removeProperty('--flip-engine-curvature');
      root.style.removeProperty('--flip-engine-front-opacity');
      root.style.removeProperty('--flip-engine-progress');
      root.style.removeProperty('--flip-engine-projection-opacity');
      root.style.removeProperty('--flip-engine-shadow');
    }
    if (moving) {
      moving.style.removeProperty('clip-path');
      moving.style.removeProperty('opacity');
      moving.style.removeProperty('transform');
      moving.style.removeProperty('transform-origin');
      moving.style.removeProperty('--flip-engine-fold-opacity');
    }
  }, []);

  useEffect(() => {
    gestureRef.current.reset();
    resetZoom();
    const state = new BookState(pageCount, layout, snapshot.page);
    stateRef.current = state;
    const next = state.snapshot();
    setSnapshot(next);
    onReady?.(next);
    // The document identity changes when its ordered public page ids change.
    // A fresh state is required; carrying a prior turn would mix assets/tokens.
  }, [pageCount, resetZoom]);

  useEffect(() => {
    resetZoom();
    if (activeTurnRef.current) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      controllerRef.current.reset();
      gestureRef.current.reset();
      clearVisualState();
      activeTurnRef.current = null;
      setActiveTurn(null);
      onChangeState?.('idle');
    }
    const next = stateRef.current.setLayout(layout);
    emitSnapshot(next);
  }, [clearVisualState, emitSnapshot, layout, onChangeState, resetZoom]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const applyVisualState = useCallback(
    (turn: TurnSnapshot) => {
      const root = rootRef.current;
      const moving = movingRef.current;
      if (!root || !moving || !turn.direction) return;
      const box = root.getBoundingClientRect();
      const geometry = pageTurnGeometry(
        turn,
        { width: box.width / (layout === 'spread' ? 2 : 1), height: box.height },
        originYRef.current
      );
      root.dataset.phase = turn.phase;
      root.style.setProperty('--flip-engine-progress', String(Math.min(1, Math.max(0, turn.progress))));
      root.style.setProperty('--flip-engine-back-opacity', geometry.backOpacity.toFixed(3));
      root.style.setProperty('--flip-engine-curvature', geometry.curvature.toFixed(3));
      root.style.setProperty('--flip-engine-front-opacity', geometry.frontOpacity.toFixed(3));
      root.style.setProperty('--flip-engine-projection-opacity', geometry.projectionOpacity.toFixed(3));
      root.style.setProperty('--flip-engine-shadow', geometry.shadowOpacity.toFixed(3));
      moving.style.clipPath = geometry.clipPath;
      moving.style.opacity = '1';
      moving.style.transform = geometry.transform;
      moving.style.transformOrigin = geometry.transformOrigin;
      moving.style.setProperty('--flip-engine-fold-opacity', geometry.foldOpacity.toFixed(3));
      onTurnProgress?.({ direction: turn.direction, progress: Math.min(1, Math.max(0, turn.progress)) });
    },
    [layout, onTurnProgress]
  );

  const finishTurn = useCallback(
    (complete: boolean) => {
      const active = activeTurnRef.current;
      if (!active) return;
      if (complete) {
        const next = stateRef.current.commit(active.direction);
        if (next) emitSnapshot(next);
      }
      activeTurnRef.current = null;
      setActiveTurn(null);
      onChangeState?.('idle');
      clearVisualState();
    },
    [clearVisualState, emitSnapshot, onChangeState]
  );

  const abortActiveTurn = useCallback(() => {
    if (!activeTurnRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    controllerRef.current.reset();
    finishTurn(false);
  }, [finishTurn]);

  const settle = useCallback(() => {
    const tick = () => {
      const result = controllerRef.current.advance(now());
      applyVisualState(result.snapshot);
      if (!result.complete) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      frameRef.current = null;
      finishTurn(result.complete);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [applyVisualState, finishTurn]);

  const begin = useCallback(
    (direction: FlipDirection, point: PointerPoint, programmatic = false): boolean => {
      if (!stateRef.current.canTurn(direction) || activeTurnRef.current) return false;
      const root = rootRef.current;
      if (!root) return false;
      resetZoom();
      const box = root.getBoundingClientRect();
      const bounds = { width: Math.max(1, box.width / (layout === 'spread' ? 2 : 1)), height: Math.max(1, box.height) };
      const started = programmatic
        ? controllerRef.current.startProgrammatic(direction, bounds, point.at)
        : controllerRef.current.start(direction, point, bounds);
      if (!started) return false;
      const current = stateRef.current.currentSpread();
      const target = stateRef.current.targetSpread(direction);
      if (!target) {
        controllerRef.current.reset();
        return false;
      }
      const active = {
        direction,
        reveal: target[direction === 'next' ? 0 : target.length - 1]!,
        source: current[direction === 'next' ? current.length - 1 : 0]!
      };
      originYRef.current = point.y;
      activeTurnRef.current = active;
      setActiveTurn(active);
      onChangeState?.('dragging');
      return true;
    },
    [layout, onChangeState, resetZoom]
  );

  const programmaticTurn = useCallback(
    (direction: FlipDirection): boolean => {
      const root = rootRef.current;
      if (!root) return false;
      const box = root.getBoundingClientRect();
      const point = { x: direction === 'next' ? box.width / 2 : 0, y: box.height / 2, at: now() };
      if (!begin(direction, point, true)) return false;
      if (reducedMotion) {
        applyVisualState({ phase: 'completing', direction, progress: 1, velocity: 0 });
        controllerRef.current.reset();
        finishTurn(true);
        return true;
      }
      controllerRef.current.release(point.at);
      onChangeState?.('completing');
      settle();
      return true;
    },
    [applyVisualState, begin, finishTurn, onChangeState, reducedMotion, settle]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      flipNext: () => programmaticTurn('next'),
      flipPrev: () => programmaticTurn('prev'),
      turnToPage: (page) => {
        if (activeTurnRef.current) return false;
        const next = stateRef.current.goTo(page);
        if (!next) return false;
        resetZoom();
        emitSnapshot(next);
        return true;
      }
    }),
    [emitSnapshot, programmaticTurn, resetZoom]
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [role="button"]'))
      return;
    const root = rootRef.current;
    if (!root || (activeTurnRef.current && event.pointerType !== 'touch')) return;
    const box = root.getBoundingClientRect();
    const point = { x: event.clientX - box.left, y: event.clientY - box.top, at: now() };
    const bounds = { width: Math.max(1, box.width), height: Math.max(1, box.height) };
    if (event.pointerType === 'touch') {
      zoomRef.current.addPointer(event.pointerId, point, bounds);
      if (zoomRef.current.isHandling(event.pointerId)) {
        abortActiveTurn();
        if (pointerIdRef.current !== null) root.setPointerCapture?.(pointerIdRef.current);
        root.setPointerCapture?.(event.pointerId);
        pointerIdRef.current = null;
        gestureRef.current.reset();
        suppressClickRef.current = true;
        applyZoom(zoomRef.current.current);
        event.preventDefault();
        return;
      }
    }
    pointerIdRef.current = event.pointerId;
    suppressClickRef.current = false;
    gestureRef.current.start(point);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const point = { x: event.clientX - box.left, y: event.clientY - box.top, at: now() };
    const zoom = zoomRef.current.movePointer(event.pointerId, point, {
      width: Math.max(1, box.width),
      height: Math.max(1, box.height)
    });
    if (zoom.handled) {
      suppressClickRef.current = true;
      applyZoom(zoom.snapshot);
      event.preventDefault();
      return;
    }
    if (pointerIdRef.current !== event.pointerId) return;
    const gesture = gestureRef.current.move(point);
    if (gesture.intent !== 'undecided') suppressClickRef.current = true;
    if (gesture.intent !== 'turn' || !gesture.direction) return;
    if (!activeTurnRef.current && !begin(gesture.direction, point)) {
      gestureRef.current.reset();
      pointerIdRef.current = null;
      return;
    }
    root.setPointerCapture?.(event.pointerId);
    const turn = controllerRef.current.move(point);
    applyVisualState(turn);
    if (turn.phase === 'dragging') event.preventDefault();
  };

  const releasePointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const root = rootRef.current;
    const box = root?.getBoundingClientRect();
    const bounds = { width: Math.max(1, box?.width ?? 1), height: Math.max(1, box?.height ?? 1) };
    const point = {
      x: event.clientX - (box?.left ?? 0),
      y: event.clientY - (box?.top ?? 0),
      at: now()
    };
    if (zoomRef.current.isHandling(event.pointerId)) {
      if (pointerIdRef.current === event.pointerId) pointerIdRef.current = null;
      try {
        root?.releasePointerCapture?.(event.pointerId);
      } catch {
        // Browsers may release capture before pointercancel reaches React.
      }
      gestureRef.current.reset();
      suppressClickRef.current = true;
      applyZoom(zoomRef.current.removePointer(event.pointerId, bounds));
      return;
    }
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    try {
      root?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Browsers may release capture before pointercancel reaches React.
    }
    const gesture = cancelled ? null : gestureRef.current.finish(point, box?.width ?? 1);
    gestureRef.current.reset();
    const doubleTap =
      !cancelled && event.pointerType === 'touch' && !gesture?.tapDirection
        ? zoomRef.current.registerTap(point, bounds)
        : null;
    const zoom = zoomRef.current.removePointer(event.pointerId, bounds);
    if (doubleTap) {
      suppressClickRef.current = true;
      applyZoom(doubleTap);
      return;
    }
    applyZoom(zoom);
    if (gesture?.intent !== 'undecided') suppressClickRef.current = true;
    if (!activeTurnRef.current) {
      if (!cancelled && gesture?.intent === 'turn' && gesture.direction) {
        programmaticTurn(gesture.direction);
        return;
      }
      if (!cancelled && gesture?.tapDirection) programmaticTurn(gesture.tapDirection);
      return;
    }
    if (!cancelled && controllerRef.current.current.progress < 0.01) {
      controllerRef.current.reset();
      finishTurn(false);
      return;
    }
    const turn = cancelled ? controllerRef.current.cancel(now()) : controllerRef.current.release(now());
    if (turn.phase === 'idle') return;
    if (reducedMotion) {
      applyVisualState({ ...turn, progress: turn.phase === 'completing' ? 1 : 0, velocity: 0 });
      controllerRef.current.reset();
      finishTurn(turn.phase === 'completing');
      return;
    }
    onChangeState?.(turn.phase);
    settle();
  };

  useEffect(() => {
    const cancelInterruptedTurn = () => abortActiveTurn();
    const cancelOnHidden = () => {
      if (document.hidden) cancelInterruptedTurn();
    };
    window.addEventListener('blur', cancelInterruptedTurn);
    document.addEventListener('visibilitychange', cancelOnHidden);
    return () => {
      window.removeEventListener('blur', cancelInterruptedTurn);
      document.removeEventListener('visibilitychange', cancelOnHidden);
    };
  }, [abortActiveTurn]);

  const currentSpread = snapshot.visiblePages;
  const targetSpread = activeTurn ? stateRef.current.targetSpread(activeTurn.direction) : null;

  return (
    <div
      ref={rootRef}
      className={['flip-engine', className].filter(Boolean).join(' ')}
      data-layout={layout}
      data-phase="idle"
      onPointerCancel={(event) => releasePointer(event, true)}
      onLostPointerCapture={(event) => releasePointer(event, true)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => releasePointer(event, false)}
      onClick={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
      style={{ touchAction: 'pan-y' }}
    >
      <div className="flip-engine-spine" aria-hidden="true" />
      <PageRenderer
        activeTurn={activeTurn}
        currentSpread={currentSpread}
        layout={layout}
        movingRef={movingRef}
        pageCount={pageCount}
        renderPage={renderPage}
        targetSpread={targetSpread}
      />
    </div>
  );
});
