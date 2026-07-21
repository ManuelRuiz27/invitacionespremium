import { Prisma } from '../../generated/prisma/client';

export const CRITICAL_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5000,
  timeout: 15_000
} as const;

export const DATABASE_INVARIANT_POLICY = {
  timestamps: 'UTC',
  identifiers: 'UUID',
  concurrency:
    'Use PostgreSQL constraints plus serializable transactions for critical invariants.'
} as const;
