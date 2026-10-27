import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import type { PrismaService } from '../common/database/prisma.service';
import { EventAccessPolicy } from '../events/event-access.policy';
import { AccessControlOperationsService } from './access-control-operations.service';

const principal: AuthPrincipal = {
  userId: 'planner',
  sessionId: 'session',
  email: 'planner@example.com',
  role: 'ORGANIZATION_PLANNER',
  clientId: 'tenant',
  clientType: 'ORGANIZATION',
  clientOperatingProfile: 'MANAGED',
  clientStatus: 'ACTIVE'
};

function fixture({ expired = false, detailExpired = false, inconsistent = false } = {}) {
  const detail = { surface: 'client' },
    summary = { surface: 'provider' };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'provider' }) },
    event: {
      findFirst: vi.fn().mockResolvedValue({
        service: { code: 'ACCESS_CONTROL' },
        accessMode: 'NOMINAL',
        status: 'ACTIVE',
        client: { type: 'ORGANIZATION', operatingProfile: 'MANAGED', status: 'ACTIVE', deletedAt: null }
      })
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ expired, detailExpired }])
      .mockResolvedValueOnce([{ inconsistent, detail, summary }])
  };
  const transaction = vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx));
  const service = new AccessControlOperationsService(
    { $transaction: transaction } as unknown as PrismaService,
    new EventAccessPolicy()
  );
  return { service, tx, transaction, detail, summary };
}

describe('authoritative access operations service', () => {
  it('keeps the planner ownership check and the projection in one repeatable read transaction', async () => {
    const f = fixture();
    expect(await f.service.client('event', principal)).toBe(f.detail);
    expect(f.tx.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event', deletedAt: null, clientId: 'tenant', assignedPlannerUserId: 'planner' }
      })
    );
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      maxWait: 5000,
      timeout: 10000
    });
  });

  it('returns only the provider summary after checking the current platform user', async () => {
    const f = fixture();
    expect(await f.service.provider('event', 'tenant', { ...principal, role: 'PLATFORM_ADMIN', clientId: null })).toBe(
      f.summary
    );
    expect(f.tx.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'planner', role: 'PLATFORM_ADMIN', clientId: null, deletedAt: null },
      select: { id: true }
    });
    expect(f.tx.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'event', deletedAt: null, clientId: 'tenant' } })
    );
  });

  it('rejects an expired nominal identity before building any projection', async () => {
    const f = fixture({ detailExpired: true });
    await expect(f.service.client('event', principal)).rejects.toMatchObject({
      response: { code: 'ACCESS_OPERATIONS_DETAIL_EXPIRED' }
    });
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('never substitutes counters when the database reports inconsistent material', async () => {
    const f = fixture({ inconsistent: true });
    await expect(f.service.client('event', principal)).rejects.toMatchObject({
      response: { code: 'ACCESS_OPERATIONS_INCONSISTENT' }
    });
  });
});
