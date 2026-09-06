import { describe, expect, it, vi } from 'vitest';
import { FileAssetStatus, FloorplanSeatingMode, FloorplanShapeKind } from '../generated/prisma/client';
import { FLOORPLAN_READINESS_BLOCKERS, resolveFloorplanReadiness } from './floorplan-readiness.service';

describe('Floorplan readiness', () => {
  it('requires an active Floorplan', async () => {
    const tx = { floorplan: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(resolveFloorplanReadiness(tx as never, crypto.randomUUID())).resolves.toEqual({
      complete: false,
      blockers: [FLOORPLAN_READINESS_BLOCKERS.MISSING]
    });
  });

  it('requires a READY image and at least one assignable table', async () => {
    const tx = {
      floorplan: {
        findFirst: vi.fn().mockResolvedValue({
          imageAsset: { status: FileAssetStatus.READY, deletedAt: null },
          shapes: [{ kind: FloorplanShapeKind.TABLE, capacity: 8 }]
        })
      }
    };
    await expect(resolveFloorplanReadiness(tx as never, crypto.randomUUID())).resolves.toEqual({
      complete: true,
      blockers: []
    });
  });

  it('reports only technical blockers', async () => {
    const tx = {
      floorplan: {
        findFirst: vi.fn().mockResolvedValue({
          imageAsset: { status: FileAssetStatus.HIDDEN, deletedAt: null },
          shapes: [{ kind: FloorplanShapeKind.DECORATIVE_ZONE, capacity: 0 }]
        })
      }
    };
    const result = await resolveFloorplanReadiness(tx as never, crypto.randomUUID());
    expect(result.complete).toBe(false);
    expect(result.blockers).toEqual([
      FLOORPLAN_READINESS_BLOCKERS.IMAGE_NOT_READY,
      FLOORPLAN_READINESS_BLOCKERS.TABLE_MISSING
    ]);
  });

  it('requires each detailed-seating table to match its active, unblocked seats', async () => {
    const tx = {
      floorplan: {
        findFirst: vi.fn().mockResolvedValue({
          seatingMode: FloorplanSeatingMode.SEAT,
          imageAsset: { status: FileAssetStatus.READY, deletedAt: null },
          shapes: [{ id: 'table-1', kind: FloorplanShapeKind.TABLE, capacity: 1 }],
          seats: [{ floorplanShapeId: 'table-1', isBlocked: false }]
        })
      }
    };
    await expect(resolveFloorplanReadiness(tx as never, crypto.randomUUID())).resolves.toEqual({
      complete: true,
      blockers: []
    });
    tx.floorplan.findFirst.mockResolvedValueOnce({
      seatingMode: FloorplanSeatingMode.SEAT,
      imageAsset: { status: FileAssetStatus.READY, deletedAt: null },
      shapes: [{ id: 'table-1', kind: FloorplanShapeKind.TABLE, capacity: 1 }],
      seats: [{ floorplanShapeId: 'table-1', isBlocked: true }]
    });
    await expect(resolveFloorplanReadiness(tx as never, crypto.randomUUID())).resolves.toEqual({
      complete: false,
      blockers: [FLOORPLAN_READINESS_BLOCKERS.INCONSISTENT]
    });
  });
});
