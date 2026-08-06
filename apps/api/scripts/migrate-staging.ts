import { assertStagingOperation, runCommand, safeFailure } from './staging-safety';

async function migrateStaging(): Promise<void> {
  assertStagingOperation(process.argv.slice(2), process.env, {
    confirmationFlag: '--confirm-staging',
    requireDatabase: true
  });
  await runCommand('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
  process.stdout.write(`${JSON.stringify({ event: 'staging_migrations_applied' })}\n`);
}

void migrateStaging().catch((error: unknown) => {
  process.stderr.write(`${safeFailure('staging_migrations_failed', error)}\n`);
  process.exitCode = 1;
});
