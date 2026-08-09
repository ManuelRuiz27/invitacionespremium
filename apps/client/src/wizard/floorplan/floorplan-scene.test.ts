import type { FloorplanShapeInput } from '@invitaciones/api-client';
import { describe, expect, it } from 'vitest';
import { shapeToStageRect, stageRectToShape } from './floorplan-scene';

const shape: FloorplanShapeInput = {
  name: 'Mesa 1',
  kind: 'TABLE',
  geometry: 'CIRCLE',
  capacity: 10,
  x: 0.2,
  y: 0.25,
  width: 0.2,
  height: 0.2,
  rotation: 30,
  polygonPoints: null
};

describe('floorplan scene adapters', () => {
  it.each([
    ['horizontal', 1000, 500],
    ['vertical', 500, 1000],
    ['square', 800, 800]
  ])('round-trips equal physical sides on a %s owner', (_label, width, height) => {
    const size = { width, height };
    const rect = shapeToStageRect(shape, size);
    expect(rect.width).toBeCloseTo(rect.height, 8);
    expect(stageRectToShape(shape, rect, size)).toMatchObject(shape);
  });

  it('keeps rectangle projection direct', () => {
    const rectangle = { ...shape, geometry: 'RECTANGLE' as const, width: 0.3, height: 0.15 };
    const rect = shapeToStageRect(rectangle, { width: 1000, height: 500 });
    expect(rect).toMatchObject({ x: 200, y: 125, width: 300, height: 75, rotation: 30 });
  });
});
