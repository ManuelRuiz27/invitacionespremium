import type { Floorplan, FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorplanDomRenderer } from './FloorplanDomRenderer';

const table: FloorplanShape = {
  id: 'table-1',
  name: 'Mesa 1',
  kind: 'TABLE',
  geometry: 'RECTANGLE',
  capacity: 8,
  occupancy: 0,
  availableCapacity: 8,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.15,
  rotation: 0,
  polygonPoints: null
};

const floorplan: Floorplan = {
  id: 'floorplan',
  eventId: 'event',
  image: { fileAssetId: 'asset', contentPath: '/private' },
  locked: false,
  lockedAt: null,
  shapes: [table],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};
const detailedFloorplan: Floorplan = {
  ...floorplan,
  seatingMode: 'SEAT',
  seats: [
    {
      id: 'seat-1',
      floorplanShapeId: table.id,
      label: '1',
      x: 0.2,
      y: 0.2,
      isBlocked: false,
      occupied: false
    }
  ]
};

describe('FloorplanDomRenderer', () => {
  beforeEach(() => {
    class ResizeObserverStub {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { width: 1000, height: 500 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('previews pointer movement but commits one normalized draft only on pointerup', () => {
    const onDraftChange = vi.fn();
    render(
      <FloorplanDomRenderer
        floorplan={floorplan}
        imageUrl="blob:plan"
        selectedId={table.id}
        draft={table}
        disabled={false}
        showSeats={false}
        snap={false}
        onSelect={vi.fn()}
        onDraftChange={onDraftChange}
      />
    );
    const owner = screen.getByLabelText('Plano interactivo de mesas y zonas');
    vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    const mover = screen.getByLabelText('Mover mesa seleccionada');
    fireEvent.pointerDown(mover, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(mover, { pointerId: 1, clientX: 180, clientY: 160 });
    fireEvent.pointerMove(mover, { pointerId: 1, clientX: 220, clientY: 180 });
    expect(onDraftChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(mover, { pointerId: 1, clientX: 220, clientY: 180 });
    expect(onDraftChange).toHaveBeenCalledOnce();
    const result = onDraftChange.mock.calls[0]![0] as FloorplanShapeInput;
    expect(result).toEqual(expect.objectContaining({ x: 0.22, y: 0.26 }));
  });

  it('blocks placement and all editable controls while disabled', () => {
    const onDraftChange = vi.fn();
    const onCanvasPlace = vi.fn();
    render(
      <FloorplanDomRenderer
        floorplan={floorplan}
        imageUrl="blob:plan"
        selectedId={table.id}
        draft={table}
        disabled
        showSeats={false}
        snap={false}
        onSelect={vi.fn()}
        onDraftChange={onDraftChange}
        onCanvasPlace={onCanvasPlace}
      />
    );
    fireEvent.click(screen.getByLabelText('Plano interactivo de mesas y zonas'), { clientX: 300, clientY: 200 });
    expect(screen.getByRole('button', { name: /Cambiar tamaño/ })).toBeDisabled();
    expect(onCanvasPlace).not.toHaveBeenCalled();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('gives detailed-seat placement priority over a table and preserves normalized coordinates', () => {
    const onCanvasPlace = vi.fn();
    const onSelect = vi.fn();
    render(
      <FloorplanDomRenderer
        floorplan={detailedFloorplan}
        imageUrl="blob:plan"
        disabled={false}
        showSeats={false}
        snap={false}
        captureCanvasClicks
        onSelect={onSelect}
        onDraftChange={vi.fn()}
        onCanvasPlace={onCanvasPlace}
      />
    );
    const owner = screen.getByLabelText('Plano interactivo de mesas y zonas');
    vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    fireEvent.click(screen.getByRole('button', { name: 'Editar mesa Mesa 1' }), { clientX: 250, clientY: 150 });
    expect(onCanvasPlace).toHaveBeenCalledWith({ x: 0.25, y: 0.3 }, undefined);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('makes existing seats non-interactive while exact-seat placement is active', () => {
    const onCanvasPlace = vi.fn();
    const onSeatSelect = vi.fn();
    const onSeatMove = vi.fn();
    render(
      <FloorplanDomRenderer
        floorplan={detailedFloorplan}
        imageUrl="blob:plan"
        disabled={false}
        showSeats={false}
        snap={false}
        captureCanvasClicks
        onSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onCanvasPlace={onCanvasPlace}
        onSeatSelect={onSeatSelect}
        onSeatMove={onSeatMove}
      />
    );
    const owner = screen.getByLabelText('Plano interactivo de mesas y zonas');
    vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    expect(getComputedStyle(screen.getByRole('button', { name: /Lugar 1, disponible/ })).pointerEvents).toBe('none');
    fireEvent.click(owner, { clientX: 200, clientY: 100 });
    expect(onCanvasPlace).toHaveBeenCalledWith({ x: 0.2, y: 0.2 }, undefined);
    expect(onSeatSelect).not.toHaveBeenCalled();
    expect(onSeatMove).not.toHaveBeenCalled();
  });

  it('selects a seat without persisting until its pointer crosses the drag threshold', () => {
    const onSeatSelect = vi.fn();
    const onSeatMove = vi.fn();
    render(
      <FloorplanDomRenderer
        floorplan={detailedFloorplan}
        imageUrl="blob:plan"
        disabled={false}
        showSeats={false}
        snap={false}
        onSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onSeatSelect={onSeatSelect}
        onSeatMove={onSeatMove}
      />
    );
    const owner = screen.getByLabelText('Plano interactivo de mesas y zonas');
    vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    const seat = screen.getByRole('button', { name: /Lugar 1, disponible/ });
    fireEvent.pointerDown(seat, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(seat, { pointerId: 1, clientX: 202, clientY: 101 });
    fireEvent.pointerUp(seat, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.click(seat);
    expect(onSeatSelect).toHaveBeenCalledOnce();
    expect(onSeatMove).not.toHaveBeenCalled();
    fireEvent.pointerDown(seat, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(seat, { pointerId: 2, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(seat, { pointerId: 2, clientX: 400, clientY: 300 });
    expect(onSeatMove).toHaveBeenCalledOnce();
    expect(onSeatMove).toHaveBeenCalledWith('seat-1', { x: 0.4, y: 0.6 });
  });
});
