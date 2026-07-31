import type { FloorplanShapeInput } from '@invitaciones/api-client';

const MIN_SIZE = 0.001;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class FloorplanShapeValidationError extends Error {}

function requireFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new FloorplanShapeValidationError(`${label} debe ser un número finito.`);
}

function validatePolygon(points: FloorplanShapeInput['polygonPoints']) {
  if (!points || points.length < 3)
    throw new FloorplanShapeValidationError('El polígono requiere al menos tres puntos válidos.');
  for (const point of points) {
    requireFinite(point.x, 'La coordenada x del polígono');
    requireFinite(point.y, 'La coordenada y del polígono');
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)
      throw new FloorplanShapeValidationError('Los puntos del polígono deben permanecer entre 0 y 1.');
  }
  const area = Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
  if (area <= Number.EPSILON)
    throw new FloorplanShapeValidationError('El polígono no puede estar vacío ni ser degenerado.');
  return points.map(({ x, y }) => ({ x, y }));
}

export function normalizeFloorplanShape(shape: FloorplanShapeInput): FloorplanShapeInput {
  for (const [label, value] of [
    ['x', shape.x],
    ['y', shape.y],
    ['width', shape.width],
    ['height', shape.height],
    ['rotation', shape.rotation]
  ] as const)
    requireFinite(value, label);
  if (shape.width <= 0 || shape.height <= 0)
    throw new FloorplanShapeValidationError('El ancho y el alto deben ser mayores que cero.');

  const x = clamp(shape.x, 0, 1 - MIN_SIZE);
  const y = clamp(shape.y, 0, 1 - MIN_SIZE);
  const maxWidth = 1 - x;
  const maxHeight = 1 - y;
  const base = {
    ...shape,
    x,
    y,
    rotation: ((shape.rotation % 360) + 360) % 360
  };

  if (shape.geometry === 'SQUARE' || shape.geometry === 'CIRCLE') {
    const side = clamp(Math.max(shape.width, shape.height), MIN_SIZE, Math.min(maxWidth, maxHeight));
    return { ...base, width: side, height: side, polygonPoints: null };
  }

  const normalized = {
    ...base,
    width: clamp(shape.width, MIN_SIZE, maxWidth),
    height: clamp(shape.height, MIN_SIZE, maxHeight)
  };
  if (shape.geometry === 'POLYGON') return { ...normalized, polygonPoints: validatePolygon(shape.polygonPoints) };
  return { ...normalized, polygonPoints: null };
}

export function polygonClipPath(points: FloorplanShapeInput['polygonPoints']): string | undefined {
  if (!points || points.length < 3) return undefined;
  return `polygon(${points.map(({ x, y }) => `${x * 100}% ${y * 100}%`).join(', ')})`;
}
