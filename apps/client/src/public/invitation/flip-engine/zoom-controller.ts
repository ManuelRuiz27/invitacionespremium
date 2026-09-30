import type { PointerPoint, TurnBounds } from './types';

export interface ZoomSnapshot {
  scale: number;
  x: number;
  y: number;
}

const FIT_SCALE = 1;
const READABLE_SCALE = 2;
const MAX_SCALE = 3;
const DOUBLE_TAP_DELAY_MS = 320;
const DOUBLE_TAP_SLOP_PX = 28;

const fit: ZoomSnapshot = { scale: FIT_SCALE, x: 0, y: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function midpoint(points: PointerPoint[]): PointerPoint {
  const [first, second] = points;
  if (!first || !second) return first ?? { x: 0, y: 0, at: 0 };
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, at: Math.max(first.at, second.at) };
}

function distance(points: PointerPoint[]): number {
  const [first, second] = points;
  if (!first || !second) return 0;
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/** Owns the fit/readable scale and bounded pan position for one FlipEngine. */
export class ZoomController {
  private lastTap: PointerPoint | null = null;
  private mode: 'idle' | 'panning' | 'pinching' = 'idle';
  private panOrigin: PointerPoint | null = null;
  private panStart: ZoomSnapshot = fit;
  private pinchDistance = 0;
  private pinchMidpoint: PointerPoint | null = null;
  private pinchStart: ZoomSnapshot = fit;
  private points = new Map<number, PointerPoint>();
  private snapshot: ZoomSnapshot = fit;

  get current(): ZoomSnapshot {
    return this.snapshot;
  }

  get isZoomed(): boolean {
    return this.snapshot.scale > FIT_SCALE;
  }

  addPointer(pointerId: number, point: PointerPoint, bounds: TurnBounds): ZoomSnapshot {
    this.points.set(pointerId, point);
    if (this.points.size >= 2) {
      this.startPinch();
      return this.snapshot;
    }
    if (this.isZoomed) this.startPan(point, bounds);
    return this.snapshot;
  }

  movePointer(pointerId: number, point: PointerPoint, bounds: TurnBounds): { handled: boolean; snapshot: ZoomSnapshot } {
    if (!this.points.has(pointerId)) return { handled: false, snapshot: this.snapshot };
    this.points.set(pointerId, point);

    if (this.mode === 'pinching' && this.points.size >= 2 && this.pinchMidpoint) {
      const points = [...this.points.values()].slice(0, 2);
      const nextScale = clamp(this.pinchStart.scale * (distance(points) / Math.max(1, this.pinchDistance)), FIT_SCALE, MAX_SCALE);
      const nextMidpoint = midpoint(points);
      const fromCenterX = this.pinchMidpoint.x - bounds.width / 2;
      const fromCenterY = this.pinchMidpoint.y - bounds.height / 2;
      this.snapshot = this.constrain(
        {
          scale: nextScale,
          x: this.pinchStart.x + fromCenterX * (this.pinchStart.scale - nextScale) + nextMidpoint.x - this.pinchMidpoint.x,
          y: this.pinchStart.y + fromCenterY * (this.pinchStart.scale - nextScale) + nextMidpoint.y - this.pinchMidpoint.y
        },
        bounds
      );
      return { handled: true, snapshot: this.snapshot };
    }

    if (this.mode === 'panning' && this.panOrigin) {
      this.snapshot = this.constrain(
        {
          scale: this.panStart.scale,
          x: this.panStart.x + point.x - this.panOrigin.x,
          y: this.panStart.y + point.y - this.panOrigin.y
        },
        bounds
      );
      return { handled: true, snapshot: this.snapshot };
    }
    return { handled: false, snapshot: this.snapshot };
  }

  isHandling(pointerId: number): boolean {
    return this.points.has(pointerId) && this.mode !== 'idle';
  }

  removePointer(pointerId: number, bounds: TurnBounds): ZoomSnapshot {
    this.points.delete(pointerId);
    if (this.points.size >= 2) {
      this.startPinch();
      return this.snapshot;
    }
    const remaining = this.points.values().next().value as PointerPoint | undefined;
    if (remaining && this.isZoomed) this.startPan(remaining, bounds);
    else this.mode = 'idle';
    return this.snapshot;
  }

  toggleAt(point: PointerPoint, bounds: TurnBounds): ZoomSnapshot {
    this.snapshot = this.isZoomed ? fit : this.zoomAt(point, READABLE_SCALE, bounds);
    this.lastTap = null;
    return this.snapshot;
  }

  registerTap(point: PointerPoint, bounds: TurnBounds): ZoomSnapshot | null {
    const prior = this.lastTap;
    this.lastTap = point;
    if (!prior || point.at - prior.at > DOUBLE_TAP_DELAY_MS || Math.hypot(point.x - prior.x, point.y - prior.y) > DOUBLE_TAP_SLOP_PX)
      return null;
    return this.toggleAt(point, bounds);
  }

  reset(): ZoomSnapshot {
    this.lastTap = null;
    this.mode = 'idle';
    this.panOrigin = null;
    this.points.clear();
    this.snapshot = fit;
    return this.snapshot;
  }

  private constrain(snapshot: ZoomSnapshot, bounds: TurnBounds): ZoomSnapshot {
    const maxX = (bounds.width * (snapshot.scale - FIT_SCALE)) / 2;
    const maxY = (bounds.height * (snapshot.scale - FIT_SCALE)) / 2;
    const x = clamp(snapshot.x, -maxX, maxX);
    const y = clamp(snapshot.y, -maxY, maxY);
    return {
      scale: snapshot.scale,
      x: x === 0 ? 0 : x,
      y: y === 0 ? 0 : y
    };
  }

  private startPan(point: PointerPoint, _bounds: TurnBounds): void {
    this.mode = 'panning';
    this.panOrigin = point;
    this.panStart = this.snapshot;
  }

  private startPinch(): void {
    const points = [...this.points.values()].slice(0, 2);
    this.mode = 'pinching';
    this.pinchDistance = distance(points);
    this.pinchMidpoint = midpoint(points);
    this.pinchStart = this.snapshot;
  }

  private zoomAt(point: PointerPoint, scale: number, bounds: TurnBounds): ZoomSnapshot {
    const target = clamp(scale, FIT_SCALE, MAX_SCALE);
    return this.constrain(
      {
        scale: target,
        x: (point.x - bounds.width / 2) * (FIT_SCALE - target),
        y: (point.y - bounds.height / 2) * (FIT_SCALE - target)
      },
      bounds
    );
  }
}
