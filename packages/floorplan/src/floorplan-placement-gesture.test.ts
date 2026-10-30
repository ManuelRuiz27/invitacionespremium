import { describe, expect, it } from 'vitest';
import { createPlacementGestureGuard } from './floorplan-placement-gesture';

describe('placement gesture guard', () => {
  it('rejects drag, pinch/cancel and wheel continuations until a new primary click', () => {
    const guard = createPlacementGestureGuard();
    const point = { clientX: 20, clientY: 20 };
    guard.start(point);
    guard.move({ clientX: 40, clientY: 20 });
    guard.move(point);
    expect(guard.canPlace()).toBe(false);
    guard.start(point);
    expect(guard.canPlace()).toBe(true);
    guard.start(point, false);
    expect(guard.canPlace()).toBe(false);
    guard.start(point);
    guard.cancel();
    expect(guard.canPlace()).toBe(false);
    guard.start(point);
    guard.move({ clientX: 22, clientY: 21 });
    expect(guard.canPlace()).toBe(true);
  });
});
