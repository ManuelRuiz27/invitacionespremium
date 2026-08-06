import { assertStagingOperation, requiredEnvironment, runCommand, safeFailure, safeHttpsUrl } from './staging-safety';

const sites = [
  {
    packageName: '@invitaciones/landing',
    directory: 'apps/landing/dist',
    siteVariable: 'NETLIFY_LANDING_SITE_ID',
    urlVariable: 'STAGING_LANDING_URL'
  },
  {
    packageName: '@invitaciones/client',
    directory: 'apps/client/dist',
    siteVariable: 'NETLIFY_CLIENT_SITE_ID',
    urlVariable: 'STAGING_CLIENT_URL'
  },
  {
    packageName: '@invitaciones/admin',
    directory: 'apps/admin/dist',
    siteVariable: 'NETLIFY_ADMIN_SITE_ID',
    urlVariable: 'STAGING_ADMIN_URL'
  },
  {
    packageName: '@invitaciones/scanner',
    directory: 'apps/scanner/dist',
    siteVariable: 'NETLIFY_SCANNER_SITE_ID',
    urlVariable: 'STAGING_SCANNER_URL'
  }
] as const;

async function deployStaging(): Promise<void> {
  assertStagingOperation(process.argv.slice(2), process.env, { confirmationFlag: '--confirm-staging' });
  const railwayService = requiredEnvironment(process.env, 'RAILWAY_API_SERVICE_ID');
  requiredEnvironment(process.env, 'RAILWAY_TOKEN');
  const netlifyToken = requiredEnvironment(process.env, 'NETLIFY_AUTH_TOKEN');
  for (const name of ['STAGING_API_BASE_URL', 'STAGING_SOCKET_URL', ...sites.map(({ urlVariable }) => urlVariable)]) {
    safeHttpsUrl(process.env, name, name === 'STAGING_API_BASE_URL' ? '/api/v1' : '/');
  }

  await runCommand('pnpm', [
    'dlx',
    '@railway/cli@5.30.4',
    'up',
    '--service',
    railwayService,
    '--environment',
    'staging',
    '--detach'
  ]);
  for (const site of sites) {
    await runCommand('pnpm', ['--filter', site.packageName, 'build']);
    await runCommand(
      'pnpm',
      [
        'dlx',
        'netlify-cli@27.1.0',
        'deploy',
        '--prod',
        '--dir',
        site.directory,
        '--message',
        `staging ${process.env.GITHUB_SHA ?? 'manual'}`
      ],
      {
        env: {
          ...process.env,
          NETLIFY_AUTH_TOKEN: netlifyToken,
          NETLIFY_SITE_ID: requiredEnvironment(process.env, site.siteVariable)
        }
      }
    );
  }
  await waitForHealth(safeHttpsUrl(process.env, 'STAGING_API_BASE_URL', '/api/v1'));
  await runCommand('pnpm', ['exec', 'tsx', 'scripts/smoke-staging.ts', '--confirm-staging']);
  process.stdout.write(
    `${JSON.stringify({ event: 'staging_deployment_verified', commit: process.env.GITHUB_SHA ?? null })}\n`
  );
}

async function waitForHealth(apiBase: URL): Promise<void> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL(`${apiBase.href}/health`));
      if (response.ok) return;
    } catch {
      // Railway may still be switching the service to the new healthy deployment.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error('Staging API did not become healthy within five minutes.');
}

void deployStaging().catch((error: unknown) => {
  process.stderr.write(`${safeFailure('staging_deployment_failed', error)}\n`);
  process.exitCode = 1;
});
