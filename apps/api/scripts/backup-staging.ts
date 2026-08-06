import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { assertStagingOperation, isPathInside, requiredEnvironment, runCommand, safeFailure } from './staging-safety';

async function backupStaging(): Promise<void> {
  const args = process.argv.slice(2);
  assertStagingOperation(args, process.env, {
    confirmationFlag: '--confirm-staging',
    requireDatabase: true
  });
  const backupDirectory = resolve(requiredEnvironment(process.env, 'STAGING_BACKUP_DIR'));
  const repositoryRoot = resolve(process.cwd(), '..', '..');
  if (backupDirectory === repositoryRoot || isPathInside(repositoryRoot, backupDirectory)) {
    throw new Error('STAGING_BACKUP_DIR must be outside the repository.');
  }
  await mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const outputPath = resolve(backupDirectory, `invitacionespremium-staging-${timestamp}.dump`);
  const database = databaseArguments(requiredEnvironment(process.env, 'DATABASE_URL'));
  await runCommand('pg_dump', [...database.args, '--format=custom', '--no-owner', '--no-acl', '--file', outputPath], {
    env: { ...process.env, PGPASSWORD: database.password }
  });

  let pruned = 0;
  if (args.includes('--prune')) {
    const retentionDays = Number(process.env.STAGING_BACKUP_RETENTION_DAYS ?? '7');
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      throw new Error('STAGING_BACKUP_RETENTION_DAYS must be a positive integer.');
    }
    const cutoff = Date.now() - retentionDays * 86_400_000;
    for (const entry of await readdir(backupDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^invitacionespremium-staging-.+\.dump$/u.test(entry.name)) continue;
      const target = resolve(backupDirectory, entry.name);
      if ((await stat(target)).mtimeMs < cutoff) {
        if (!isPathInside(backupDirectory, target)) throw new Error('Refusing to prune outside backup directory.');
        await rm(target);
        pruned += 1;
      }
    }
  }

  process.stdout.write(`${JSON.stringify({ event: 'staging_backup_created', file: basename(outputPath), pruned })}\n`);
}

function databaseArguments(rawUrl: string): { args: string[]; password: string } {
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be PostgreSQL.');
  const databaseName = url.pathname.replace(/^\//u, '');
  if (!databaseName) throw new Error('DATABASE_URL must include a database name.');
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

void backupStaging().catch((error: unknown) => {
  process.stderr.write(`${safeFailure('staging_backup_failed', error)}\n`);
  process.exitCode = 1;
});
