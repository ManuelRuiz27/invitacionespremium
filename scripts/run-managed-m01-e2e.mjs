import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredPorts = [3000, 5173, 5174, 5175];
const crossTenantClientId = '15000000-0000-4000-8000-000000000101';
const crossTenantEventId = '15000000-0000-4000-8000-000000000102';
const managedClientId = '15000000-0000-4000-8000-000000000001';
const managedEventId = '15000000-0000-4000-8000-000000000005';
const managedAdminId = '15000000-0000-4000-8000-000000000002';
const children = [];
let stoppingOwnedServices = false;
let databaseName;
let databaseUrl;
let maintenanceUrl;
let storageRoot;

loadEnvironment();

const requireFromApi = createRequire(join(root, 'apps/api/package.json'));
const { Client } = requireFromApi('pg');

try {
  await assertPortsAvailable(requiredPorts);

  const baseDatabaseUrl = process.env.DATABASE_URL;
  if (!baseDatabaseUrl) throw new Error('DATABASE_URL is required to create the isolated MG-05 database.');
  ({ databaseName, databaseUrl, maintenanceUrl } = isolatedDatabaseUrls(baseDatabaseUrl));
  storageRoot = join(root, 'var', 'managed-m01-e2e', databaseName);
  await mkdir(storageRoot, { recursive: true });

  await createDatabase(maintenanceUrl, databaseName);
  const runtimeEnvironment = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: '3000',
    API_PORT: '3000',
    DATABASE_URL: databaseUrl,
    FILE_STORAGE_LOCAL_ROOT: storageRoot,
    CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174,http://localhost:5175',
    PUBLIC_INVITATION_BASE_URL: 'http://localhost:5173/invitacion',
    VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
    VITE_SOCKET_URL: 'http://localhost:3000',
    VITE_ADMIN_APP_URL: 'http://localhost:5174',
    VITE_CLIENT_APP_URL: 'http://localhost:5173',
    VITE_SCANNER_APP_URL: 'http://localhost:5175',
    MANAGED_E2E_CROSS_TENANT_EVENT_ID: crossTenantEventId
  };

  await runPnpm(['--filter', '@invitaciones/api', 'db:migrate:deploy'], runtimeEnvironment);
  process.stdout.write('[managed-e2e] Seeding with: pnpm --filter @invitaciones/api managed-demo:seed\n');
  await runPnpm(['--filter', '@invitaciones/api', 'managed-demo:seed'], runtimeEnvironment);
  await seedCrossTenantNegative(databaseUrl);

  startService('api', ['--filter', '@invitaciones/api', 'exec', 'tsx', 'src/main.ts'], runtimeEnvironment);
  await waitForUrl('http://localhost:3000/api/v1/health', 'API');

  startService(
    'client',
    ['--filter', '@invitaciones/client', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    runtimeEnvironment
  );
  startService(
    'admin',
    ['--filter', '@invitaciones/admin', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
    runtimeEnvironment
  );
  startService(
    'scanner',
    ['--filter', '@invitaciones/scanner', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5175', '--strictPort'],
    runtimeEnvironment
  );
  await Promise.all([
    waitForUrl('http://localhost:5173/login', 'Client'),
    waitForUrl('http://localhost:5174/login', 'Admin'),
    waitForUrl('http://localhost:5175/', 'Scanner')
  ]);

  const playwrightExitCode = await runPnpm(
    ['exec', 'playwright', 'test', '--config', 'playwright.config.ts'],
    runtimeEnvironment,
    { rejectOnFailure: false }
  );
  if (playwrightExitCode !== 0) process.exitCode = playwrightExitCode;
  else await assertNoFinancialArtifacts(databaseUrl);
} catch (error) {
  process.stderr.write(`[managed-e2e] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  await stopOwnedServices();
  if (databaseName && maintenanceUrl) await dropDatabase(maintenanceUrl, databaseName).catch(reportCleanupError);
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true }).catch(reportCleanupError);
}

function loadEnvironment() {
  for (const path of [join(root, '.env'), join(root, 'apps/api/.env')]) {
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

function isolatedDatabaseUrls(value) {
  const base = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(base.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL for MG-05.');
  }
  const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`;
  const name = `invitacionespremium_mg05_${suffix}`;
  const isolated = new URL(base);
  isolated.pathname = `/${name}`;
  const maintenance = new URL(base);
  maintenance.pathname = '/postgres';
  return { databaseName: name, databaseUrl: isolated.toString(), maintenanceUrl: maintenance.toString() };
}

async function assertPortsAvailable(ports) {
  const occupied = [];
  for (const port of ports) {
    if (await isPortOccupied(port)) occupied.push(port);
  }
  if (occupied.length) {
    throw new Error(
      `Required ports are occupied: ${occupied.join(', ')}. Stop the owning processes and retry; the harness did not seed, modify the database, or terminate any process.`
    );
  }
}

async function isPortOccupied(port) {
  const states = await Promise.all(['127.0.0.1', '::1'].map((host) => canConnect(host, port)));
  return states.some(Boolean);
}

function canConnect(host, port) {
  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host, port });
    const finish = (open) => {
      socket.destroy();
      resolvePromise(open);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function createDatabase(url, name) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(url, name) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

async function seedCrossTenantNegative(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO client (id, type, operating_profile, name, status, created_at, updated_at)
       VALUES ($1, 'PLANNER', 'MANAGED', '[E2E] Cliente aislado', 'ACTIVE', now(), now())`,
      [crossTenantClientId]
    );
    await client.query(
      `INSERT INTO event (
         id, client_id, created_by_user_id, name, status, confirmation_enabled, floorplan_enabled, created_at, updated_at
       )
       VALUES ($1, $2, $3, '[E2E] Evento no asignado', 'draft', false, false, now(), now())`,
      [crossTenantEventId, crossTenantClientId, managedAdminId]
    );
  } finally {
    await client.end();
  }
}

async function assertNoFinancialArtifacts(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT
         (SELECT count(*)::int FROM ledger_entry WHERE event_id = $1) AS ledger_entries,
         (SELECT count(*)::int FROM receipt WHERE client_id = $2::uuid OR operation_reference = $1::text) AS receipts,
         (SELECT count(*)::int FROM payment WHERE client_id = $2) AS payments,
         (SELECT count(*)::int FROM finance_balance WHERE client_id = $2) AS balances,
         (SELECT count(*)::int FROM credit_line WHERE client_id = $2) AS credit_lines`,
      [managedEventId, managedClientId]
    );
    const counts = result.rows[0];
    const unexpected = Object.entries(counts).filter(([, count]) => count !== 0);
    if (unexpected.length) {
      throw new Error(`Financial isolation failed: ${unexpected.map(([key, count]) => `${key}=${count}`).join(', ')}`);
    }
    process.stdout.write(
      '[managed-e2e] Financial isolation verified: no Credit, Payment, Receipt or Ledger artifacts; Pricing routes were not requested.\n'
    );
  } finally {
    await client.end();
  }
}

function startService(name, args, environment) {
  const child = spawnPnpm(args, environment, ['ignore', 'pipe', 'pipe']);
  children.push({ name, child });
  pipeWithPrefix(child.stdout, name, process.stdout);
  pipeWithPrefix(child.stderr, name, process.stderr);
  child.once('exit', (code, signal) => {
    if (!stoppingOwnedServices && code && process.exitCode !== 1) {
      process.stderr.write(`[managed-e2e] ${name} exited unexpectedly (${code ?? signal}).\n`);
      process.exitCode = 1;
    }
  });
}

function pipeWithPrefix(stream, name, destination) {
  let remainder = '';
  stream?.on('data', (chunk) => {
    const lines = `${remainder}${chunk}`.split(/\r?\n/u);
    remainder = lines.pop() ?? '';
    for (const line of lines) destination.write(`[${name}] ${line}\n`);
  });
  stream?.on('end', () => {
    if (remainder) destination.write(`[${name}] ${remainder}\n`);
  });
}

async function waitForUrl(url, label) {
  const deadline = Date.now() + 60_000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    const exited = children.find(({ child }) => child.exitCode !== null);
    if (exited) throw new Error(`${exited.name} exited before ${label} became ready.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`${label} did not become ready at ${url}: ${lastError}`);
}

async function runPnpm(args, environment, { rejectOnFailure = true } = {}) {
  const child = spawnPnpm(args, environment, 'inherit');
  const code = await new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('exit', (exitCode, signal) => resolvePromise(exitCode ?? (signal ? 1 : 0)));
  });
  if (rejectOnFailure && code !== 0) throw new Error(`pnpm ${args.join(' ')} failed with exit code ${code}.`);
  return code;
}

function spawnPnpm(args, environment, stdio) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('Run this harness through pnpm so npm_execpath is available.');
  return spawn(process.execPath, [pnpmCli, ...args], {
    cwd: root,
    env: environment,
    stdio,
    windowsHide: true
  });
}

async function stopOwnedServices() {
  stoppingOwnedServices = true;
  await Promise.all(children.map(({ child }) => stopOwnedProcess(child)));
}

async function stopOwnedProcess(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolvePromise) => {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      killer.once('error', () => resolvePromise());
      killer.once('exit', () => resolvePromise());
    });
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolvePromise) => child.once('exit', resolvePromise)), delay(5_000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function reportCleanupError(error) {
  process.stderr.write(`[managed-e2e] Cleanup warning: ${error instanceof Error ? error.message : String(error)}\n`);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
