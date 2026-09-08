import type { Floorplan, FloorplanShape } from '@invitaciones/api-client';
import { describe, expect, it } from 'vitest';
import { resolveSvgTableVisualState } from './floorplan-svg-table-state';

const table: FloorplanShape = {
  id: 'svg-table', sourceElementId: 'table-source', name: 'Mesa SVG', kind: 'TABLE', geometry: 'RECTANGLE',
  capacity: 8, occupancy: 0, availableCapacity: 8, x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0, polygonPoints: null
};
const floorplan: Floorplan = {
  id: 'floorplan', eventId: 'event', image: { fileAssetId: 'asset', contentPath: '/asset', sourceType: 'SVG' },
  locked: false, lockedAt: null, shapes: [table], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
};

describe('resolveSvgTableVisualState', () => {
  it.each([
    [0, 'EMPTY', 'Vacía · 0 de 8'],
    [3, 'PARTIAL', 'Parcial · 3 de 8'],
    [8, 'FULL', 'Completa · 8 de 8']
  ] as const)('derives the %s occupancy state from the authoritative Shape', (occupancy, expected, label) => {
    const state = resolveSvgTableVisualState(floorplan, { ...table, occupancy }, { selected: false, readOnly: false });
    expect(state).toMatchObject({ capacity: 8, occupancy, occupancyState: expected, label });
  });

  it('derives SEAT capacity only from active, unblocked global seats and retains selected/read-only text', () => {
    const state = resolveSvgTableVisualState(
      {
        ...floorplan,
        seatingMode: 'SEAT',
        seats: [
          { id: 'one', floorplanShapeId: table.id, label: '1', x: 0.85, y: 0.8, isBlocked: false, occupied: true },
          { id: 'two', floorplanShapeId: table.id, label: '2', x: 0.9, y: 0.8, isBlocked: false, occupied: false },
          { id: 'blocked', floorplanShapeId: table.id, label: '3', x: 0.95, y: 0.8, isBlocked: true, occupied: false }
        ]
      },
      { ...table, capacity: 99, occupancy: 1 },
      { selected: true, readOnly: true }
    );
    expect(state).toMatchObject({ capacity: 2, occupancy: 1, occupancyState: 'PARTIAL' });
    expect(state?.label).toBe('Parcial · 1 de 2 · Seleccionada · Solo lectura');
  });
});
