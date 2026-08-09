import type { FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import { normalizeFloorplanShape } from './floorplan-geometry';

export type TableGeometry = Extract<FloorplanShapeInput['geometry'], 'CIRCLE' | 'SQUARE' | 'RECTANGLE'>;

export interface InventoryConfiguration {
  id: string;
  geometry: TableGeometry;
  quantity: number;
  capacity: number;
}

export interface PendingTable {
  temporaryId: string;
  input: FloorplanShapeInput;
}

const normalizedName = (value: string) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-MX');

export function createPendingTables(
  configurations: readonly InventoryConfiguration[],
  existingShapes: ReadonlyArray<Pick<FloorplanShape, 'name'>>
): PendingTable[] {
  const names = new Set(existingShapes.map((shape) => normalizedName(shape.name)));
  let sequence = 1;
  const nextName = () => {
    while (names.has(normalizedName(`Mesa ${sequence}`))) sequence += 1;
    const name = `Mesa ${sequence}`;
    names.add(normalizedName(name));
    sequence += 1;
    return name;
  };

  return configurations.flatMap((configuration) =>
    Array.from({ length: configuration.quantity }, () => ({
      temporaryId: globalThis.crypto.randomUUID(),
      input: {
        name: nextName(),
        kind: 'TABLE' as const,
        geometry: configuration.geometry,
        capacity: configuration.capacity,
        x: 0.1,
        y: 0.1,
        width: 0.12,
        height: configuration.geometry === 'RECTANGLE' ? 0.08 : 0.12,
        rotation: 0,
        polygonPoints: null
      }
    }))
  );
}

export function placePendingTable(table: PendingTable, point: { x: number; y: number }): FloorplanShapeInput {
  const width = table.input.width;
  const height = table.input.height;
  return normalizeFloorplanShape({
    ...table.input,
    x: point.x - width / 2,
    y: point.y - height / 2
  });
}

export function autoPlacePoint(index: number, total: number) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.max(1, Math.ceil(total / columns));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: (column + 0.5) / columns,
    y: (row + 0.5) / rows
  };
}

export function matchesAuthoritativeShape(table: PendingTable, shape: FloorplanShape) {
  return (
    normalizedName(table.input.name) === normalizedName(shape.name) &&
    shape.kind === 'TABLE' &&
    shape.geometry === table.input.geometry &&
    shape.capacity === table.input.capacity
  );
}
