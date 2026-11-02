import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Floorplan } from '@invitaciones/api-client';

vi.mock('react-konva', () => {
  const node = (name: string) =>
    forwardRef<Record<string, unknown>, Record<string, unknown>>((props, ref) => {
      const element = useRef<HTMLDivElement>(null);
      useImperativeHandle(ref, () => ({
        container: () => element.current!,
        getContent: () => element.current!.querySelector('[data-mock-content]') ?? element.current!,
        cache() {},
        clearCache() {},
        getLayer: () => ({ batchDraw() {} }),
        nodes() {},
        stopDrag() {}
      }));
      return React.createElement(
        'div',
        { ref: element, 'data-testid': `mock-${name}` },
        name === 'Stage'
          ? React.createElement(
              'div',
              { 'data-mock-content': true, 'data-testid': 'mock-content' },
              props.children as React.ReactNode
            )
          : (props.children as React.ReactNode)
      );
    });
  return Object.fromEntries(
    ['Stage', 'Layer', 'Group', 'Circle', 'Rect', 'Text', 'Line', 'Transformer', 'Image'].map((name) => [
      name,
      node(name)
    ])
  );
});
import { FloorplanDomRenderer } from './FloorplanDomRenderer';
import { FloorplanKonvaRenderer } from './FloorplanKonvaRenderer';

const seats = Array.from({ length: 50 }, (_, i) => ({
  id: `seat-${String(i).padStart(2, '0')}`,
  floorplanShapeId: 'table',
  label: `Lugar ${i + 1}`,
  x: 0.3 + (i % 10) * 0.008,
  y: 0.3 + Math.floor(i / 10) * 0.008,
  isBlocked: false,
  occupied: false
}));
const floorplan: Floorplan = {
  id: 'fp',
  eventId: 'event',
  image: { fileAssetId: 'image', contentPath: '/image', sourceType: 'RASTER' },
  shapes: [],
  seats,
  seatingMode: 'SEAT',
  locked: true,
  lockedAt: '2026-01-01T00:00:00Z',
  createdAt: '',
  updatedAt: ''
};
const rect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  x: left,
  y: top,
  right: left + width,
  bottom: top + height,
  toJSON() {}
});
class Pointer extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}
beforeEach(() => vi.stubGlobal('PointerEvent', Pointer));
afterEach(() => vi.unstubAllGlobals());

describe.each(['Konva', 'DOM'] as const)('%s consumer screen selection', (renderer) => {
  function mount(scale = 1, overrides: Record<string, unknown> = {}) {
    const onSeatSelect = vi.fn(),
      onSelect = vi.fn();
    const viewport = { scale, x: -180, y: 45 };
    const props = {
      floorplan,
      imageUrl: 'blob:fixture',
      readOnly: true,
      disabled: false,
      showSeats: false,
      snap: false,
      onSelect,
      onDraftChange: vi.fn(),
      onSeatSelect,
      viewport,
      onViewportChange: vi.fn(),
      ...overrides
    };
    const view = render(
      renderer === 'Konva' ? (
        <FloorplanKonvaRenderer {...props} image={{} as HTMLImageElement} width={1000} height={1500} />
      ) : (
        <FloorplanDomRenderer {...props} />
      )
    );
    const owner =
      renderer === 'Konva'
        ? screen.getByTestId('floorplan-konva-pointer-surface')
        : screen.getByLabelText('Plano interactivo de mesas y zonas');
    const frame = rect(20 + viewport.x, 40 + viewport.y, 1000 * scale, 1500 * scale);
    vi.spyOn(
      renderer === 'Konva' ? screen.getByTestId('mock-content') : owner,
      'getBoundingClientRect'
    ).mockReturnValue(renderer === 'Konva' ? rect(20, 40, 1000, 1500) : frame);
    const click = (x: number, y: number) => {
      fireEvent.pointerDown(owner, { clientX: x, clientY: y, pointerId: 1, button: 0 });
      fireEvent.pointerUp(owner, { clientX: x, clientY: y, pointerId: 1, button: 0 });
    };
    return { view, owner, frame, click, onSeatSelect, onSelect };
  }
  it.each([0.5, 1, 2.0736, 4])(
    'resolves the same fifty exact centers at %s, independently of node order and pan',
    (scale) => {
      const test = mount(scale);
      for (const [i, seat] of seats.entries()) {
        test.click(test.frame.left + seat.x * test.frame.width, test.frame.top + seat.y * test.frame.height);
        expect(test.onSeatSelect).toHaveBeenNthCalledWith(i + 1, seat.id, { additive: false });
      }
      expect(test.onSeatSelect).toHaveBeenCalledTimes(50);
    }
  );
  it('does not select a neighbor at a blocked center or outside the interaction radius', () => {
    const test = mount(2.0736, {
      floorplan: { ...floorplan, seats: seats.map((s, i) => ({ ...s, isBlocked: i === 0 })) }
    });
    test.click(test.frame.left + seats[0]!.x * test.frame.width, test.frame.top + seats[0]!.y * test.frame.height);
    test.click(test.frame.left + 10, test.frame.top + 10);
    expect(test.onSeatSelect).not.toHaveBeenCalled();
    test.click(test.frame.left + seats[1]!.x * test.frame.width, test.frame.top + seats[1]!.y * test.frame.height);
    expect(test.onSeatSelect).toHaveBeenCalledOnce();
    expect(test.onSeatSelect).toHaveBeenCalledWith(seats[1]!.id, { additive: false });
  });
  if (renderer === 'Konva')
    it('uses the painted content frame when its container clips a wider canvas', () => {
      const test = mount();
      vi.spyOn(screen.getByTestId('mock-Stage'), 'getBoundingClientRect').mockReturnValue(rect(20, 40, 400, 1500));
      test.click(test.frame.left + seats[0]!.x * test.frame.width, test.frame.top + seats[0]!.y * test.frame.height);
      expect(test.onSeatSelect).toHaveBeenCalledWith(seats[0]!.id, { additive: false });
    });
  it('rejects drag, pinch, wheel, cancel and pan gestures', () => {
    const test = mount();
    const p = {
      clientX: test.frame.left + seats[0]!.x * test.frame.width,
      clientY: test.frame.top + seats[0]!.y * test.frame.height,
      pointerId: 1,
      button: 0
    };
    fireEvent.pointerDown(test.owner, p);
    fireEvent.pointerMove(test.owner, { ...p, clientX: p.clientX + 6 });
    fireEvent.pointerUp(test.owner, p);
    fireEvent.pointerDown(test.owner, p);
    fireEvent.pointerDown(test.owner, { ...p, pointerId: 2, isPrimary: false });
    fireEvent.pointerUp(test.owner, { ...p, pointerId: 2 });
    fireEvent.pointerUp(test.owner, p);
    fireEvent.pointerDown(test.owner, p);
    fireEvent.wheel(test.owner, { deltaY: 10 });
    fireEvent.pointerUp(test.owner, p);
    fireEvent.pointerDown(test.owner, p);
    fireEvent.pointerCancel(test.owner, p);
    fireEvent.pointerUp(test.owner, p);
    expect(test.onSeatSelect).not.toHaveBeenCalled();
    test.view.unmount();
    const pan = mount(1, { panEnabled: true });
    pan.click(p.clientX, p.clientY);
    expect(pan.onSeatSelect).not.toHaveBeenCalled();
  });
  if (renderer === 'DOM')
    it('keeps keyboard names and ignores the wrong overlapping button pointer click after resolution', () => {
      const test = mount(2.0736);
      const point = {
        clientX: test.frame.left + seats[0]!.x * test.frame.width,
        clientY: test.frame.top + seats[0]!.y * test.frame.height
      };
      test.click(point.clientX, point.clientY);
      fireEvent.click(screen.getByRole('button', { name: 'Lugar Lugar 2, disponible' }), {
        ...point,
        detail: 1
      });
      expect(test.onSeatSelect).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole('button', { name: 'Lugar Lugar 2, disponible' }), { detail: 0 });
      expect(test.onSeatSelect).toHaveBeenLastCalledWith(seats[1]!.id, { additive: false });
      act(() => screen.getByRole('button', { name: 'Lugar Lugar 1, disponible' }).focus());
      expect(screen.getByRole('button', { name: 'Lugar Lugar 1, disponible' })).toHaveFocus();
    });
});
