import { turnProgress } from './page-geometry';
import type { FlipDirection, PointerPoint, TurnBounds, TurnSnapshot } from './types';

const initial: TurnSnapshot = { phase: 'idle', direction: null, progress: 0, velocity: 0 };

export class PageTurnController {
  private bounds: TurnBounds = { width: 1, height: 1 };
  private origin: PointerPoint | null = null;
  private lastPoint: PointerPoint | null = null;
  private settleFrom = 0;
  private settleTo = 0;
  private settleStartedAt = 0;
  private settleDuration = 0;
  private snapshot: TurnSnapshot = initial;

  get current(): TurnSnapshot {
    return this.snapshot;
  }

  start(direction: FlipDirection, point: PointerPoint, bounds: TurnBounds): boolean {
    if (this.snapshot.phase !== 'idle' || bounds.width <= 0 || bounds.height <= 0) return false;
    this.bounds = bounds;
    this.origin = point;
    this.lastPoint = point;
    this.snapshot = { phase: 'dragging', direction, progress: 0, velocity: 0 };
    return true;
  }

  startProgrammatic(direction: FlipDirection, bounds: TurnBounds, at: number): boolean {
    const x = direction === 'next' ? bounds.width : 0;
    return this.start(direction, { x, y: bounds.height / 2, at }, bounds);
  }

  move(point: PointerPoint): TurnSnapshot {
    if (this.snapshot.phase !== 'dragging' || !this.origin || !this.lastPoint || !this.snapshot.direction)
      return this.snapshot;
    const progress = turnProgress(this.snapshot.direction, this.origin, point, this.bounds.width);
    const elapsed = Math.max(1, point.at - this.lastPoint.at);
    const velocity = ((progress - this.snapshot.progress) / elapsed) * 1000;
    this.lastPoint = point;
    this.snapshot = { ...this.snapshot, progress, velocity };
    return this.snapshot;
  }

  release(at: number): TurnSnapshot {
    if (this.snapshot.phase !== 'dragging') return this.snapshot;
    const complete = this.snapshot.progress >= 0.5 || this.snapshot.velocity >= 0.9;
    return this.beginSettle(complete ? 1 : 0, at);
  }

  complete(at: number): TurnSnapshot {
    if (this.snapshot.phase !== 'dragging') return this.snapshot;
    return this.beginSettle(1, at);
  }

  cancel(at: number): TurnSnapshot {
    if (this.snapshot.phase === 'idle') return this.snapshot;
    return this.beginSettle(0, at);
  }

  advance(at: number): { snapshot: TurnSnapshot; complete: boolean } {
    if (this.snapshot.phase !== 'completing' && this.snapshot.phase !== 'snapping_back')
      return { snapshot: this.snapshot, complete: this.snapshot.phase === 'idle' };
    const elapsed = Math.max(0, at - this.settleStartedAt);
    const ratio = Math.min(1, elapsed / this.settleDuration);
    const eased = 1 - Math.pow(1 - ratio, 3);
    const progress = this.settleFrom + (this.settleTo - this.settleFrom) * eased;
    this.snapshot = { ...this.snapshot, progress, velocity: 0 };
    if (ratio < 1) return { snapshot: this.snapshot, complete: false };
    const complete = this.settleTo === 1;
    const settled = this.snapshot;
    this.snapshot = initial;
    this.origin = null;
    this.lastPoint = null;
    return { snapshot: settled, complete };
  }

  reset(): void {
    this.snapshot = initial;
    this.origin = null;
    this.lastPoint = null;
  }

  private beginSettle(target: number, at: number): TurnSnapshot {
    const distance = Math.abs(target - this.snapshot.progress);
    this.settleFrom = this.snapshot.progress;
    this.settleTo = target;
    this.settleStartedAt = at;
    this.settleDuration = Math.max(160, Math.min(460, 180 + distance * 280));
    this.snapshot = {
      ...this.snapshot,
      phase: target === 1 ? 'completing' : 'snapping_back'
    };
    return this.snapshot;
  }
}
