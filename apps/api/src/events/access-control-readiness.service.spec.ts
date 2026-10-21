import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client';
import {
  recomputeAccessControlPreparationStatus,
  resolveAccessControlReadiness
} from './access-control-readiness.service';

describe('access preparation resolver', () => {
  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'projects only minimal %s readiness without writing state',
    async (accessMode) => {
      const tx = transaction({ accessMode, blockers: [], activeMaterialCount: 2, capacity: 3 });
      expect(await resolveAccessControlReadiness(tx.database, 'event')).toEqual({
        complete: true,
        accessMode,
        blockers: [],
        activeMaterialCount: 2,
        capacity: 3
      });
      expect(tx.update).not.toHaveBeenCalled();
    }
  );
  it('deduplicates and orders stable blocker codes', async () => {
    const tx = transaction({ accessMode: 'NOMINAL', blockers: ['Z', 'A', 'Z'], activeMaterialCount: 0, capacity: 3 });
    expect((await resolveAccessControlReadiness(tx.database, 'event')).blockers).toEqual(['A', 'Z']);
  });
  it.each([
    ['DRAFT', [], 'READY_TO_ACTIVATE', ['CONFIGURED', 'READY_TO_ACTIVATE']],
    ['READY_TO_ACTIVATE', ['EVENT_BASIC_DATA_INCOMPLETE'], 'DRAFT', ['CONFIGURED', 'DRAFT']],
    ['READY_TO_ACTIVATE', ['EVENT_ACCESS_CREDENTIAL_MISSING'], 'CONFIGURED', ['CONFIGURED']],
    ['CONFIGURED', [], 'READY_TO_ACTIVATE', ['READY_TO_ACTIVATE']],
    ['CONFIGURED', ['EVENT_ACCESS_MATERIAL_MISSING'], 'CONFIGURED', []]
  ] as const)('uses valid lifecycle edges from %s with blockers %j', async (status, blockers, target, writes) => {
    const tx = transaction(
      { accessMode: 'NOMINAL', blockers: [...blockers], activeMaterialCount: 0, capacity: 3 },
      status
    );
    expect(await recomputeAccessControlPreparationStatus(tx.database, 'event')).toMatchObject({ status: target });
    expect(tx.update.mock.calls.map(([arg]) => arg.data.status)).toEqual(writes);
  });
  it.each(['ACTIVE', 'EVENT_DAY', 'CLOSED', 'CANCELLED', 'ARCHIVED'])('does not demote %s', async (status) => {
    const tx = transaction(
      { accessMode: 'NOMINAL', blockers: ['MISSING'], activeMaterialCount: 0, capacity: 3 },
      status
    );
    expect(await recomputeAccessControlPreparationStatus(tx.database, 'event')).toBeNull();
    expect(tx.query).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
  function transaction(readiness: object, status = 'CONFIGURED') {
    const update = vi.fn(async (_arg: { data: { status: string } }) => ({}));
    const query = vi.fn(async () => [readiness]);
    const database = {
      $queryRaw: query,
      event: {
        findUnique: vi.fn(async () => ({
          status,
          deletedAt: null,
          floorplanEnabled: false,
          service: { code: 'ACCESS_CONTROL' }
        })),
        update
      }
    } as unknown as Prisma.TransactionClient;
    return { database, query, update };
  }
});
