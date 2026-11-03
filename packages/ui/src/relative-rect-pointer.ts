import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RelativeVisualRect } from './visual-geometry';

export function normalizeVisualRect(rect: RelativeVisualRect): RelativeVisualRect {
  const width = Math.min(1, Math.max(0.04, rect.width));
  const height = Math.min(1, Math.max(0.04, rect.height));
  return {
    x: Math.min(1 - width, Math.max(0, rect.x)),
    y: Math.min(1 - height, Math.max(0, rect.y)),
    width,
    height
  };
}

/** Quantize visual geometry before persistence without crossing the owner's edges. */
export function roundVisualRect(rect: RelativeVisualRect): RelativeVisualRect {
  const scale = 100_000_000;
  const widthUnits = Math.max(1, Math.min(scale, Math.round(rect.width * scale)));
  const heightUnits = Math.max(1, Math.min(scale, Math.round(rect.height * scale)));
  const xUnits = Math.max(0, Math.min(scale - widthUnits, Math.round(rect.x * scale)));
  const yUnits = Math.max(0, Math.min(scale - heightUnits, Math.round(rect.y * scale)));
  const x = xUnits / scale;
  const y = yUnits / scale;
  const width = widthUnits / scale;
  const height = heightUnits / scale;
  return {
    x,
    y,
    width: x + width > 1 ? (widthUnits - 1) / scale : width,
    height: y + height > 1 ? (heightUnits - 1) / scale : height
  };
}

/** Presentation-only pointer projection, shared by visual overlays and action regions. */
export function startRelativeRectPointer({
  event,
  interaction,
  rect,
  bounds,
  onChange,
  normalize = normalizeVisualRect,
  shouldIgnore
}: {
  event: ReactPointerEvent<HTMLElement>;
  interaction: 'move' | 'resize';
  rect: RelativeVisualRect;
  bounds: Pick<DOMRect, 'width' | 'height'>;
  onChange: (rect: RelativeVisualRect) => void;
  normalize?: (rect: RelativeVisualRect) => RelativeVisualRect;
  shouldIgnore?: (event: PointerEvent) => boolean;
}): () => void {
  if (bounds.width <= 0 || bounds.height <= 0) return () => undefined;
  event.preventDefault();
  const target = event.currentTarget;
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  target.setPointerCapture?.(pointerId);
  const onMove = (next: PointerEvent) => {
    if (next.pointerId !== pointerId || shouldIgnore?.(next)) return;
    next.preventDefault();
    const deltaX = (next.clientX - startX) / bounds.width;
    const deltaY = (next.clientY - startY) / bounds.height;
    onChange(
      normalize({
        ...rect,
        ...(interaction === 'move'
          ? { x: rect.x + deltaX, y: rect.y + deltaY }
          : { width: rect.width + deltaX, height: rect.height + deltaY })
      })
    );
  };
  const finish = (finishedEvent?: Event) => {
    if (finishedEvent && 'pointerId' in finishedEvent && finishedEvent.pointerId !== pointerId) return;
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
    target.removeEventListener('lostpointercapture', finish);
  };
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
  target.addEventListener('lostpointercapture', finish);
  return finish;
}
