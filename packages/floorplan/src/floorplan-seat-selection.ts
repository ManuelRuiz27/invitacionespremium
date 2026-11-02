export const SEAT_INTERACTION_RADIUS = 22; // 44px diameter, always in screen/CSS pixels.
export type SeatCenter = { id: string; x: number; y: number; isBlocked?: boolean | undefined };
export type SeatScreenFrame = { left: number; top: number; width: number; height: number };
export type SeatPointer = { clientX: number; clientY: number; pointerId: number; button: number; isPrimary: boolean };

export function nearestSeat<T extends SeatCenter>(
  seats: readonly T[],
  point: { clientX: number; clientY: number },
  frame: SeatScreenFrame
): T | undefined {
  if (
    ![frame.left, frame.top, frame.width, frame.height, point.clientX, point.clientY].every(Number.isFinite) ||
    frame.width <= 0 ||
    frame.height <= 0
  )
    return;
  let closest: T | undefined;
  let distance = SEAT_INTERACTION_RADIUS ** 2;
  for (const seat of seats) {
    const center = { x: frame.left + seat.x * frame.width, y: frame.top + seat.y * frame.height };
    const squared = (point.clientX - center.x) ** 2 + (point.clientY - center.y) ** 2;
    if (!Number.isFinite(squared) || squared > distance) continue;
    // Exact ties only: blocked wins conservatively, then stable ID (never paint order).
    if (
      squared === distance &&
      closest &&
      (Boolean(closest.isBlocked) !== Boolean(seat.isBlocked) ? closest.isBlocked : closest.id < seat.id)
    )
      continue;
    closest = seat;
    distance = squared;
  }
  return closest;
}

export function isSpatialSeatConsumer(props: {
  readOnly?: boolean | undefined;
  tracePresentation?: boolean | undefined;
  captureCanvasClicks?: boolean | undefined;
  onSeatSelect?: unknown;
  onSeatMove?: unknown;
  floorplan: { seatingMode?: string | undefined };
}) {
  return Boolean(
    props.readOnly &&
    !props.tracePresentation &&
    !props.captureCanvasClicks &&
    props.onSeatSelect &&
    !props.onSeatMove &&
    props.floorplan.seatingMode === 'SEAT'
  );
}

export function createSeatSelectionGesture() {
  const pointers = new Set<number>();
  let start: SeatPointer | undefined;
  let cancelled = true;
  return {
    start(point: SeatPointer) {
      pointers.add(point.pointerId);
      if (pointers.size !== 1 || point.isPrimary === false || point.button !== 0) {
        cancelled = true;
        return;
      }
      start = {
        clientX: point.clientX,
        clientY: point.clientY,
        pointerId: point.pointerId,
        button: point.button,
        isPrimary: point.isPrimary
      };
      cancelled = false;
    },
    move(point: SeatPointer) {
      if (
        start?.pointerId === point.pointerId &&
        Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) > 5
      )
        cancelled = true;
    },
    finish(point: SeatPointer) {
      pointers.delete(point.pointerId);
      const valid = Boolean(start && start.pointerId === point.pointerId && !cancelled && pointers.size === 0);
      start = undefined;
      cancelled = true;
      return valid;
    },
    cancel(pointerId?: number) {
      cancelled = true;
      start = undefined;
      if (pointerId !== undefined) pointers.delete(pointerId);
      else pointers.clear();
    }
  };
}
