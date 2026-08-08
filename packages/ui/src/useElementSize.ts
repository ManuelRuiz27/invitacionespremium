import { useCallback, useLayoutEffect, useState } from 'react';
import type { RefCallback } from 'react';
import type { RenderedSize } from './visual-geometry';

const emptySize: RenderedSize = { width: 0, height: 0 };

export function useElementSize<T extends Element>(): [RefCallback<T>, RenderedSize] {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<RenderedSize>(emptySize);
  const ref = useCallback<RefCallback<T>>((node) => setElement(node), []);

  useLayoutEffect(() => {
    if (!element) return;
    const commit = ({ width, height }: RenderedSize) => {
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    commit(element.getBoundingClientRect());
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) commit(entry.contentRect);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [ref, size];
}
