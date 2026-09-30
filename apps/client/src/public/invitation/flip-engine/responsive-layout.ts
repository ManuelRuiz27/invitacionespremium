import { useEffect, useState, type RefObject } from 'react';
import type { FlipLayout } from './types';

const PAGE_ASPECT_RATIO = 480 / 680;
const READER_HORIZONTAL_CHROME_PX = 32;
const READER_VERTICAL_CHROME_PX = 104;
const MIN_SPREAD_LEAF_WIDTH_PX = 280;
const MIN_SPREAD_VIEWPORT_WIDTH_PX = 900;

export interface ResponsiveViewport {
  height: number;
  width: number;
}

export interface ResponsiveLayout {
  layout: FlipLayout;
  viewport: ResponsiveViewport;
}

function currentViewport(): ResponsiveViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const visualViewport = window.visualViewport;
  return {
    height: Math.round(visualViewport?.height ?? window.innerHeight),
    width: Math.round(visualViewport?.width ?? window.innerWidth)
  };
}

export function resolveResponsiveLayout(viewport: ResponsiveViewport): FlipLayout {
  const width = Math.max(0, viewport.width);
  const height = Math.max(0, viewport.height);
  const availableWidth = Math.max(0, width - READER_HORIZONTAL_CHROME_PX);
  const availableHeight = Math.max(0, height - READER_VERTICAL_CHROME_PX);
  const leafWidth = Math.min(availableWidth / 2, availableHeight * PAGE_ASPECT_RATIO);

  return width >= MIN_SPREAD_VIEWPORT_WIDTH_PX && width > height && leafWidth >= MIN_SPREAD_LEAF_WIDTH_PX
    ? 'spread'
    : 'single';
}

export function useResponsiveLayout(containerRef: RefObject<Element | null>): ResponsiveLayout {
  const [viewport, setViewport] = useState(currentViewport);

  useEffect(() => {
    const container = containerRef.current;
    const updateViewport = () => {
      const next = currentViewport();
      setViewport((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    const visualViewport = window.visualViewport;
    const observer =
      typeof ResizeObserver === 'undefined' || !container ? undefined : new ResizeObserver(updateViewport);

    if (observer && container) observer.observe(container);
    window.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('resize', updateViewport);
    updateViewport();

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, [containerRef]);

  return { layout: resolveResponsiveLayout(viewport), viewport };
}
