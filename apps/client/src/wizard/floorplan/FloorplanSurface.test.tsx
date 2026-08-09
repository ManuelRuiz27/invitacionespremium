import type { Floorplan, FloorplanShape } from '@invitaciones/api-client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloorplanSurface } from './FloorplanSurface';

const renderer = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }));
const resize = vi.hoisted(() => ({ emit: undefined as ((width: number, height: number) => void) | undefined }));
vi.mock('./FloorplanKonvaRenderer', () => ({
  FloorplanKonvaRenderer: (props: Record<string, unknown>) => {
    renderer.props = props;
    return <div data-testid="production-konva-renderer">Konva real</div>;
  }
}));

const table: FloorplanShape = {
  id: 'table-1',
  name: 'Uno',
  kind: 'TABLE',
  geometry: 'SQUARE',
  capacity: 8,
  occupancy: 0,
  availableCapacity: 8,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.2,
  rotation: 0,
  polygonPoints: null
};
const floorplan: Floorplan = {
  id: 'fp',
  eventId: 'event',
  image: { fileAssetId: 'asset', contentPath: '/asset' },
  locked: false,
  lockedAt: null,
  shapes: [table],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

describe('FloorplanSurface', () => {
  beforeEach(() => {
    renderer.props = undefined;
    class ImageStub {
      naturalWidth = 1000;
      naturalHeight = 500;
      onload: null | (() => void) = null;
      private value = '';
      set src(next: string) {
        this.value = next;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this.value;
      }
    }
    class ResizeObserverStub {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const emit = (width: number, height: number) =>
          this.callback(
            [{ target, contentRect: { width, height } } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
        if ((target as HTMLElement).dataset.testid === 'floorplan-renderer-host') resize.emit = emit;
        emit(800, 400);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('Image', ImageStub);
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('monta el renderer de producción en test y conecta selección, zoom, pan, snap, seats y dock', async () => {
    const onSelect = vi.fn();
    render(
      <FloorplanSurface
        floorplan={floorplan}
        imageUrl="blob:plan"
        disabled={false}
        onSelect={onSelect}
        onDraftChange={vi.fn()}
        dock={<div>Dock integrado</div>}
      />
    );
    expect(await screen.findByTestId('production-konva-renderer')).toBeInTheDocument();
    expect(renderer.props).toEqual(expect.objectContaining({ width: 800, height: 400 }));
    act(() => resize.emit?.(600, 900));
    await waitFor(() => expect(renderer.props).toEqual(expect.objectContaining({ width: 600, height: 300 })));
    expect(screen.getByText('Dock integrado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Acercar plano' }));
    await waitFor(() => expect(renderer.props?.viewport).toEqual({ scale: 1.2, x: 0, y: 0 }));
    await userEvent.click(screen.getByRole('button', { name: /modo mover plano/ }));
    await userEvent.click(screen.getByRole('button', { name: /ajuste magnético/ }));
    await userEvent.click(screen.getByRole('button', { name: /Mostrar sillas/ }));
    expect(renderer.props).toEqual(expect.objectContaining({ panEnabled: true, snap: true, showSeats: true }));
    act(() => (renderer.props?.onSelect as (shape: FloorplanShape) => void)(table));
    expect(onSelect).toHaveBeenCalledWith(table);
  });

  it('normaliza drop respecto a zoom/pan y mantiene la lista DOM/teclado', async () => {
    const onCanvasPlace = vi.fn();
    const onSelect = vi.fn();
    render(
      <FloorplanSurface
        floorplan={floorplan}
        imageUrl="blob:plan"
        disabled={false}
        onSelect={onSelect}
        onDraftChange={vi.fn()}
        onCanvasPlace={onCanvasPlace}
      />
    );
    await screen.findByTestId('production-konva-renderer');
    const host = screen.getByTestId('floorplan-renderer-host');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 800,
      height: 400,
      right: 810,
      bottom: 420,
      x: 10,
      y: 20,
      toJSON: () => ({})
    });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperties(drop, {
      clientX: { value: 410 },
      clientY: { value: 220 },
      dataTransfer: { value: { getData: () => 'pending-1' } }
    });
    fireEvent(host, drop);
    expect(onCanvasPlace).toHaveBeenCalledWith({ x: 0.5, y: 0.5 }, 'pending-1');
    await userEvent.click(screen.getByText(/Lista accesible del plano/));
    await userEvent.click(screen.getByRole('button', { name: 'Mesa Uno · 8' }));
    expect(onSelect).toHaveBeenCalledWith(table);
  });
});
