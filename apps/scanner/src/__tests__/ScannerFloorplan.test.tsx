import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FloorplanShape, ScannerFloorplanResponse } from '@invitaciones/api-client';
import { ScannerFloorplan } from '../components/ScannerFloorplan';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockObservedOwner(width: number, height: number) {
  class ResizeObserverStub {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: { width, height } } as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
}

const shape = (id: string, geometry: FloorplanShape['geometry']): FloorplanShape => ({
  id,
  name: id,
  kind: 'TABLE',
  geometry,
  capacity: 8,
  occupancy: 2,
  availableCapacity: 6,
  x: 0.2,
  y: 0.25,
  width: geometry === 'RECTANGLE' ? 0.3 : 0.2,
  height: 0.2,
  rotation: 30,
  polygonPoints:
    geometry === 'POLYGON'
      ? [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0.5, y: 1 }
        ]
      : null
});

const floorplan = (shapes: FloorplanShape[]): ScannerFloorplanResponse => ({
  floorplanId: '50000000-0000-4000-8000-000000000001',
  contentPath: '/floorplan/content',
  shapes
});

describe('ScannerFloorplan', () => {
  it.each(['RECTANGLE', 'POLYGON'] as const)('renderiza un overlay proporcional y rotado para %s', (geometry) => {
    render(
      <ScannerFloorplan
        floorplan={floorplan([shape('Mesa 12', geometry)])}
        contentUrl="https://content.example.test/floorplan"
        highlightedTableIds={['Mesa 12']}
      />
    );

    const image = screen.getByRole('img', { name: 'Croquis del recinto del Evento' });
    expect(image).toHaveStyle({ width: '100%', height: 'auto' });
    const overlay = screen.getByRole('img', { name: 'Ubicación de la Mesa Mesa 12 en el Croquis' });
    expect(overlay).toHaveAttribute('data-geometry', geometry);
    expect(overlay).toHaveStyle({
      left: '20%',
      top: '25%',
      width: geometry === 'RECTANGLE' ? '30%' : '20%',
      height: '20%',
      transform: 'rotate(30deg)'
    });
    if (geometry === 'POLYGON') expect(overlay).toHaveStyle({ clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' });
  });

  it.each([
    ['CIRCLE', 1000, 500],
    ['CIRCLE', 500, 1000],
    ['SQUARE', 1000, 500],
    ['SQUARE', 500, 1000]
  ] as const)('uses the shared physical-side projection for %s on a %d × %d owner', (geometry, width, height) => {
    mockObservedOwner(width, height);
    render(
      <ScannerFloorplan
        floorplan={floorplan([shape('Mesa 12', geometry)])}
        contentUrl="https://content.example.test/floorplan"
        highlightedTableIds={['Mesa 12']}
      />
    );

    const overlay = screen.getByRole('img', { name: 'Ubicación de la Mesa Mesa 12 en el Croquis' });
    const styles = getComputedStyle(overlay);
    expect((Number.parseFloat(styles.width) / 100) * width).toBeCloseTo(0.2 * Math.min(width, height), 8);
    expect((Number.parseFloat(styles.height) / 100) * height).toBeCloseTo(0.2 * Math.min(width, height), 8);
    expect(overlay).toHaveStyle({ left: '20%', top: '25%', transform: 'rotate(30deg)', transformOrigin: 'center' });
    if (geometry === 'CIRCLE') expect(overlay).toHaveStyle({ borderRadius: '50%' });
  });

  it('reprojects with the same horizontal vector used by Client', () => {
    mockObservedOwner(1000, 500);
    render(
      <ScannerFloorplan
        floorplan={floorplan([{ ...shape('Mesa 12', 'SQUARE'), x: 0.1, y: 0.1, rotation: 45 }])}
        contentUrl="https://content.example.test/floorplan"
        highlightedTableIds={['Mesa 12']}
      />
    );
    expect(screen.getByRole('img', { name: 'Ubicación de la Mesa Mesa 12 en el Croquis' })).toHaveStyle({
      left: '10%',
      top: '10%',
      width: '10%',
      height: '20%',
      transform: 'rotate(45deg)'
    });
  });

  it('no elige una Mesa arbitraria cuando hay varias Mesas seleccionadas', () => {
    render(
      <ScannerFloorplan
        floorplan={floorplan([shape('Mesa 12', 'CIRCLE'), shape('Mesa 14', 'RECTANGLE')])}
        contentUrl="https://content.example.test/floorplan"
        highlightedTableIds={['Mesa 12', 'Mesa 14']}
      />
    );

    expect(screen.getByText(/Asistentes seleccionados tienen Mesas distintas/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Ubicación de la Mesa/ })).not.toBeInTheDocument();
  });

  it('no resalta una zona decorativa aunque coincida el identificador', () => {
    const decorative = {
      ...shape('Escenario', 'RECTANGLE'),
      kind: 'DECORATIVE_ZONE' as const,
      capacity: 0,
      occupancy: 0,
      availableCapacity: 0
    };
    render(
      <ScannerFloorplan
        floorplan={floorplan([decorative])}
        contentUrl="https://content.example.test/floorplan"
        highlightedTableIds={['Escenario']}
      />
    );
    expect(screen.queryByRole('img', { name: /Ubicación de la Mesa/ })).not.toBeInTheDocument();
  });
});
