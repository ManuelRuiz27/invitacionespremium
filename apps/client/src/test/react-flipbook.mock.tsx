import {
  Children,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode
} from 'react';

export interface BookSnapshot {
  page: number;
  pageCount: number;
  orientation: 'portrait' | 'landscape';
  visiblePages: number[];
}

export interface FlipBookHandle {
  pageFlip: () => null;
  flipNext: () => boolean;
  flipPrev: () => boolean;
  turnToPage: (page: number) => boolean;
  flipToPage: (page: number) => boolean;
}

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  initialPage?: number;
  page?: number;
  pageTransition?: 'animate' | 'instant';
  onReady?: (snapshot: BookSnapshot) => void;
  onLoaded?: (snapshot: BookSnapshot) => void;
  onPageChange?: (snapshot: BookSnapshot) => void;
  onChangeState?: (info: { state: 'flipping' | 'read' }) => void;
  onChangeOrientation?: (info: { orientation: 'portrait' | 'landscape' }) => void;
  width?: number;
  height?: number;
  sizing?: 'responsive' | 'fixed';
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  autoSize?: boolean;
  usePortrait?: boolean;
  hardCovers?: boolean;
  flippingTime?: number;
  respectReducedMotion?: boolean;
  drawShadow?: boolean;
  maxShadowOpacity?: number;
  pageBackground?: string;
  flipOnClick?: 'anywhere' | 'corners' | 'never';
  respectInteractiveContent?: boolean;
  allowTouchScroll?: boolean;
  swipeDistance?: number;
  lazyRadius?: number;
  useKeyboard?: boolean;
  controls?: 'auto' | 'visible' | 'none';
  liveRegion?: boolean;
  roleDescription?: string;
}

function currentOrientation(): 'portrait' | 'landscape' {
  return window.innerWidth >= 768 ? 'landscape' : 'portrait';
}

function spreads(pageCount: number, orientation: 'portrait' | 'landscape', hardCovers: boolean): number[][] {
  if (orientation === 'portrait') return Array.from({ length: pageCount }, (_, pageIndex) => [pageIndex]);
  if (!hardCovers) return Array.from({ length: Math.ceil(pageCount / 2) }, (_, spreadIndex) => [spreadIndex * 2, spreadIndex * 2 + 1].filter((pageIndex) => pageIndex < pageCount));
  if (pageCount <= 1) return pageCount ? [[0]] : [];
  const result = [[0]];
  for (let pageIndex = 1; pageIndex < pageCount - 1; pageIndex += 2) {
    result.push([pageIndex, ...(pageIndex + 1 < pageCount - 1 ? [pageIndex + 1] : [])]);
  }
  result.push([pageCount - 1]);
  return result;
}

const HTMLFlipBook = forwardRef<FlipBookHandle, Props>(function HTMLFlipBook(
  {
    children,
    initialPage = 0,
    page: controlledPage,
    pageTransition: _pageTransition,
    onReady,
    onLoaded,
    onPageChange,
    onChangeState,
    onChangeOrientation,
    width: _width,
    height: _height,
    sizing: _sizing,
    minWidth: _minWidth,
    maxWidth: _maxWidth,
    minHeight: _minHeight,
    maxHeight: _maxHeight,
    autoSize: _autoSize,
    usePortrait: _usePortrait,
    hardCovers = false,
    flippingTime: _flippingTime,
    respectReducedMotion: _respectReducedMotion,
    drawShadow: _drawShadow,
    maxShadowOpacity: _maxShadowOpacity,
    pageBackground: _pageBackground,
    flipOnClick: _flipOnClick,
    respectInteractiveContent: _respectInteractiveContent,
    allowTouchScroll: _allowTouchScroll,
    swipeDistance: _swipeDistance,
    lazyRadius: _lazyRadius,
    useKeyboard: _useKeyboard,
    controls: _controls,
    liveRegion: _liveRegion,
    roleDescription: _roleDescription,
    'aria-label': ariaLabel,
    ...props
  },
  ref
) {
  const pages = useMemo(() => Children.toArray(children), [children]);
  const [orientation, setOrientation] = useState(currentOrientation);
  const [page, setPage] = useState(initialPage);
  const [lastTurnLeaf, setLastTurnLeaf] = useState<number | null>(null);
  const visiblePages = useMemo(() => {
    const currentSpread = spreads(pages.length, orientation, hardCovers).find((spread) => spread.includes(page));
    return currentSpread ?? [0];
  }, [hardCovers, orientation, page, pages.length]);
  const snapshot = (nextPage = page, nextOrientation = orientation): BookSnapshot => {
    const currentSpread = spreads(pages.length, nextOrientation, hardCovers).find((spread) => spread.includes(nextPage)) ?? [0];
    return { page: currentSpread[0]!, pageCount: pages.length, orientation: nextOrientation, visiblePages: currentSpread };
  };
  const move = (direction: 'next' | 'prev' | 'to', target?: number) => {
    const model = spreads(pages.length, orientation, hardCovers);
    const currentSpreadIndex = model.findIndex((spread) => spread.includes(page));
    const nextSpread = direction === 'to' ? model.find((spread) => spread.includes(target ?? -1)) : model[currentSpreadIndex + (direction === 'next' ? 1 : -1)];
    if (!nextSpread || nextSpread === model[currentSpreadIndex]) return false;
    const nextPage = nextSpread[0]!;
    const commit = () => {
      setPage(nextPage);
      onPageChange?.({ page: nextPage, pageCount: pages.length, orientation, visiblePages: nextSpread });
      onChangeState?.({ state: 'read' });
    };
    setLastTurnLeaf(nextPage);
    onChangeState?.({ state: 'flipping' });
    if ((globalThis as typeof globalThis & { __flipbookMockAsync?: boolean }).__flipbookMockAsync) window.setTimeout(commit, 0);
    else commit();
    return true;
  };

  useImperativeHandle(ref, () => ({
    pageFlip: () => null,
    flipNext: () => move('next'),
    flipPrev: () => move('prev'),
    turnToPage: (target) => move('to', target),
    flipToPage: (target) => move('to', target)
  }));
  useEffect(() => {
    const first = snapshot();
    onReady?.(first);
    onLoaded?.(first);
  }, []);
  useEffect(() => {
    const handleResize = () => {
      const nextOrientation = currentOrientation();
      if (nextOrientation === orientation) return;
      setOrientation(nextOrientation);
      const next = snapshot(page, nextOrientation);
      setPage(next.page);
      onChangeOrientation?.({ orientation: nextOrientation });
      onPageChange?.(next);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [hardCovers, orientation, page, pages.length]);
  useEffect(() => {
    if (controlledPage === undefined || controlledPage === page) return;
    move('to', controlledPage);
  }, [controlledPage]);

  return (
    <div
      {...props}
      aria-label={ariaLabel as string | undefined}
      data-testid="flipbook-engine-mock"
      data-orientation={orientation}
      data-last-turn-leaf={lastTurnLeaf ?? undefined}
    >
      {pages.map((child, index) => (
        <div key={index} hidden={!visiblePages.includes(index)} data-leaf-index={index}>
          {child}
        </div>
      ))}
    </div>
  );
});

export default HTMLFlipBook;
