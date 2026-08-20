import type { Floorplan, FloorplanShape } from '@invitaciones/api-client';

export const FLOORPLAN_SCALE_COUNTS = [50, 100, 200] as const;

export function buildFloorplanTable(index: number): FloorplanShape {
  const columns = 20;
  return {
    id: `scale-table-${index + 1}`,
    name: `Mesa ${index + 1}`,
    kind: 'TABLE',
    geometry: 'CIRCLE',
    capacity: 10,
    occupancy: index % 5,
    availableCapacity: 10 - (index % 5),
    x: 0.005 + (index % columns) * 0.048,
    y: 0.005 + Math.floor(index / columns) * 0.09,
    width: 0.035,
    height: 0.035,
    rotation: 0,
    polygonPoints: null
  };
}

export function buildFloorplanScale(count: (typeof FLOORPLAN_SCALE_COUNTS)[number]): Floorplan {
  return {
    id: `scale-floorplan-${count}`,
    eventId: 'scale-event',
    image: { fileAssetId: 'scale-image', contentPath: '/private' },
    locked: false,
    lockedAt: null,
    shapes: Array.from({ length: count }, (_, index) => buildFloorplanTable(index)),
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z'
  };
}
