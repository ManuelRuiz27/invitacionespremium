import type { PointerEvent as ReactPointerEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { normalizeVisualRect, roundVisualRect, startRelativeRectPointer } from './relative-rect-pointer';

const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.2 };
const pointer = (type: string, pointerId: number, clientX: number, clientY: number) =>
  Object.assign(new Event(type), { pointerId, clientX, clientY });

describe('shared visual rectangle interaction', () => {
  it('rounds drag geometry to eight decimals without moving any edge outside its owner', () => {
    const rounded = roundVisualRect({ x: 0.123456789, y: 0.456789123, width: 0.876543216, height: 0.543210879 });
    expect(rounded.x).toBe(0.12345678);
    expect(rounded.y).toBe(0.45678912);
    expect(rounded.width).toBe(0.87654322);
    expect(rounded.height).toBe(0.54321088);
    expect(rounded.x + rounded.width).toBeLessThanOrEqual(1);
    expect(rounded.y + rounded.height).toBeLessThanOrEqual(1);
    for (const value of Object.values(rounded)) expect(value.toFixed(8)).toMatch(/^\d\.\d{8}$/u);
  });
  it('projects pointer movement against the rendered bounds, including zoom', () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    const cleanup = startRelativeRectPointer({
      event: {
        currentTarget: target,
        pointerId: 7,
        clientX: 10,
        clientY: 20,
        preventDefault: vi.fn()
      } as unknown as ReactPointerEvent<HTMLElement>,
      interaction: 'move',
      rect,
      bounds: { width: 1000, height: 2000 },
      onChange
    });
    target.dispatchEvent(pointer('pointermove', 9, 110, 220));
    expect(onChange).not.toHaveBeenCalled();
    target.dispatchEvent(pointer('pointermove', 7, 110, 220));
    expect(onChange.mock.calls[0]![0]).toMatchObject({ ...rect, x: 0.2, y: expect.closeTo(0.3, 10) });
    cleanup();
    target.dispatchEvent(pointer('pointermove', 7, 210, 420));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('stops after pointer cancellation and supports suspending a drag for multitouch', () => {
    const target = new EventTarget();
    const onChange = vi.fn();
    let ignore = true;
    startRelativeRectPointer({
      event: {
        currentTarget: target,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        preventDefault: vi.fn()
      } as unknown as ReactPointerEvent<HTMLElement>,
      interaction: 'resize',
      rect,
      bounds: { width: 100, height: 100 },
      onChange,
      shouldIgnore: () => ignore
    });
    target.dispatchEvent(pointer('pointermove', 1, 10, 10));
    expect(onChange).not.toHaveBeenCalled();
    ignore = false;
    target.dispatchEvent(pointer('pointermove', 1, 10, 10));
    expect(onChange.mock.calls[0]![0]).toMatchObject({ ...rect, width: 0.4, height: expect.closeTo(0.3, 10) });
    target.dispatchEvent(pointer('pointercancel', 1, 10, 10));
    target.dispatchEvent(pointer('pointermove', 1, 20, 20));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('keeps all handles within the canvas and retains the existing minimum rectangle size', () => {
    expect(normalizeVisualRect({ x: -1, y: 2, width: 3, height: -1 })).toEqual({
      x: 0,
      y: 0.96,
      width: 1,
      height: 0.04
    });
  });
});
