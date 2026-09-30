import type { FlipDirection, PointerPoint, TurnBounds, TurnSnapshot } from './types';

export interface PageTurnGeometry {
  clipPath: string;
  foldOpacity: number;
  shadowOpacity: number;
  transform: string;
  transformOrigin: string;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function turnProgress(
  direction: FlipDirection,
  origin: PointerPoint,
  point: PointerPoint,
  width: number
): number {
  if (width <= 0) return 0;
  const raw = (direction === 'next' ? origin.x - point.x : point.x - origin.x) / width;
  if (raw <= 0) return 0;
  if (raw <= 1) return raw;
  return Math.min(1.12, 1 + (raw - 1) * 0.22);
}

export function pageTurnGeometry(snapshot: TurnSnapshot, bounds: TurnBounds, originY: number): PageTurnGeometry {
  const progress = clamp(snapshot.progress);
  const lift = Math.sin(Math.PI * progress);
  const grip = clamp(originY / Math.max(1, bounds.height));
  const signed = snapshot.direction === 'prev' ? 1 : -1;
  const translate = signed * bounds.width * progress;
  const rotate = signed * (4 + 10 * lift);
  const skew = signed * (grip - 0.5) * 7 * lift;
  const fold = clamp(100 - progress * 78);
  const topFold = clamp(fold + (grip - 0.5) * 14);
  const bottomFold = clamp(fold - (grip - 0.5) * 14);

  return {
    clipPath: `polygon(0 0, ${topFold}% 0, ${fold}% 50%, ${bottomFold}% 100%, 0 100%)`,
    foldOpacity: 0.12 + lift * 0.34,
    shadowOpacity: 0.08 + lift * 0.28,
    transform: `translate3d(${translate}px, 0, ${8 * lift}px) rotateY(${rotate}deg) skewY(${skew}deg)`,
    transformOrigin: snapshot.direction === 'prev' ? '100% 50%' : '0 50%'
  };
}
