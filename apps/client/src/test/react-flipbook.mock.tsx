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
  width?: number;
  height?: number;
  sizing?: 'responsive' | 'fixed';
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  autoSize?: boolean;
  usePortrait?: boolean;
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
  onChangeOrientation?: () => void;
}

const HTMLFlipBook = forwardRef<FlipBookHandle, Props>(function HTMLFlipBook(
  {
    children,
    initialPage = 0,
    page: _page,
    pageTransition: _pageTransition,
    onReady,
    onLoaded,
    onPageChange,
    onChangeState,
    width: _width,
    height: _height,
    sizing: _sizing,
    minWidth: _minWidth,
    maxWidth: _maxWidth,
    minHeight: _minHeight,
    maxHeight: _maxHeight,
    autoSize: _autoSize,
    usePortrait: _usePortrait,
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
    onChangeOrientation: _onChangeOrientation,
    'aria-label': ariaLabel,
    ...props
  },
  ref
) {
  const pages = useMemo(() => Children.toArray(children), [children]);
  const [page, setPage] = useState(initialPage);
  const snapshot = (nextPage: number): BookSnapshot => ({
    page: nextPage,
    pageCount: pages.length,
    orientation: 'portrait',
    visiblePages: [nextPage]
  });
  const move = (nextPage: number) => {
    if (nextPage < 0 || nextPage >= pages.length || nextPage === page) return false;
    onChangeState?.({ state: 'flipping' });
    setPage(nextPage);
    onPageChange?.(snapshot(nextPage));
    onChangeState?.({ state: 'read' });
    return true;
  };

  useImperativeHandle(ref, () => ({ pageFlip: () => null, flipNext: () => move(page + 1), flipPrev: () => move(page - 1), turnToPage: move, flipToPage: move }));
  useEffect(() => {
    const first = snapshot(page);
    onReady?.(first);
    onLoaded?.(first);
    // The mock deliberately exposes one leaf; grouping belongs to the pure model tests.
    // Browser QA exercises the actual flip engine.
  }, []);

  return (
    <div {...props} aria-label={ariaLabel as string | undefined} data-testid="flipbook-engine-mock">
      {pages.map((child, index) => (
        <div key={index} hidden={index !== page}>
          {child}
        </div>
      ))}
    </div>
  );
});

export default HTMLFlipBook;
