import { useRef, type PointerEvent } from 'react';
import type { FloorplanRendererProps } from './FloorplanDomRenderer';
import {
  createSeatSelectionGesture,
  isSpatialSeatConsumer,
  nearestSeat,
  type SeatScreenFrame
} from './floorplan-seat-selection';

export function useConsumerSeatSelection(props: FloorplanRendererProps, frame: () => SeatScreenFrame | undefined) {
  const enabled = isSpatialSeatConsumer(props);
  const gesture = useRef(createSeatSelectionGesture());
  const suppressNodeSelection = useRef(true);
  return {
    enabled,
    suppressNodeSelection: () => enabled && suppressNodeSelection.current,
    handlers: {
      onPointerDownCapture(event: PointerEvent<HTMLElement>) {
        if (!enabled) return;
        suppressNodeSelection.current = true;
        gesture.current.start(event);
        if (props.disabled || props.panEnabled) gesture.current.cancel();
      },
      onPointerMoveCapture(event: PointerEvent<HTMLElement>) {
        if (enabled) gesture.current.move(event);
      },
      onPointerUpCapture(event: PointerEvent<HTMLElement>) {
        if (!enabled) return;
        gesture.current.move(event);
        if (!gesture.current.finish(event) || props.disabled || props.panEnabled) return;
        const bounds = frame();
        if (!bounds) return;
        const seat = nearestSeat(props.floorplan.seats ?? [], event, bounds);
        suppressNodeSelection.current = Boolean(seat);
        if (seat && !seat.isBlocked)
          props.onSeatSelect?.(seat.id, { additive: event.shiftKey || event.ctrlKey || event.metaKey });
      },
      onPointerCancelCapture(event: PointerEvent<HTMLElement>) {
        if (enabled) {
          gesture.current.cancel(event.pointerId);
          suppressNodeSelection.current = true;
        }
      },
      onPointerLeave() {
        if (enabled) {
          gesture.current.cancel();
          suppressNodeSelection.current = true;
        }
      },
      onWheelCapture() {
        if (enabled) {
          gesture.current.cancel();
          suppressNodeSelection.current = true;
        }
      }
    }
  };
}
