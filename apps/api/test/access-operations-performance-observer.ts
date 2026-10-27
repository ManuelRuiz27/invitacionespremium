import { Prisma } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/common/database/prisma.service';

type Work<T> = (tx: Prisma.TransactionClient) => Promise<T>;
type Timing = { operation: string; elapsedMs: number };

function requireIsolatedDatabase() {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (!/^invitacionespremium_dt07_\d+_[a-f0-9]{8}$/u.test(name))
    throw new Error('Performance diagnostics require the harness-owned isolated database.');
}

async function forceJit(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SET LOCAL jit_above_cost = 0`;
  await tx.$executeRaw`SET LOCAL jit_inline_above_cost = 0`;
  await tx.$executeRaw`SET LOCAL jit_optimize_above_cost = 0`;
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
        if (process.env.DT09_FORCE_DASHBOARD_JIT === '1') {
          requireIsolatedDatabase();
          await forceJit(tx);
        }
        if (process.env.DT09_AUTO_EXPLAIN === '1' && transactions.length <= 2) {
          requireIsolatedDatabase();
          await tx.$executeRawUnsafe("LOAD 'auto_explain'");
          await tx.$executeRawUnsafe('SET LOCAL auto_explain.log_min_duration = 0');
          await tx.$executeRawUnsafe('SET LOCAL auto_explain.log_analyze = on');
          await tx.$executeRawUnsafe('SET LOCAL auto_explain.log_buffers = on');
          await tx.$executeRawUnsafe('SET LOCAL auto_explain.log_format = json');
        }
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
                timed(strings[0]?.includes('jit') ? 'executionSettings' : 'readOnly', () =>
                  target.$executeRaw(strings, ...values)
                );
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
    const plans = [];
    // After load, outside every HTTP sample. Never changes data or database statistics.
    for (const disableJit of [false, true]) {
      plans.push(
        await db.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            if (disableJit) await tx.$executeRaw`SET LOCAL jit = off`;
            else if (process.env.DT09_FORCE_DASHBOARD_JIT === '1') await forceJit(tx);
            return {
              jit: disableJit ? 'disabled' : process.env.DT09_FORCE_DASHBOARD_JIT === '1' ? 'forced' : 'server-default',
              plan: await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON) ${query}`)
            };
          },
          { timeout: 10000 }
        )
      );
    }
    return plans;
  }
  return { transactions, observe, explain };
}
