import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../common/database/prisma.service';
import { EventAccessPolicy } from '../events/event-access.policy';
import type { NominalAccessTokenService } from './nominal-access-token.service';
import type { NominalAccessQrService } from './nominal-access-qr.service';
import { NominalAccessService } from './nominal-access.service';

describe('NominalAccessService boundaries', () => {
  const principal = { role: 'ORGANIZATION_ADMIN', userId: 'actor', clientId: 'tenant' } as AuthPrincipal;
  function fixture() {
    const event = {
      id: 'event',
      accessMode: 'NOMINAL',
      service: { code: 'ACCESS_CONTROL' },
      client: { type: 'ORGANIZATION', operatingProfile: 'MANAGED', status: 'ACTIVE', deletedAt: null },
      deletedAt: null,
      status: 'DRAFT'
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findFirst: vi.fn().mockResolvedValue(event) },
      assistantAccessCredential: { findMany: vi.fn().mockResolvedValue([]) },
      checkIn: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const transaction = vi.fn().mockImplementation((work: (db: typeof tx) => unknown) => work(tx));
    const service = new NominalAccessService(
      { $transaction: transaction } as unknown as PrismaService,
      new EventAccessPolicy(),
      {} as AuditService,
      {} as NominalAccessTokenService,
      {} as NominalAccessQrService
    );
    return { tx, event, transaction, service };
  }
  it('enforces operational roles even when invoked without a controller guard', async () => {
    const f = fixture();
    await expect(f.service.list('event', { ...principal, role: 'PLATFORM_ADMIN' })).rejects.toMatchObject({
      response: { code: 'ROLE_FORBIDDEN' }
    });
    expect(f.tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('fails closed for foreign ownership and incompatible profile', async () => {
    const f = fixture();
    f.tx.event.findFirst.mockResolvedValueOnce(null);
    await expect(f.service.list('event', principal)).rejects.toMatchObject({ response: { code: 'EVENT_NOT_FOUND' } });
    f.event.client.operatingProfile = 'SELF_SERVICE';
    await expect(f.service.list('event', principal)).rejects.toMatchObject({
      response: { code: 'NOMINAL_ACCESS_EVENT_NOT_ELIGIBLE' }
    });
  });
  it('retries serialization failures but does not retry permanent database failures', async () => {
    const f = fixture();
    f.transaction.mockRejectedValueOnce({ code: 'P2034' });
    await expect(f.service.list('event', principal)).resolves.toEqual([]);
    expect(f.transaction).toHaveBeenCalledTimes(2);
    f.transaction.mockClear().mockRejectedValueOnce(new Error('connection unavailable'));
    await expect(f.service.list('event', principal)).rejects.toThrow('connection unavailable');
    expect(f.transaction).toHaveBeenCalledTimes(1);
  });
});
