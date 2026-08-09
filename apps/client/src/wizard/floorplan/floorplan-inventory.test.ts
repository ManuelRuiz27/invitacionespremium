import type { FloorplanShape } from '@invitaciones/api-client';
import { describe, expect, it, vi } from 'vitest';
import {
  autoPlacePoint,
  createPendingTables,
  matchesAuthoritativeShape,
  placePendingTable
} from './floorplan-inventory';

describe('floorplan inventory', () => {
  it('expands configurations without creating a Sticker entity and skips occupied names', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('draft-1').mockReturnValueOnce('draft-2') });
    const existing = [{ name: 'Mesa 1' }] as FloorplanShape[];
    const tables = createPendingTables([{ id: 'round', geometry: 'CIRCLE', quantity: 2, capacity: 10 }], existing);
    expect(tables.map((table) => table.input.name)).toEqual(['Mesa 2', 'Mesa 3']);
    expect(tables.every((table) => table.input.kind === 'TABLE')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('places a pending table around the requested normalized point', () => {
    const table = {
      temporaryId: 'draft',
      input: {
        name: 'Mesa 1',
        kind: 'TABLE' as const,
        geometry: 'RECTANGLE' as const,
        capacity: 8,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.1,
        rotation: 0,
        polygonPoints: null
      }
    };
    expect(placePendingTable(table, { x: 0.5, y: 0.5 })).toMatchObject({ x: 0.4, y: 0.45 });
    const authoritative = {
      ...table.input,
      id: 'table-1',
      name: '  MESA 1  ',
      occupancy: 0,
      availableCapacity: 8
    } satisfies FloorplanShape;
    expect(matchesAuthoritativeShape(table, authoritative)).toBe(true);
    expect(matchesAuthoritativeShape(table, { ...authoritative, capacity: 9 })).toBe(false);
  });

  it('reserves names already used by another pending batch', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('draft') });
    const tables = createPendingTables(
      [{ id: 'square', geometry: 'SQUARE', quantity: 1, capacity: 6 }],
      [{ name: 'Mesa 1' }, { name: 'Mesa 2' }]
    );
    expect(tables[0]?.input.name).toBe('Mesa 3');
    vi.unstubAllGlobals();
  });

  it('produces valid auto-placement points for 200 tables', () => {
    const points = Array.from({ length: 200 }, (_, index) => autoPlacePoint(index, 200));
    expect(points.every(({ x, y }) => x > 0 && x < 1 && y > 0 && y < 1)).toBe(true);
  });
});
