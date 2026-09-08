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
  sourceElementId: null,
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
  image: { fileAssetId: 'asset', contentPath: '/private', sourceType: 'RASTER' },
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
    },
    {
      id: 'seat-2',
      floorplanShapeId: table.id,
      label: '2',
      x: 0.3,
      y: 0.2,
      isBlocked: false,
      occupied: false
    }
  ]
};

describe('FloorplanDomRenderer', () => {
  it('keeps mapped SVG geometry transparent, selects its shape and preserves manual stickers', () => {
    const mapped = { ...table, id: 'mapped', name: 'Mesa SVG', sourceElementId: 'private-source-id' };
    const onSelect = vi.fn();
    const view = render(<FloorplanDomRenderer floorplan={{ ...floorplan, shapes: [table, mapped] }} imageUrl="blob:svg"
      svgSource={{ selectableElements: [{ sourceElementId: 'private-source-id', bbox: mapped }] }}
      selectedId={mapped.id} draft={mapped} disabled={false} showSeats={false} snap={false}
      onSelect={onSelect} onDraftChange={vi.fn()} />);
    const element = screen.getByRole('button', { name: 'Mesa SVG, vinculado al plano' });
    expect(element).toHaveAttribute('aria-pressed', 'true');
    expect(getComputedStyle(element).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(screen.queryByLabelText('Editar mesa Mesa SVG')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mover mesa seleccionada')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Editar mesa Mesa 1')).toBeInTheDocument();
    expect(view.container.textContent).not.toContain('private-source-id');
    view.rerender(<FloorplanDomRenderer floorplan={{ ...floorplan, shapes: [table, mapped] }} imageUrl="blob:svg"
      svgSource={{ selectableElements: [{ sourceElementId: 'private-source-id', bbox: mapped }] }}
      disabled={false} showSeats={false} snap={false} onSelect={onSelect} onDraftChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mesa SVG, vinculado al plano' }));
    expect(onSelect).toHaveBeenCalledWith(mapped);
  });

  it('keeps unmapped element IDs private and blocks selection while locked', () => {
    const onSourceSelect = vi.fn();
    render(<FloorplanDomRenderer floorplan={floorplan} imageUrl="blob:svg"
      svgSource={{ selectableElements: [{ sourceElementId: 'secret-id', bbox: table }] }}
      disabled showSeats={false} snap={false} onSourceSelect={onSourceSelect} onSelect={vi.fn()} onDraftChange={vi.fn()} />);
    const element = screen.getByRole('button', { name: 'Elemento del plano 1, sin vincular' });
    expect(element).toBeDisabled();
    fireEvent.click(element);
    expect(onSourceSelect).not.toHaveBeenCalled();
  });
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

  it('reports plain and additive seat clicks and projects selectedSeatIds', () => {
    const onSeatSelect = vi.fn();
    render(
      <FloorplanDomRenderer
        floorplan={detailedFloorplan}
        imageUrl="blob:plan"
        disabled={false}
        showSeats={false}
        snap={false}
        selectedSeatIds={['seat-2']}
        onSelect={vi.fn()}
        onDraftChange={vi.fn()}
        onSeatSelect={onSeatSelect}
      />
    );
    const firstSeat = screen.getByRole('button', { name: /Lugar 1, disponible/ });
    const secondSeat = screen.getByRole('button', { name: /Lugar 2, disponible/ });
    expect(firstSeat).toHaveAttribute('aria-pressed', 'false');
    expect(secondSeat).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(firstSeat);
    fireEvent.click(firstSeat, { shiftKey: true });
    fireEvent.click(firstSeat, { ctrlKey: true });
    fireEvent.click(firstSeat, { metaKey: true });

    expect(onSeatSelect).toHaveBeenNthCalledWith(1, 'seat-1', { additive: false });
    expect(onSeatSelect).toHaveBeenNthCalledWith(2, 'seat-1', { additive: true });
    expect(onSeatSelect).toHaveBeenNthCalledWith(3, 'seat-1', { additive: true });
    expect(onSeatSelect).toHaveBeenNthCalledWith(4, 'seat-1', { additive: true });
  });
});
