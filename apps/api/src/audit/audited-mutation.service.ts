import { Inject, Injectable } from '@nestjs/common';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { PrismaService } from '../common/database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { AuditService } from './audit.service';
import type { AuditObject, AuditRecordInput, AuditedMutationResult } from './audit.types';

export interface ExecuteAuditedMutationInput<TResult> extends Omit<AuditRecordInput, 'afterData'> {
  mutate: (transaction: Prisma.TransactionClient) => Promise<AuditedMutationResult<TResult>>;
}

@Injectable()
export class AuditedMutationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async execute<TResult>(input: ExecuteAuditedMutationInput<TResult>): Promise<TResult> {
    const { mutate, ...auditInput } = input;

    return this.prisma.$transaction(async (transaction) => {
      const mutation = await mutate(transaction);
      const auditRecord: AuditRecordInput = {
        ...auditInput,
        ...(mutation.afterData === undefined ? {} : { afterData: mutation.afterData })
      };

      await this.audit.record(auditRecord, transaction);

      return mutation.result;
    }, CRITICAL_TRANSACTION_OPTIONS);
  }
}

export function auditedResult<TResult>(result: TResult, afterData?: AuditObject): AuditedMutationResult<TResult> {
  return {
    result,
    ...(afterData === undefined ? {} : { afterData })
  };
}
