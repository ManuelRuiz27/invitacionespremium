import { access, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertStagingOperation,
  isPathInside,
  requiredEnvironment,
  runCapturedCommand,
  runCommand,
  safeFailure,
  safeHttpsUrl
} from './staging-safety';

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

export interface StagingCommandExecutor {
  run(command: string, args: readonly string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<void>;
  capture(
    command: string,
    args: readonly string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
  ): Promise<string>;
}

const defaultExecutor: StagingCommandExecutor = { run: runCommand, capture: runCapturedCommand };

export interface RailwayTarget {
  projectId: string;
  environment: string;
  serviceId: string;
}

export function resolveMonorepoRoot(scriptDirectory = __dirname): string {
  return resolve(scriptDirectory, '../../..');
}

export function railwayTarget(environment: NodeJS.ProcessEnv): RailwayTarget {
  return {
    projectId: requiredEnvironment(environment, 'RAILWAY_PROJECT_ID'),
    environment: 'staging',
    serviceId: requiredEnvironment(environment, 'RAILWAY_API_SERVICE_ID')
  };
}

export function railwayUpArgs(target: RailwayTarget, message: string): string[] {
  return [
    'dlx',
    '@railway/cli@5.30.4',
    'up',
    '--project',
    target.projectId,
    '--environment',
    target.environment,
    '--service',
    target.serviceId,
    '--message',
    message,
    '--json'
  ];
}

interface RailwayDeploymentResult {
  deploymentId: string;
  status: string;
  serviceId?: string | undefined;
  environmentName?: string | undefined;
  message?: string | undefined;
}

export function parseRailwayDeployment(
  output: string,
  target: RailwayTarget,
  expectedMessage: string
): RailwayDeploymentResult {
  const records = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    });
  const candidates = records.flatMap(findDeploymentRecords);
  const deployment = candidates.find((candidate) => candidate.status === 'SUCCESS') ?? candidates.at(-1);
  if (!deployment?.deploymentId) throw new Error('Railway did not identify the created deployment.');
  if (deployment.status !== 'SUCCESS') {
    if (['FAILED', 'CRASHED'].includes(deployment.status)) {
      throw new Error(`Railway deployment reached terminal status ${deployment.status}.`);
    }
    throw new Error('Railway deployment returned an unknown or non-terminal status.');
  }
  if (deployment.serviceId && deployment.serviceId !== target.serviceId) {
    throw new Error('Railway deployment service does not match the requested service.');
  }
  if (deployment.environmentName && deployment.environmentName !== target.environment) {
    throw new Error('Railway deployment environment does not match the requested environment.');
  }
  if (deployment.message && deployment.message !== expectedMessage) {
    throw new Error('Railway deployment message does not match the requested commit.');
  }
  return deployment;
}

function findDeploymentRecords(value: unknown): RailwayDeploymentResult[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(findDeploymentRecords);
  const record = value as Record<string, unknown>;
  const deploymentId = stringValue(record.deploymentId) ?? stringValue(record.id);
  const status = stringValue(record.status)?.toUpperCase();
  const nested = Object.values(record).flatMap(findDeploymentRecords);
  if (!deploymentId || !status) return nested;
  const metadata = objectValue(record.meta) ?? objectValue(record.metadata);
  return [
    ...nested,
    {
      deploymentId,
      status,
      ...((stringValue(record.serviceId) ?? stringValue(metadata?.serviceId))
        ? { serviceId: stringValue(record.serviceId) ?? stringValue(metadata?.serviceId) }
        : {}),
      ...((stringValue(record.environment) ?? stringValue(metadata?.environmentName))
        ? { environmentName: stringValue(record.environment) ?? stringValue(metadata?.environmentName) }
        : {}),
      ...((stringValue(record.message) ?? stringValue(metadata?.message))
        ? { message: stringValue(record.message) ?? stringValue(metadata?.message) }
        : {})
    }
  ];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export async function deployStaging(
  args = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
  executor: StagingCommandExecutor = defaultExecutor,
  scriptDirectory = __dirname,
  healthCheck: (apiBase: URL) => Promise<void> = waitForHealth
): Promise<void> {
  assertStagingOperation(args, environment, { confirmationFlag: '--confirm-staging' });
  const apiOnly = args.includes('--api-only');
  const target = railwayTarget(environment);
  requiredEnvironment(environment, 'RAILWAY_TOKEN');
  safeHttpsUrl(environment, 'STAGING_API_BASE_URL', '/api/v1');
  const root = resolveMonorepoRoot(scriptDirectory);
  const commit = environment.GITHUB_SHA ?? 'manual';
  const message = `staging:${commit}`;
  const railwayOutput = await executor.capture('pnpm', railwayUpArgs(target, message), {
    cwd: root,
    env: environment,
    timeoutMs: 900_000
  });
  const deployment = parseRailwayDeployment(railwayOutput, target, message);
  await healthCheck(safeHttpsUrl(environment, 'STAGING_API_BASE_URL', '/api/v1'));
  if (apiOnly) {
    process.stdout.write(
      `${JSON.stringify({ event: 'staging_api_bootstrap_verified', commit, railwayDeploymentId: deployment.deploymentId })}\n`
    );
    return;
  }
  const netlifyToken = requiredEnvironment(environment, 'NETLIFY_AUTH_TOKEN');
  for (const name of ['STAGING_SOCKET_URL', ...sites.map(({ urlVariable }) => urlVariable)]) {
    safeHttpsUrl(environment, name, '/');
  }
  for (const site of sites) {
    const directory = resolve(root, site.directory);
    if (!isPathInside(root, directory)) throw new Error('Netlify publish directory escapes the monorepo.');
    await rm(directory, { recursive: true, force: true });
    await executor.run('pnpm', ['--filter', site.packageName, 'build'], { cwd: root, env: environment });
    await validateNetlifyDist(root, directory);
    await executor.run(
      'pnpm',
      ['dlx', 'netlify-cli@27.1.0', 'deploy', '--prod', '--dir', directory, '--message', message],
      {
        cwd: root,
        env: {
          ...environment,
          NETLIFY_AUTH_TOKEN: netlifyToken,
          NETLIFY_SITE_ID: requiredEnvironment(environment, site.siteVariable)
        }
      }
    );
  }
  await executor.run('pnpm', ['--filter', '@invitaciones/api', 'staging:smoke', '--', '--confirm-staging'], {
    cwd: root,
    env: environment
  });
  process.stdout.write(
    `${JSON.stringify({ event: 'staging_deployment_verified', commit, railwayDeploymentId: deployment.deploymentId })}\n`
  );
}

export async function validateNetlifyDist(root: string, directory: string): Promise<void> {
  if (!isPathInside(root, directory)) throw new Error('Netlify publish directory escapes the monorepo.');
  for (const file of ['index.html', '_headers', '_redirects']) {
    await access(resolve(directory, file)).catch(() => {
      throw new Error(`Netlify publish directory is missing ${file}.`);
    });
  }
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

if (require.main === module) {
  void deployStaging().catch((error: unknown) => {
    process.stderr.write(`${safeFailure('staging_deployment_failed', error)}\n`);
    process.exitCode = 1;
  });
}
