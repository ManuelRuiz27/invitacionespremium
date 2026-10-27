import { Prisma } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';

type Work<T> = (tx: Prisma.TransactionClient) => Promise<T>;
type Timing = { operation: string; elapsedMs: number };

function requireIsolatedDatabase() {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (!/^invitacionespremium_dt07_\d+_[a-f0-9]{8}$/u.test(name))
    throw new Error('Performance diagnostics require the harness-owned isolated database.');
}

type PlanNode = { 'Subplan Name'?: string; 'Actual Loops'?: number; Plans?: PlanNode[] };
type ExplainResult = Array<{ 'QUERY PLAN': Array<{ Plan: PlanNode }> }>;

function materialExecutions(node: PlanNode): number | undefined {
  if (node['Subplan Name'] === 'CTE material') return node['Actual Loops'];
  for (const child of node.Plans ?? []) {
    const loops = materialExecutions(child);
    if (loops !== undefined) return loops;
  }
  return undefined;
}

// Test-only observation. Never logs parameters, identities, cookies or tokens.
export function dashboardObserver(db: PrismaService) {
  const transactions: Array<{
    acquisitionMs: number;
    bodyMs: number;
    completionMs: number;
    operations: Timing[];
  }> = [];
  let projection: Prisma.Sql | undefined;
  function observe<T>(work: Work<T>, started: number) {
    const sample = { acquisitionMs: 0, bodyMs: 0, completionMs: 0, operations: [] as Timing[] };
    let bodyFinishedAt: number | undefined;
    return {
      work: async (tx: Prisma.TransactionClient) => {
        const entered = performance.now();
        sample.acquisitionMs = entered - started; // Pool checkout plus BEGIN, not SQL execution.
        transactions.push(sample);
        async function timed<R>(operation: string, run: () => Promise<R>): Promise<R> {
          const start = performance.now();
          try {
            return await run();
          } finally {
            sample.operations.push({ operation, elapsedMs: performance.now() - start });
          }
        }
        const observed = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === '$queryRaw')
              return (strings: TemplateStringsArray, ...values: unknown[]) => {
                const isProjection = strings[0]?.includes('WITH e AS');
                if (isProjection) projection = Prisma.sql(strings, ...values);
                return timed(isProjection ? 'projection' : 'privacy', () => target.$queryRaw(strings, ...values));
              };
            if (property === '$executeRaw')
              return (strings: TemplateStringsArray, ...values: unknown[]) =>
                timed('readOnly', () => target.$executeRaw(strings, ...values));
            if (property === 'event')
              return {
                findFirst: (...args: Parameters<typeof tx.event.findFirst>) =>
                  timed('eventAndOwnership', () => target.event.findFirst(...args))
              };
            return Reflect.get(target, property, receiver);
          }
        });
        try {
          return await work(observed);
        } finally {
          bodyFinishedAt = performance.now();
          sample.bodyMs = bodyFinishedAt - entered;
        }
      },
      completed: () => {
        if (bodyFinishedAt !== undefined) sample.completionMs = performance.now() - bodyFinishedAt;
      }
    };
  }
  async function explain() {
    requireIsolatedDatabase();
    if (!projection) throw new Error('No dashboard projection observed.');
    const query = projection;
    // After load, outside every HTTP sample. Never changes data or database statistics.
    return db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const plans = [];
        for (const materialization of ['inline-baseline', 'bounded'] as const) {
          // Reconstruct only the original SQL keyword for a same-snapshot diagnostic comparison.
          const candidate =
            materialization === 'bounded'
              ? query
              : Prisma.sql(
                  query.strings.map((part) => part.replace('material AS MATERIALIZED', 'material AS')),
                  ...query.values
                );
          const plan = await tx.$queryRaw<ExplainResult>(
            Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ${candidate}`
          );
          plans.push({
            materialization,
            plan,
            materialAggregationExecutions: materialExecutions(plan[0]!['QUERY PLAN'][0]!.Plan) ?? 0
          });
        }
        return plans;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 10000 }
    );
  }
  return { transactions, observe, explain };
}
