import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactQaText } from '../e2e/private-reporter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// One explicit offset keeps every origin consistent, without touching existing services.
const offsetArgument = process.argv.find((argument) => argument.startsWith('--port-offset='));
const offsetValue = offsetArgument?.slice('--port-offset='.length) ?? '0';
if (!/^(0|[1-9]\d*)$/u.test(offsetValue) || Number(offsetValue) > 60_360)
  throw new Error('Expected --port-offset=0..60360.');
const portOffset = Number(offsetValue);
const [apiPort, clientPort, adminPort, scannerPort] = [3000, 5173, 5174, 5175].map((port) => port + portOffset);
const requiredPorts = [apiPort, clientPort, adminPort, scannerPort];
const apiOrigin = `http://localhost:${apiPort}`;
const clientOrigin = `http://localhost:${clientPort}`;
const adminOrigin = `http://localhost:${adminPort}`;
const scannerOrigin = `http://localhost:${scannerPort}`;
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
let databaseCreated = false;

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
  databaseCreated = true;
  const runtimeEnvironment = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(apiPort),
    API_PORT: String(apiPort),
    LOG_LEVEL: 'error',
    DATABASE_URL: databaseUrl,
    FILE_STORAGE_LOCAL_ROOT: storageRoot,
    CORS_ORIGINS: [clientOrigin, adminOrigin, scannerOrigin].join(','),
    PUBLIC_INVITATION_BASE_URL: `${clientOrigin}/invitacion`,
    VITE_API_BASE_URL: `${apiOrigin}/api/v1`,
    VITE_SOCKET_URL: apiOrigin,
    VITE_ADMIN_APP_URL: adminOrigin,
    VITE_CLIENT_APP_URL: clientOrigin,
    VITE_SCANNER_APP_URL: scannerOrigin,
    MANAGED_E2E_API_URL: `${apiOrigin}/api/v1`,
    MANAGED_E2E_CLIENT_URL: clientOrigin,
    MANAGED_E2E_ADMIN_URL: adminOrigin,
    MANAGED_E2E_SCANNER_URL: scannerOrigin,
    MANAGED_DEMO_ARTIFACT_PATH: join(storageRoot, 'credentials.json'),
    INVITATION_TOKEN_SIGNING_SECRET: randomBytes(48).toString('base64url'),
    MANAGED_E2E_CROSS_TENANT_EVENT_ID: crossTenantEventId
  };

  await runPnpm(['--filter', '@invitaciones/api', 'db:migrate:deploy'], runtimeEnvironment);
  process.stdout.write('[managed-e2e] Seeding with: pnpm --filter @invitaciones/api managed-demo:seed\n');
  await runPnpm(['--filter', '@invitaciones/api', 'managed-demo:seed'], runtimeEnvironment);
  await seedCrossTenantNegative(databaseUrl);
  await seedLegacyCatalog(databaseUrl);

  startService('api', ['--filter', '@invitaciones/api', 'exec', 'tsx', 'src/main.ts'], runtimeEnvironment);
  await waitForUrl(`${apiOrigin}/api/v1/health`, 'API');

  startService(
    'client',
    [
      '--filter',
      '@invitaciones/client',
      'exec',
      'vite',
      '--host',
      'localhost',
      '--port',
      String(clientPort),
      '--strictPort'
    ],
    runtimeEnvironment
  );
  startService(
    'admin',
    [
      '--filter',
      '@invitaciones/admin',
      'exec',
      'vite',
      '--host',
      'localhost',
      '--port',
      String(adminPort),
      '--strictPort'
    ],
    runtimeEnvironment
  );
  startService(
    'scanner',
    [
      '--filter',
      '@invitaciones/scanner',
      'exec',
      'vite',
      '--host',
      'localhost',
      '--port',
      String(scannerPort),
      '--strictPort'
    ],
    runtimeEnvironment
  );
  await Promise.all([
    waitForUrl(`${clientOrigin}/login`, 'Client'),
    waitForUrl(`${adminOrigin}/login`, 'Admin'),
    waitForUrl(scannerOrigin, 'Scanner')
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
  if (databaseCreated) await dropDatabase(maintenanceUrl, databaseName).catch(reportCleanupError);
  if (storageRoot) await cleanupOwnedStorage(storageRoot).catch(reportCleanupError);
}

async function cleanupOwnedStorage(path) {
  if (!resolve(path).startsWith(resolve(root, 'var', 'managed-m01-e2e') + sep))
    throw new Error('Cleanup escaped owned M01 storage.');
  await rm(path, { recursive: true, force: true });
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
      `Required ports are occupied: ${occupied.join(', ')}. Use --port-offset with available ports; the harness did not seed, modify the database, or terminate any process.`
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
         (SELECT count(*)::int FROM ledger_entry WHERE client_id = $2::uuid) AS ledger_entries,
         (SELECT count(*)::int FROM receipt WHERE client_id = $2::uuid OR operation_reference = $1::text) AS receipts,
         (SELECT count(*)::int FROM payment WHERE client_id = $2) AS payments,
         (SELECT count(*)::int FROM finance_balance WHERE client_id = $2) AS balances,
         (SELECT count(*)::int FROM credit_line WHERE client_id = $2) AS credit_lines,
         (SELECT count(*)::int FROM event WHERE client_id = $2 AND
           (commercial_authorized_at IS NOT NULL OR design_kickoff_at IS NOT NULL OR activation_receipt_id IS NOT NULL)) AS commercial_or_financial_snapshots`,
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

async function seedLegacyCatalog(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // Existing services only; fixture catalog stays inside this run's new database.
    await client.query(`INSERT INTO service(id,code,is_active,created_at,updated_at)
      VALUES(gen_random_uuid(),'FLIPBOOK',true,now(),now()),(gen_random_uuid(),'PHYSICAL_QR',true,now(),now())
      ON CONFLICT(code) DO UPDATE SET is_active=true`);
    await client.query(`INSERT INTO client(id,type,operating_profile,name,status,created_at,updated_at)
      VALUES('15000000-0000-4000-8000-000000000201','PLANNER','SELF_SERVICE','[E2E] Legacy físico','ACTIVE',now(),now())`);
    await client.query(`INSERT INTO app_user(id,email,password_hash,role,client_id,created_at,updated_at)
      SELECT '15000000-0000-4000-8000-000000000202','legacy-physical@example.invalid',password_hash,'INDEPENDENT_PLANNER',
      '15000000-0000-4000-8000-000000000201',now(),now() FROM app_user WHERE id='15000000-0000-4000-8000-000000000003'`);
  } finally {
    await client.end();
  }
}

function startService(name, args, environment) {
  const child = spawnPnpm(args, environment, ['ignore', 'pipe', 'pipe']);
  children.push({ name, child });
  // Request logs can include Staff/public token paths. Never retain service output in QA artifacts.
  child.stdout.resume();
  let errorRemainder = '';
  child.stderr.on('data', (chunk) => {
    const lines = `${errorRemainder}${chunk}`.split(/\r?\n/u);
    errorRemainder = lines.pop() ?? '';
    for (const line of lines) {
      // Only error diagnostics, redacted before writing; never forward raw request logs.
      if (line.includes('"level":"error"')) process.stderr.write(`[${name}] ${redactQaText(line)}\n`);
    }
  });
  child.once('exit', (code, signal) => {
    if (!stoppingOwnedServices && code && process.exitCode !== 1) {
      process.stderr.write(`[managed-e2e] ${name} exited unexpectedly (${code ?? signal}).\n`);
      process.exitCode = 1;
    }
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
  process.exitCode = 1;
  process.stderr.write(`[managed-e2e] Cleanup warning: ${error instanceof Error ? error.message : String(error)}\n`);
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
