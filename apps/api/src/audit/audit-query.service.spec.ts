import { describe, expect, it, vi } from 'vitest';
import { AuditActorType } from '../generated/prisma/client';
import { encodeAuditCursor } from './audit-query.dto';
import { AuditService } from './audit.service';

const firstId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const secondId = '11111111-1111-4111-8111-111111111111';
const occurredAt = new Date('2026-08-04T18:00:00.000Z');

describe('AuditService.list', () => {
  it('uses deterministic keyset order, exact filters and a limit-plus-one page', async () => {
    const findMany = vi.fn().mockResolvedValue([row(firstId), row(secondId)]);
    const service = new AuditService({ auditLog: { findMany } } as never);

    const page = await service.list({
      clientId: secondId,
      actorType: AuditActorType.USER,
      resourceType: 'Client',
      action: 'UPDATED',
      createdFrom: '2026-08-01T00:00:00.000Z',
      createdTo: '2026-08-05T00:00:00.000Z',
      limit: 1
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: secondId, actorType: AuditActorType.USER, action: 'UPDATED' }),
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 2
      })
    );
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe(encodeAuditCursor(occurredAt, firstId));
  });

  it('applies both cursor columns and sanitizes persisted JSON without enriching rows', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([row(secondId, { metadata: { authorization: 'Bearer raw', nested: [{ phone: '555' }] } })]);
    const service = new AuditService({ auditLog: { findMany } } as never);

    const page = await service.list({ cursor: encodeAuditCursor(occurredAt, firstId), limit: 10 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ occurredAt: { lt: occurredAt } }, { occurredAt, id: { lt: firstId } }]
        }
      })
    );
    expect(page.items[0]?.metadata).toEqual({ authorization: '[REDACTED]', nested: [{ phone: '[REDACTED]' }] });
    expect(page.nextCursor).toBeNull();
  });
});

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    occurredAt,
    actorType: AuditActorType.USER,
    actorId: secondId,
    actorFingerprint: null,
    resourceType: 'Client',
    resourceId: secondId,
    clientId: secondId,
    eventId: null,
    action: 'UPDATED',
    operationId: firstId,
    beforeData: null,
    afterData: { safe: true },
    metadata: null,
    ...overrides
  };
}
