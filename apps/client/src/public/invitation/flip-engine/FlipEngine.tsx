import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';
import { BookState } from './book-state';
import { pageTurnGeometry } from './page-geometry';
import { PageTurnController } from './page-turn-controller';
import type { BookSnapshot, FlipDirection, FlipEnginePhase, FlipLayout, PointerPoint, TurnSnapshot } from './types';

export interface FlipEnginePageContext {
  folded: boolean;
  index: number;
  interactive: boolean;
  shouldLoad: boolean;
  visible: boolean;
}

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
  renderPage: (context: FlipEnginePageContext) => ReactNode;
}

const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

function pageSide(index: number, spread: number[]): 'left' | 'right' | 'center' {
  if (spread.length !== 2) return 'center';
  return spread[0] === index ? 'left' : 'right';
}

function slotStyle(side: 'left' | 'right' | 'center', layout: FlipLayout): CSSProperties {
  if (layout === 'single') return { left: '0', width: '100%' };
  if (side === 'center') return { left: '25%', width: '50%' };
  return { left: side === 'left' ? '0' : '50%', width: '50%' };
}

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const movingRef = useRef<HTMLDivElement | null>(null);
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const frameRef = useRef<number | null>(null);
  const originYRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<BookSnapshot>(() => stateRef.current.snapshot());
  const [activeTurn, setActiveTurn] = useState<ActiveTurn | null>(null);

  const emitSnapshot = useCallback(
    (next: BookSnapshot, changed = true) => {
      setSnapshot(next);
      if (changed) onPageChange?.(next);
    },
    [onPageChange]
  );

  useEffect(() => {
    const state = new BookState(pageCount, layout, snapshot.page);
    stateRef.current = state;
    const next = state.snapshot();
    setSnapshot(next);
    onReady?.(next);
    // The document identity changes when its ordered public page ids change.
    // A fresh state is required; carrying a prior turn would mix assets/tokens.
  }, [pageCount]);

  useEffect(() => {
    if (activeTurnRef.current) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      controllerRef.current.reset();
      activeTurnRef.current = null;
      setActiveTurn(null);
      onChangeState?.('idle');
    }
    const next = stateRef.current.setLayout(layout);
    setSnapshot(next);
  }, [layout, onChangeState]);

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
      const root = rootRef.current;
      if (root) {
        root.dataset.phase = 'idle';
        root.style.removeProperty('--flip-engine-progress');
        root.style.removeProperty('--flip-engine-shadow');
      }
    },
    [emitSnapshot, onChangeState]
  );

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
    [layout, onChangeState]
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
        emitSnapshot(next);
        return true;
      }
    }),
    [emitSnapshot, programmaticTurn]
  );

  const pointerDirection = (x: number, width: number): FlipDirection => (x >= width / 2 ? 'next' : 'prev');

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [role="button"]'))
      return;
    const root = rootRef.current;
    if (!root || activeTurnRef.current) return;
    const box = root.getBoundingClientRect();
    const direction = pointerDirection(event.clientX - box.left, box.width);
    const point = { x: event.clientX - box.left, y: event.clientY - box.top, at: now() };
    if (!begin(direction, point)) return;
    pointerIdRef.current = event.pointerId;
    root.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const turn = controllerRef.current.move({ x: event.clientX - box.left, y: event.clientY - box.top, at: now() });
    applyVisualState(turn);
    if (turn.phase === 'dragging') event.preventDefault();
  };

  const releasePointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    const root = rootRef.current;
    try {
      root?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Browsers may release capture before pointercancel reaches React.
    }
    if (!cancelled && controllerRef.current.current.progress < 0.01) {
      controllerRef.current.reset();
      finishTurn(false);
      return;
    }
    const turn = cancelled ? controllerRef.current.cancel(now()) : controllerRef.current.release(now());
    if (turn.phase === 'idle') return;
    onChangeState?.(turn.phase);
    settle();
  };

  const currentSpread = snapshot.visiblePages;
  const active = activeTurn;
  const visibleIndexes = useMemo(() => {
    const indexes = new Set(currentSpread);
    if (active) {
      indexes.add(active.source);
      indexes.add(active.reveal);
    }
    return indexes;
  }, [active, currentSpread]);
  const preloadIndexes = useMemo(() => {
    const indexes = new Set<number>();
    for (const index of visibleIndexes) {
      indexes.add(index);
      if (index > 0) indexes.add(index - 1);
      if (index < pageCount - 1) indexes.add(index + 1);
    }
    return indexes;
  }, [pageCount, visibleIndexes]);

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
      style={{ touchAction: 'pan-y' }}
    >
      <div className="flip-engine-spine" aria-hidden="true" />
      {Array.from({ length: pageCount }, (_, index) => {
        const isSource = active?.source === index;
        const isReveal = active?.reveal === index;
        const visible = visibleIndexes.has(index);
        const spread =
          isReveal && active ? (stateRef.current.targetSpread(active.direction) ?? currentSpread) : currentSpread;
        const side = isSource
          ? pageSide(index, currentSpread)
          : isReveal
            ? pageSide(index, spread)
            : pageSide(index, currentSpread);
        const style: CSSProperties = {
          ...slotStyle(side, layout),
          zIndex: isSource ? 4 : isReveal ? 2 : 1,
          visibility: visible ? 'visible' : 'hidden'
        };
        return (
          <div
            key={index}
            ref={isSource ? movingRef : undefined}
            className={[
              'flip-engine-page',
              'stf__item',
              visible ? '--shown' : undefined,
              isSource ? 'flip-engine-moving' : undefined
            ]
              .filter(Boolean)
              .join(' ')}
            data-flip-engine-role={isSource ? 'moving' : isReveal ? 'reveal' : 'static'}
            style={style}
          >
            {renderPage({
              folded: !active && currentSpread.length === 2 && currentSpread[0] === index,
              index,
              interactive: !active,
              shouldLoad: preloadIndexes.has(index),
              visible
            })}
          </div>
        );
      })}
    </div>
  );
});
