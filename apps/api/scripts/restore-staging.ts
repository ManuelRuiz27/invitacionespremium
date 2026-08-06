import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { assertStagingOperation, requiredEnvironment, runCommand, safeFailure } from './staging-safety';

async function restoreStaging(): Promise<void> {
  assertStagingOperation(process.argv.slice(2), process.env, {
    confirmationFlag: '--confirm-staging-restore'
  });
  const sourceDatabaseUrl = requiredEnvironment(process.env, 'STAGING_DATABASE_URL');
  const restoreDatabaseUrl = requiredEnvironment(process.env, 'STAGING_RESTORE_DATABASE_URL');
  if (restoreDatabaseUrl === sourceDatabaseUrl || restoreDatabaseUrl === process.env.PRODUCTION_DATABASE_URL) {
    throw new Error('Restore target must be a separate temporary database.');
  }
  const backupPath = resolve(requiredEnvironment(process.env, 'STAGING_BACKUP_FILE'));
  await access(backupPath);
  const database = databaseArguments(restoreDatabaseUrl);
  await runCommand(
    'pg_restore',
    [...database.args, '--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', backupPath],
    { env: { ...process.env, PGPASSWORD: database.password } }
  );

  const pool = new pg.Pool({ connectionString: restoreDatabaseUrl, max: 1 });
  try {
    const result = await pool.query<{ table_count: string; migration_count: string }>(`
      SELECT
        (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'public') AS table_count,
        (SELECT count(*)::text FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) AS migration_count
    `);
    const tableCount = Number(result.rows[0]?.table_count ?? 0);
    const migrationCount = Number(result.rows[0]?.migration_count ?? 0);
    if (tableCount < 1 || migrationCount < 1) throw new Error('Restored database verification failed.');
    process.stdout.write(`${JSON.stringify({ event: 'staging_restore_verified', tableCount, migrationCount })}\n`);
  } finally {
    await pool.end();
  }
}

function databaseArguments(rawUrl: string): { args: string[]; password: string } {
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Restore URL must be PostgreSQL.');
  const databaseName = url.pathname.replace(/^\//u, '');
  if (!databaseName) throw new Error('Restore URL must include a database name.');
  return {
    args: [
      '--host',
      url.hostname,
      '--port',
      url.port || '5432',
      '--username',
      decodeURIComponent(url.username),
      '--dbname',
      databaseName
    ],
    password: decodeURIComponent(url.password)
  };
}

void restoreStaging().catch((error: unknown) => {
  process.stderr.write(`${safeFailure('staging_restore_failed', error)}\n`);
  process.exitCode = 1;
});
