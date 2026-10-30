type Point = { clientX: number; clientY: number };

// A click following a drag, pinch, wheel or cancelled pointer is not a placement.
// Keep suppression until a new primary gesture, including after the pan key is released.
export function createPlacementGestureGuard() {
  let start: Point | undefined;
  let suppressed = false;
  return {
    start(point: Point, primary = true) {
      if (!primary) {
        suppressed = true;
        return;
      }
      start = point;
      suppressed = false;
    },
    move(point: Point) {
      if (start && Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) > 5) suppressed = true;
    },
    cancel() {
      suppressed = true;
    },
    canPlace() {
      return !suppressed;
    }
  };
}
