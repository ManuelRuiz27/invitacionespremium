import type { FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import { projectAspectAwareRect } from '@invitaciones/ui';
import type { RenderedSize } from '@invitaciones/ui';
import { normalizeFloorplanShape } from './floorplan-geometry';

export type SceneShape = FloorplanShape | FloorplanShapeInput;

export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export const hasEqualPhysicalSides = (geometry: SceneShape['geometry']) =>
  geometry === 'CIRCLE' || geometry === 'SQUARE';

export function shapeToStageRect(shape: SceneShape, size: RenderedSize): StageRect {
  const projected = projectAspectAwareRect(shape, size, hasEqualPhysicalSides(shape.geometry));
  return {
    x: projected.x * size.width,
    y: projected.y * size.height,
    width: projected.width * size.width,
    height: projected.height * size.height,
    rotation: shape.rotation
  };
}

export function stageRectToShape(shape: FloorplanShapeInput, rect: StageRect, size: RenderedSize) {
  if (size.width <= 0 || size.height <= 0) return shape;
  const equalSides = hasEqualPhysicalSides(shape.geometry);
  const logicalSide = Math.max(rect.width, rect.height) / Math.min(size.width, size.height);
  return normalizeFloorplanShape({
    ...shape,
    x: rect.x / size.width,
    y: rect.y / size.height,
    width: equalSides ? logicalSide : rect.width / size.width,
    height: equalSides ? logicalSide : rect.height / size.height,
    rotation: rect.rotation
  });
}

export function stagePointToNormalized(clientX: number, clientY: number, bounds: DOMRect) {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height))
  };
}
