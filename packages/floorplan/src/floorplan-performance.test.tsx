import type { Floorplan, FloorplanShape } from '@invitaciones/api-client';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FloorplanDomRenderer } from './FloorplanDomRenderer';
import { buildFloorplanScale, FLOORPLAN_SCALE_COUNTS } from './test/floorplan-scale-fixtures';

const shape = (index: number): FloorplanShape => ({
  id: `table-${index}`,
  name: `Mesa ${index + 1}`,
  kind: 'TABLE',
  geometry: index % 3 === 0 ? 'CIRCLE' : index % 3 === 1 ? 'SQUARE' : 'RECTANGLE',
  capacity: 10,
  occupancy: 0,
  availableCapacity: 10,
  x: (index % 15) / 15,
  y: (Math.floor(index / 15) % 14) / 14,
  width: 0.05,
  height: 0.05,
  rotation: 0,
  polygonPoints: null
});

const floorplan = (count: number): Floorplan => ({
  id: 'profile-floorplan',
  eventId: 'profile-event',
  image: { fileAssetId: 'profile-image', contentPath: '/private' },
  locked: false,
  lockedAt: null,
  shapes: Array.from({ length: count }, (_, index) => shape(index)),
  createdAt: '2026-08-09T00:00:00Z',
  updatedAt: '2026-08-09T00:00:00Z'
});

afterEach(cleanup);

describe('floorplan renderer profiling matrix', () => {
  it.each(FLOORPLAN_SCALE_COUNTS)('renders and selects representative tables across %d Mesas', (count) => {
    const selected: string[] = [];
    const startedAt = performance.now();
    const view = render(
      <FloorplanDomRenderer
        floorplan={buildFloorplanScale(count)}
        imageUrl="profile-image.png"
        disabled={false}
        showSeats={false}
        snap={false}
        onSelect={(table) => selected.push(table.id)}
        onDraftChange={() => undefined}
      />
    );
    const elapsedMs = performance.now() - startedAt;
    const tableNodes = [...view.container.querySelectorAll<HTMLButtonElement>('[aria-label^="Editar mesa"]')];
    expect(tableNodes).toHaveLength(count);
    for (const index of [0, Math.floor(count / 2), count - 1]) tableNodes[index]!.click();
    expect(selected).toEqual(['scale-table-1', `scale-table-${Math.floor(count / 2) + 1}`, `scale-table-${count}`]);
    if (import.meta.env.FLOORPLAN_PROFILE === '1') {
      console.info(
        JSON.stringify({
          scenario: `scale-${count}`,
          tables: count,
          domNodes: view.container.querySelectorAll('*').length,
          elapsedMs
        })
      );
    }
  });

  it('profiles the boutique visual-seat scenario without creating persisted seats', () => {
    const startedAt = performance.now();
    const view = render(
      <FloorplanDomRenderer
        floorplan={floorplan(20)}
        imageUrl="profile-image.png"
        disabled={false}
        showSeats
        snap={false}
        onSelect={() => undefined}
        onDraftChange={() => undefined}
      />
    );
    const elapsedMs = performance.now() - startedAt;
    expect(view.container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(200);
    if (import.meta.env.FLOORPLAN_PROFILE === '1') {
      console.info(
        JSON.stringify({
          scenario: 'boutique visual seats',
          tables: 20,
          visualSeats: 200,
          domNodes: view.container.querySelectorAll('*').length,
          elapsedMs
        })
      );
    }
  });
});
