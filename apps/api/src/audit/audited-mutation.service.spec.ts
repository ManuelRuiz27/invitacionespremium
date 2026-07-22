import { describe, expect, it, vi } from 'vitest';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { AuditActorType, type Prisma } from '../generated/prisma/client';
import { AuditService } from './audit.service';
import { AuditedMutationService, auditedResult } from './audited-mutation.service';

describe('AuditedMutationService', () => {
  it('runs the mutation and audit using the critical transaction policy', async () => {
    const transaction = {} as Prisma.TransactionClient;
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (client: Prisma.TransactionClient) => Promise<string>,
          _options: typeof CRITICAL_TRANSACTION_OPTIONS
        ) => callback(transaction)
      )
    };
    const audit = {
      record: vi.fn().mockResolvedValue('audit-id')
    };
    const service = new AuditedMutationService(
      prisma as never,
      audit as unknown as AuditService
    );

    const result = await service.execute({
      actor: { type: AuditActorType.SYSTEM },
      resourceType: 'TEST',
      action: 'TEST_MUTATION',
      mutate: async (client) => {
        expect(client).toBe(transaction);
        return auditedResult('result', { status: 'done' });
      }
    });

    expect(result).toBe('result');
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      CRITICAL_TRANSACTION_OPTIONS
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'TEST',
        action: 'TEST_MUTATION',
        afterData: { status: 'done' }
      }),
      transaction
    );
  });
});
