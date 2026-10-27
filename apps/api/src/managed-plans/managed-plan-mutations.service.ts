import { createHash } from 'node:crypto';
import { ForbiddenException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuditRecordInput } from '../audit/audit.types';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { AuditActorType, Prisma, UserRole } from '../generated/prisma/client';

export type ManagedPlanMutationAudit = Omit<AuditRecordInput, 'actor' | 'operationId'>;

export async function requireManagedPlanProvider(
  database: Prisma.TransactionClient | PrismaService,
  principal: AuthPrincipal
) {
  if (principal.role !== UserRole.PLATFORM_ADMIN || principal.clientId !== null) throw providerForbidden();
  const actor = await database.user.findFirst({
    where: { id: principal.userId, role: UserRole.PLATFORM_ADMIN, clientId: null, deletedAt: null },
    select: { id: true }
  });
  if (!actor) throw providerForbidden();
}

@Injectable()
export class ManagedPlanMutationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async run<T>(
    kind: string,
    key: string,
    principal: AuthPrincipal,
    signatureData: unknown,
    mutate: (tx: Prisma.TransactionClient) => Promise<{ result: T; audit: ManagedPlanMutationAudit }>,
    operationId?: string
  ): Promise<T> {
    const signature = createHash('sha256')
      .update(JSON.stringify({ kind, actor: principal.userId, data: signatureData }))
      .digest('hex');
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await requireManagedPlanProvider(tx, principal);
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`managed-plan:${key}`}, 0))`;
          const existing = await tx.managedPlanOperation.findUnique({ where: { idempotencyKey: key } });
          if (existing) {
            if (
              existing.kind !== kind ||
              existing.actorUserId !== principal.userId ||
              existing.requestSignature !== signature
            )
              throw new DomainError(
                'MANAGED_PLAN_IDEMPOTENCY_CONFLICT',
                'Idempotency key belongs to another operation.',
                HttpStatus.CONFLICT
              );
            return existing.resultSnapshot as T;
          }
          const changed = await mutate(tx);
          await this.audit.record(
            {
              ...changed.audit,
              actor: { type: AuditActorType.USER, id: principal.userId },
              ...(operationId ? { operationId } : {})
            },
            tx
          );
          await tx.managedPlanOperation.create({
            data: {
              idempotencyKey: key,
              kind,
              actorUserId: principal.userId,
              requestSignature: signature,
              resultSnapshot: changed.result as unknown as Prisma.InputJsonValue
            }
          });
          return changed.result;
        }, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        // A contender can take its Serializable snapshot before waiting for the
        // key lock. Exclusion constraints then see a committed contract that its
        // snapshot cannot read. Retry in a fresh transaction to discover replay
        // or return the actual overlap; never turn that race into a second write.
        const contractExclusion = String(error).includes('managed_plan_contract_no_overlap');
        if (
          contractExclusion ||
          (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code))
        ) {
          if (attempt < 3) continue;
          throw new DomainError('MANAGED_PLAN_CONCURRENT_UPDATE', 'Retry the same operation.', HttpStatus.CONFLICT);
        }
        throw error;
      }
    }
    throw new DomainError('MANAGED_PLAN_CONCURRENT_UPDATE', 'Retry the same operation.', HttpStatus.CONFLICT);
  }
}

function providerForbidden() {
  return new ForbiddenException({ code: 'ROLE_FORBIDDEN', message: 'A live Platform Admin identity is required.' });
}
