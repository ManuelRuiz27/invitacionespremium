import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';

export interface StagingGuardOptions {
  confirmationFlag: string;
  requireDatabase?: boolean;
}

export function assertStagingOperation(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  options: StagingGuardOptions
): void {
  if (environment.STAGING_ENVIRONMENT !== 'staging') {
    throw new Error('STAGING_ENVIRONMENT must equal staging.');
  }
  if (!args.includes(options.confirmationFlag)) {
    throw new Error(`Explicit confirmation flag ${options.confirmationFlag} is required.`);
  }

  if (options.requireDatabase) {
    const databaseUrl = requiredEnvironment(environment, 'DATABASE_URL');
    const stagingDatabaseUrl = requiredEnvironment(environment, 'STAGING_DATABASE_URL');
    if (databaseUrl !== stagingDatabaseUrl) {
      throw new Error('DATABASE_URL must exactly match STAGING_DATABASE_URL.');
    }
    if (environment.PRODUCTION_DATABASE_URL && databaseUrl === environment.PRODUCTION_DATABASE_URL) {
      throw new Error('The staging operation refuses the configured production database.');
    }
  }
}

export function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function safeHttpsUrl(environment: NodeJS.ProcessEnv, name: string, expectedPath?: string): URL {
  const parsed = new URL(requiredEnvironment(environment, name));
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    ['localhost', '127.0.0.1', '::1'].includes(hostname)
  ) {
    throw new Error(`${name} must be a public HTTPS URL without credentials, query or fragment.`);
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/u, '') || '/';
  if (expectedPath && normalizedPath !== expectedPath) {
    throw new Error(`${name} must use path ${expectedPath}.`);
  }
  return parsed;
}

export function isPathInside(parent: string, candidate: string): boolean {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return pathFromParent !== '' && !pathFromParent.startsWith('..') && !isAbsolute(pathFromParent);
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: process.platform === 'win32',
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} failed with code ${String(code)} and signal ${String(signal)}.`));
    });
  });
}

export async function runCapturedCommand(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const output: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${command} timed out.`));
    }, options.timeoutMs ?? 900_000);
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.resume();
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) resolvePromise(Buffer.concat(output).toString('utf8'));
      else reject(new Error(`${command} failed with code ${String(code)} and signal ${String(signal)}.`));
    });
  });
}

export function safeFailure(event: string, error: unknown): string {
  return JSON.stringify({
    event,
    errorName: error instanceof Error ? error.name : 'UnknownError'
  });
}
