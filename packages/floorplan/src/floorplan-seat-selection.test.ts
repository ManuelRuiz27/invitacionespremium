import { describe, expect, it } from 'vitest';
import { createSeatSelectionGesture, nearestSeat, SEAT_INTERACTION_RADIUS } from './floorplan-seat-selection';

const dense = Array.from({ length: 50 }, (_, index) => ({
  id: `seat-${String(index).padStart(2, '0')}`,
  x: 0.25 + (index % 10) * 0.008,
  y: 0.3 + Math.floor(index / 10) * 0.008,
  isBlocked: index === 21
}));
describe('consumer Seat selection in screen space', () => {
  it.each([0.5, 1, 2.0736, 4])('resolves all 50 exact centers independently at scale %s with pan', (scale) => {
    const frame = { left: -280, top: 120, width: 1000 * scale, height: 1500 * scale };
    for (const seat of dense) {
      const point = { clientX: frame.left + seat.x * frame.width, clientY: frame.top + seat.y * frame.height };
      expect(nearestSeat(dense, point, frame)?.id).toBe(seat.id);
      expect(nearestSeat([...dense].reverse(), point, frame)?.id).toBe(seat.id);
    }
  });
  it('uses nearest centers across overlapping targets, including blocked and occupied candidates', () => {
    const a = { id: 'a', x: 0.2, y: 0.2, isBlocked: false, occupied: true };
    const b = { id: 'b', x: 0.22, y: 0.2, isBlocked: true, occupied: false };
    const frame = { left: 0, top: 0, width: 1000, height: 500 };
    expect(nearestSeat([b, a], { clientX: 204, clientY: 100 }, frame)).toBe(a);
    expect(nearestSeat([a, b], { clientX: 218, clientY: 100 }, frame)).toBe(b);
    expect(nearestSeat([a, b], { clientX: 220, clientY: 100 }, frame)).toBe(b);
    expect(nearestSeat([a], { clientX: 200 + SEAT_INTERACTION_RADIUS, clientY: 100 }, frame)).toBe(a);
    expect(nearestSeat([a], { clientX: 222.001, clientY: 100 }, frame)).toBeUndefined();
  });
  it('breaks exact ties by blocked status then stable ID, independent of order', () => {
    const a = { id: 'a', x: 0.2, y: 0.2, isBlocked: false };
    const b = { id: 'b', x: 0.24, y: 0.2, isBlocked: false };
    const frame = { left: 0, top: 0, width: 1000, height: 500 };
    for (const candidates of [
      [a, b],
      [b, a]
    ])
      expect(nearestSeat(candidates, { clientX: 220, clientY: 100 }, frame)?.id).toBe('a');
    expect(nearestSeat([a, { ...b, isBlocked: true }], { clientX: 220, clientY: 100 }, frame)?.isBlocked).toBe(true);
    expect(nearestSeat(dense, { clientX: 0, clientY: 0 }, { ...frame, width: 0 })).toBeUndefined();
  });
});

const pointer = (id = 1, x = 100, primary = true) => ({
  pointerId: id,
  clientX: x,
  clientY: 100,
  button: 0,
  isPrimary: primary
});
describe('one intent per completed click gesture', () => {
  it('requires a start and consumes a gesture once', () => {
    const g = createSeatSelectionGesture();
    expect(g.finish(pointer())).toBe(false);
    g.start(pointer());
    expect(g.finish(pointer())).toBe(true);
    expect(g.finish(pointer())).toBe(false);
  });
  it('allows a fresh pointer ID after leaving/cancelling without receiving the previous pointer-up', () => {
    const g = createSeatSelectionGesture();
    g.start(pointer(1));
    g.cancel();
    g.start(pointer(7));
    expect(g.finish(pointer(7))).toBe(true);
  });
  it('rejects drag, pinch, wheel/cancel and non-primary sequences until a new gesture', () => {
    const g = createSeatSelectionGesture();
    g.start(pointer());
    g.move(pointer(1, 106));
    expect(g.finish(pointer())).toBe(false);
    g.start(pointer());
    g.start(pointer(2, 110, false));
    expect(g.finish(pointer(2))).toBe(false);
    expect(g.finish(pointer())).toBe(false);
    g.start(pointer());
    g.cancel();
    expect(g.finish(pointer())).toBe(false);
    g.start({ ...pointer(), button: 2 });
    expect(g.finish(pointer())).toBe(false);
    g.start(pointer());
    expect(g.finish(pointer())).toBe(true);
  });
});
