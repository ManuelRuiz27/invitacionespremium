import type { FlipDirection, PointerPoint, TurnBounds, TurnSnapshot } from './types';

export interface PageTurnGeometry {
  backOpacity: number;
  clipPath: string;
  curvature: number;
  foldOpacity: number;
  frontOpacity: number;
  projectionOpacity: number;
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

export function pageTurnGeometry(
  snapshot: TurnSnapshot,
  bounds: TurnBounds,
  originY: number,
  rigidity = 1
): PageTurnGeometry {
  const progress = clamp(snapshot.progress);
  const lift = Math.sin(Math.PI * progress);
  const flex = clamp(rigidity, 0.35, 1);
  const flexibleLift = lift * flex;
  const grip = clamp(originY / Math.max(1, bounds.height));
  const signed = snapshot.direction === 'prev' ? 1 : -1;
  const gripBias = grip - 0.5;
  const translate = signed * bounds.width * progress * 0.065 * flex;
  const rotate = signed * (180 * progress + 14 * flexibleLift);
  const skew = signed * gripBias * 14 * flexibleLift;
  const fold = clamp(100 - 38 * flexibleLift, 0, 100);
  const topFold = clamp(fold + gripBias * 26 * flexibleLift, 0, 100);
  const bottomFold = clamp(fold - gripBias * 26 * flexibleLift, 0, 100);
  const backReveal = clamp((progress - 0.32) / 0.2);
  const landingFade = clamp((progress - 0.86) / 0.14);
  const backOpacity = progress === 1 ? 0 : backReveal * (1 - landingFade);

  return {
    backOpacity,
    clipPath: `polygon(0 0, ${topFold}% 0, ${fold}% 50%, ${bottomFold}% 100%, 0 100%)`,
    curvature: flexibleLift,
    foldOpacity: 0.12 + flexibleLift * 0.62,
    frontOpacity: 1 - clamp((progress - 0.58) / 0.2),
    projectionOpacity: 0.12 + flexibleLift * 0.58,
    shadowOpacity: 0.1 + flexibleLift * 0.48,
    transform: `translate3d(${translate}px, 0, ${18 * flexibleLift}px) rotateY(${rotate}deg) skewY(${skew}deg)`,
    transformOrigin: snapshot.direction === 'prev' ? '100% 50%' : '0 50%'
  };
}
