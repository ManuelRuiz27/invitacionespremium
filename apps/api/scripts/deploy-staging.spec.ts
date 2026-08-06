import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deployStaging,
  parseRailwayDeployment,
  railwayUpArgs,
  resolveMonorepoRoot,
  validateNetlifyDist,
  type RailwayTarget,
  type StagingCommandExecutor
} from './deploy-staging';
import { safeFailure } from './staging-safety';

const target: RailwayTarget = { projectId: 'project-1', environment: 'staging', serviceId: 'service-1' };
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('staging deployment planning', () => {
  it('targets Railway project, environment and service without detach', () => {
    const args = railwayUpArgs(target, 'staging:abc');
    expect(args).toContain('--project');
    expect(args).toContain('project-1');
    expect(args).toContain('--environment');
    expect(args).toContain('staging');
    expect(args).toContain('--service');
    expect(args).toContain('service-1');
    expect(args).toContain('--json');
    expect(args).not.toContain('--detach');
  });

  it('accepts only the expected successful Railway deployment', () => {
    expect(
      parseRailwayDeployment(
        `${JSON.stringify({ deploymentId: 'deployment-1', status: 'SUCCESS', serviceId: 'service-1', environment: 'staging', message: 'staging:abc' })}\n`,
        target,
        'staging:abc'
      )
    ).toMatchObject({ deploymentId: 'deployment-1', status: 'SUCCESS' });
  });

  it.each(['FAILED', 'CRASHED', 'DEPLOYING'])('rejects Railway status %s', (status) => {
    expect(() =>
      parseRailwayDeployment(JSON.stringify({ deploymentId: 'deployment-1', status }), target, 'staging:abc')
    ).toThrow();
  });

  it('derives the monorepo root independently from cwd', () => {
    const scriptDirectory = resolve('repo/apps/api/scripts');
    const expected = resolve('repo');
    const original = process.cwd();
    const workingDirectories = [resolve('/'), original, tmpdir()];
    try {
      for (const cwd of workingDirectories) {
        process.chdir(cwd);
        expect(resolveMonorepoRoot(scriptDirectory)).toBe(expected);
      }
    } finally {
      process.chdir(original);
    }
  });

  it('requires a complete current dist inside the monorepo', async () => {
    const root = await mkdtemp(join(tmpdir(), 'staging-dist-'));
    temporaryDirectories.push(root);
    const dist = join(root, 'apps/client/dist');
    await expect(validateNetlifyDist(root, dist)).rejects.toThrow('index.html');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.html'), 'ok');
    await expect(validateNetlifyDist(root, dist)).rejects.toThrow('_headers');
    await writeFile(join(dist, '_headers'), 'ok');
    await writeFile(join(dist, '_redirects'), 'ok');
    await expect(validateNetlifyDist(root, dist)).resolves.toBeUndefined();
    await expect(validateNetlifyDist(root, resolve(root, '..', 'outside'))).rejects.toThrow('escapes');
  });

  it('does not check health when Railway fails or times out', async () => {
    const environment = deploymentEnvironment();
    const executor: StagingCommandExecutor = {
      run: vi.fn(),
      capture: vi.fn().mockRejectedValue(new Error('timeout'))
    };
    const health = vi.fn();
    await expect(
      deployStaging(['--confirm-staging'], environment, executor, resolve('repo/apps/api/scripts'), health)
    ).rejects.toThrow('timeout');
    expect(health).not.toHaveBeenCalled();

    executor.capture = vi.fn().mockResolvedValue(JSON.stringify({ deploymentId: 'new', status: 'FAILED' }));
    await expect(
      deployStaging(['--confirm-staging'], environment, executor, resolve('repo/apps/api/scripts'), health)
    ).rejects.toThrow('FAILED');
    expect(health).not.toHaveBeenCalled();
  });

  it('sanitizes command failures without serializing tokens or provider output', () => {
    const serialized = safeFailure('deployment_failed', new Error('token=super-secret provider response'));
    expect(serialized).toContain('deployment_failed');
    expect(serialized).not.toMatch(/super-secret|provider response/iu);
  });
});

function deploymentEnvironment(): NodeJS.ProcessEnv {
  return {
    STAGING_ENVIRONMENT: 'staging',
    RAILWAY_PROJECT_ID: 'project-1',
    RAILWAY_API_SERVICE_ID: 'service-1',
    RAILWAY_TOKEN: 'railway-token',
    NETLIFY_AUTH_TOKEN: 'netlify-token',
    STAGING_API_BASE_URL: 'https://api.example.invalid/api/v1',
    STAGING_SOCKET_URL: 'https://api.example.invalid',
    STAGING_LANDING_URL: 'https://landing.example.invalid',
    STAGING_CLIENT_URL: 'https://client.example.invalid',
    STAGING_ADMIN_URL: 'https://admin.example.invalid',
    STAGING_SCANNER_URL: 'https://scanner.example.invalid'
  };
}
