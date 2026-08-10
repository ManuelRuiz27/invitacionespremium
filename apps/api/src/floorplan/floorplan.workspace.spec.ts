import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import { FloorplanService } from './floorplan.service';

const principal = {
  userId: 'user',
  sessionId: 'session',
  email: 'planner@example.test',
  role: 'INDEPENDENT_PLANNER',
  clientId: 'client',
  clientType: 'PLANNER',
  clientStatus: 'ACTIVE'
} as AuthPrincipal;

describe('Floorplan seating workspace query count', () => {
  it.each([
    ['UNASSIGNED', false],
    ['TABLE', true]
  ] as const)('uses a fixed aggregate query count for %s', async (scope, withTable) => {
    const raw = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ unassigned_count: 0, table_assistants: 0, table_passes: 0 }]);
    const tx = {
      floorplan: { findFirst: vi.fn().mockResolvedValue({ id: 'floorplan' }) },
      floorplanShape: {
        findFirst: vi.fn().mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111', name: '12', capacity: 10 })
      },
      $queryRaw: raw
    };
    const prisma = { $transaction: vi.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)) };
    const access = { requireOwnedEvent: vi.fn().mockResolvedValue({ id: 'event' }) };
    const service = new FloorplanService(
      prisma as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await service.seatingWorkspace(
      'event',
      withTable ? { scope, tableShapeId: '11111111-1111-4111-8111-111111111111', limit: 50 } : { scope, limit: 50 },
      principal
    );

    expect(access.requireOwnedEvent).toHaveBeenCalledOnce();
    expect(tx.floorplan.findFirst).toHaveBeenCalledOnce();
    expect(tx.floorplanShape.findFirst).toHaveBeenCalledTimes(withTable ? 1 : 0);
    expect(raw).toHaveBeenCalledTimes(2);
  });
});
