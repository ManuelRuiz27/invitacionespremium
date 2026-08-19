import type { FloorplanShapeInput } from '@invitaciones/api-client';
import { describe, expect, it } from 'vitest';
import { normalizeFloorplanShape, polygonClipPath, screenDeltaToLocal } from './floorplan-geometry';

const shape = (geometry: FloorplanShapeInput['geometry']): FloorplanShapeInput => ({
  name: 'Forma',
  kind: 'TABLE',
  geometry,
  capacity: 1,
  x: 0.9,
  y: 0.85,
  width: 0.3,
  height: 0.2,
  rotation: 0,
  polygonPoints:
    geometry === 'POLYGON'
      ? [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0.5, y: 1 }
        ]
      : null
});

describe('floorplan geometry normalization', () => {
  it('transforms screen deltas into rotated local axes and preserves zero rotation', () => {
    expect(screenDeltaToLocal(12, -7, 0)).toEqual({ x: 12, y: -7 });
    const local = screenDeltaToLocal(Math.SQRT1_2 * 100, Math.SQRT1_2 * 100, 45);
    expect(local.x).toBeCloseTo(100, 10);
    expect(local.y).toBeCloseTo(0, 10);
  });

  it('keeps rectangles inside the normalized canvas', () => {
    const result = normalizeFloorplanShape(shape('RECTANGLE'));
    expect(result.x + result.width).toBeLessThanOrEqual(1);
    expect(result.y + result.height).toBeLessThanOrEqual(1);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it.each([
    ['top-left', -0.4, -0.2],
    ['top-right', 0.95, -0.2],
    ['bottom-left', -0.4, 0.95],
    ['bottom-right', 0.95, 0.95]
  ])('clamps drag/resize safely at the %s edge', (_edge, x, y) => {
    const result = normalizeFloorplanShape({ ...shape('RECTANGLE'), x, y, width: 0.4, height: 0.4 });
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.x + result.width).toBeLessThanOrEqual(1);
    expect(result.y + result.height).toBeLessThanOrEqual(1);
  });

  it.each([
    [-30, 330],
    [390, 30],
    [720, 0]
  ])('normalizes rotation %s to %s', (rotation, expected) => {
    expect(normalizeFloorplanShape({ ...shape('RECTANGLE'), rotation }).rotation).toBe(expected);
  });

  it.each(['SQUARE', 'CIRCLE'] as const)('uses one bounded side for %s', (geometry) => {
    const result = normalizeFloorplanShape(shape(geometry));
    expect(result.width).toBe(result.height);
    expect(result.x + result.width).toBeLessThanOrEqual(1);
    expect(result.y + result.height).toBeLessThanOrEqual(1);
  });

  it.each(['SQUARE', 'CIRCLE'] as const)('uses width as the authoritative side for %s', (geometry) => {
    const result = normalizeFloorplanShape({ ...shape(geometry), x: 0.1, y: 0.1, width: 0.1, height: 0.2 });
    expect(result.width).toBe(0.1);
    expect(result.height).toBe(0.1);
  });

  it('rejects missing, out-of-range and degenerate polygons before the API', () => {
    expect(() => normalizeFloorplanShape({ ...shape('POLYGON'), polygonPoints: [] })).toThrow(/tres puntos/i);
    expect(() =>
      normalizeFloorplanShape({
        ...shape('POLYGON'),
        polygonPoints: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 0, y: 1 }
        ]
      })
    ).toThrow(/entre 0 y 1/i);
    expect(() =>
      normalizeFloorplanShape({
        ...shape('POLYGON'),
        polygonPoints: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.5 },
          { x: 1, y: 1 }
        ]
      })
    ).toThrow(/degenerado/i);
  });

  it('rejects non-finite polygon points and more than the contractual maximum', () => {
    expect(() =>
      normalizeFloorplanShape({
        ...shape('POLYGON'),
        polygonPoints: [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 0.5 },
          { x: 1, y: 1 }
        ]
      })
    ).toThrow(/finito/i);
    expect(() =>
      normalizeFloorplanShape({
        ...shape('POLYGON'),
        polygonPoints: Array.from({ length: 65 }, (_, index) => ({
          x: (index % 8) / 8,
          y: Math.floor(index / 8) / 8
        }))
      })
    ).toThrow(/64 puntos/i);
  });

  it('builds the visible polygon from its points', () => {
    const polygon = normalizeFloorplanShape(shape('POLYGON'));
    expect(polygon.polygonPoints).toEqual(shape('POLYGON').polygonPoints);
    expect(polygonClipPath(polygon.polygonPoints)).toBe('polygon(0% 0%, 100% 0%, 50% 100%)');
  });
});
