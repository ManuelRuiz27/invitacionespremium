import type { CSSProperties, MutableRefObject, ReactNode } from 'react';
import { LightingRenderer } from './lighting-renderer';
import type { FlipDirection, FlipLayout, PageRenderContext } from './types';

interface ActiveTurn {
  direction: FlipDirection;
  reveal: number;
  source: number;
}

interface PageRendererProps {
  activeTurn: ActiveTurn | null;
  currentSpread: number[];
  layout: FlipLayout;
  movingRef: MutableRefObject<HTMLDivElement | null>;
  pageCount: number;
  renderPage: (context: PageRenderContext) => ReactNode;
  targetSpread: number[] | null;
}

function pageSide(index: number, spread: number[]): 'left' | 'right' | 'center' {
  if (spread.length !== 2) return 'center';
  return spread[0] === index ? 'left' : 'right';
}

function slotStyle(side: 'left' | 'right' | 'center', layout: FlipLayout): CSSProperties {
  if (layout === 'single') return { left: '0', width: '100%' };
  if (side === 'center') return { left: '25%', width: '50%' };
  return { left: side === 'left' ? '0' : '50%', width: '50%' };
}

export function PageRenderer({
  activeTurn,
  currentSpread,
  layout,
  movingRef,
  pageCount,
  renderPage,
  targetSpread
}: PageRendererProps) {
  const visibleIndexes = new Set(currentSpread);
  if (activeTurn) {
    visibleIndexes.add(activeTurn.source);
    visibleIndexes.add(activeTurn.reveal);
  }

  const preloadIndexes = new Set<number>();
  for (const index of visibleIndexes) {
    preloadIndexes.add(index);
    if (index > 0) preloadIndexes.add(index - 1);
    if (index < pageCount - 1) preloadIndexes.add(index + 1);
  }

  return Array.from({ length: pageCount }, (_, index) => {
    const isSource = activeTurn?.source === index;
    const isReveal = activeTurn?.reveal === index;
    const visible = visibleIndexes.has(index);
    const spread = isReveal && activeTurn ? (targetSpread ?? currentSpread) : currentSpread;
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
          isSource ? 'flip-engine-moving' : undefined
        ]
          .filter(Boolean)
          .join(' ')}
        data-flip-engine-role={isSource ? 'moving' : isReveal ? 'reveal' : 'static'}
        data-flip-engine-visible={visible || undefined}
        data-turn-direction={isSource ? activeTurn.direction : undefined}
        style={style}
      >
        <div className="flip-engine-page-face flip-engine-page-front">
          {renderPage({
            folded: !activeTurn && currentSpread.length === 2 && currentSpread[0] === index,
            index,
            interactive: !activeTurn,
            shouldLoad: preloadIndexes.has(index),
            visible
          })}
        </div>
        {isSource && <div className="flip-engine-page-face flip-engine-page-back" aria-hidden="true" />}
        <LightingRenderer active={isSource} />
      </div>
    );
  });
}
