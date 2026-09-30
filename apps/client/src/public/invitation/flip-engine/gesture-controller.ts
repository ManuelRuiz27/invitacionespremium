import type { FlipDirection, PointerPoint } from './types';

export type GestureIntent = 'undecided' | 'scroll' | 'turn';

export interface GestureDecision {
  direction: FlipDirection | null;
  intent: GestureIntent;
  tapDirection: FlipDirection | null;
}

const TAP_SLOP_PX = 8;
const HORIZONTAL_INTENT_RATIO = 1.2;
const TAP_ZONE_RATIO = 0.25;

/**
 * Classifies a single-pointer gesture before the engine starts a page turn.
 * It deliberately does not call preventDefault or mutate the DOM: the host
 * keeps native vertical scrolling until this controller resolves a turn.
 */
export class GestureController {
  private direction: FlipDirection | null = null;
  private intent: GestureIntent = 'undecided';
  private origin: PointerPoint | null = null;

  start(point: PointerPoint): void {
    this.origin = point;
    this.intent = 'undecided';
    this.direction = null;
  }

  move(point: PointerPoint): GestureDecision {
    if (!this.origin || this.intent !== 'undecided') return this.decision();

    const deltaX = point.x - this.origin.x;
    const deltaY = point.y - this.origin.y;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);

    if (Math.max(horizontal, vertical) < TAP_SLOP_PX) return this.decision();
    if (vertical > horizontal) {
      this.intent = 'scroll';
      return this.decision();
    }
    if (horizontal > vertical * HORIZONTAL_INTENT_RATIO) {
      this.intent = 'turn';
      this.direction = deltaX < 0 ? 'next' : 'prev';
    }
    return this.decision();
  }

  finish(point: PointerPoint, width: number): GestureDecision {
    const decision = this.move(point);
    if (!this.origin || decision.intent !== 'undecided') return decision;

    const horizontal = Math.abs(point.x - this.origin.x);
    const vertical = Math.abs(point.y - this.origin.y);
    if (Math.max(horizontal, vertical) >= TAP_SLOP_PX) {
      this.intent = 'scroll';
      return this.decision();
    }

    const zone = Math.max(0, Math.min(1, this.origin.x / Math.max(1, width)));
    return {
      ...this.decision(),
      tapDirection: zone <= TAP_ZONE_RATIO ? 'prev' : zone >= 1 - TAP_ZONE_RATIO ? 'next' : null
    };
  }

  reset(): void {
    this.origin = null;
    this.intent = 'undecided';
    this.direction = null;
  }

  private decision(): GestureDecision {
    return { direction: this.direction, intent: this.intent, tapDirection: null };
  }
}
