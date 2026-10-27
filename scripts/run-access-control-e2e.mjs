import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromApi = createRequire(join(root, 'apps/api/package.json'));
const { Client } = requireFromApi('pg');
const children = [];
const services = [];
const publicCatalog = process.argv.includes('--public-catalog');
const guide = process.argv.includes('--guide');
if (guide && (publicCatalog || process.argv.includes('--integration-only')))
  throw new Error('Guide capture cannot be combined with another journey.');
const ports = publicCatalog ? [5300, 5374, 5376] : [5300, 5373, 5374, 5375];
const name = `invitacionespremium_${publicCatalog ? 'pr01' : 'dt07'}_${Date.now()}_${randomBytes(4).toString('hex')}`;
const storage = join(root, 'var', 'managed-demo', name);
let maintenance,
  created = false;
let interrupted = false;
if (guide)
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      interrupted = true;
      for (const child of children) {
        if (!child.pid) continue;
        if (process.platform === 'win32') child.kill('SIGTERM');
        else
          try {
            process.kill(-child.pid, 'SIGTERM');
          } catch {
            /* already exited */
          }
      }
    });

try {
  for (const file of ['.env', 'apps/api/.env']) if (existsSync(join(root, file))) process.loadEnvFile(join(root, file));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required to create the isolated DT07 database.');
  for (const port of process.argv.includes('--integration-only') ? [] : ports) {
    await new Promise((ok, fail) => {
      const server = net.createServer();
      server.once('error', () => fail(new Error(`DT07 port ${port} is occupied; no external process was stopped.`)));
      server.listen(port, () => server.close(ok));
    });
  }
  const isolated = new URL(process.env.DATABASE_URL);
  if (guide && !['localhost', '127.0.0.1', '[::1]'].includes(isolated.hostname))
    throw new Error('Guide capture requires loopback PostgreSQL; no remote database was modified.');
  if (publicCatalog && !['localhost', '127.0.0.1', '[::1]'].includes(isolated.hostname))
    throw new Error('Public catalog QA requires local PostgreSQL; no remote database was modified.');
  const admin = new URL(isolated);
  admin.pathname = '/postgres';
  maintenance = admin.toString();
  isolated.pathname = `/${name}`;
  await sql(maintenance, `CREATE DATABASE "${name}"`);
  created = true;
  await mkdir(storage, { recursive: true });
  const environment = {
    ...process.env,
    DATABASE_URL: isolated.toString(),
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    API_PORT: '5300',
    PORT: '5300',
    FILE_STORAGE_LOCAL_ROOT: storage,
    AUTH_COOKIE_SECURE: 'false',
    AUTH_COOKIE_PATH: '/',
    AUTH_COOKIE_SAME_SITE: 'lax',
    CORS_ORIGINS: publicCatalog
      ? 'http://localhost:5374,http://localhost:5376'
      : 'http://localhost:5373,http://localhost:5374,http://localhost:5375,http://localhost:5173',
    VITE_API_BASE_URL: 'http://localhost:5300/api/v1',
    VITE_SOCKET_URL: 'http://localhost:5300',
    VITE_ADMIN_APP_URL: 'http://localhost:5374',
    VITE_CLIENT_APP_URL: 'http://localhost:5373',
    VITE_SCANNER_APP_URL: 'http://localhost:5375',
    ...(publicCatalog ? { VITE_APP_URL: 'http://localhost:5376' } : {}),
    PUBLIC_INVITATION_BASE_URL: 'http://localhost:5373/invitacion',
    INVITATION_TOKEN_SIGNING_SECRET: randomBytes(48).toString('base64url'),
    DT07_E2E_PASSWORD: randomBytes(24).toString('base64url')
  };
  if (guide) {
    environment.ACCESS_GUIDE_STORAGE = storage;
    // Playwright 1.55 otherwise writes an automatic DOM snapshot on failure, even with trace/screenshots off.
    environment.PLAYWRIGHT_NO_COPY_PROMPT = '1';
    environment.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`.trim();
  }
  await run(['--filter', '@invitaciones/api', 'db:migrate:deploy'], environment);
  if (process.argv.includes('--integration') || process.argv.includes('--integration-only')) {
    const selected =
      process.argv
        .find((arg) => arg.startsWith('--integration-files='))
        ?.split('=')[1]
        ?.split(',') ?? [];
    if (selected.some((file) => !/^[a-z][a-z0-9-]+$/u.test(file)))
      throw new Error('Invalid integration file selection.');
    await run(
      [
        '--filter',
        '@invitaciones/api',
        'test:integration',
        ...selected.map((file) => `test/${file}.integration-spec.ts`),
        '--pool=threads',
        '--maxWorkers=1'
      ],
      environment
    );
  }
  if (!process.argv.includes('--integration-only')) {
    await seed(isolated.toString(), environment.DT07_E2E_PASSWORD);
    if (publicCatalog) {
      await run(['--filter', '@invitaciones/api', 'services-pricing:seed'], environment);
      // Fixture only in this run's fresh database: reproduce an inactive Flyer and one elapsed rate.
      await sql(isolated.toString(), `UPDATE service SET is_active=false WHERE code='FLYER'`);
      await sql(
        isolated.toString(),
        `UPDATE service_price SET valid_from=now()-interval '2 minutes',valid_until=now()-interval '1 minute'
        WHERE service_id=(SELECT id FROM service WHERE code='FLYER') AND pricing_version=2
        AND commercial_channel='STANDARD' AND capacity_min=1 AND capacity_max=50`
      );
    }
    start(['--filter', '@invitaciones/api', 'exec', 'tsx', 'src/main.ts'], environment);
    await ready('http://localhost:5300/api/v1/health');
    for (const [app, port] of publicCatalog
      ? [
          ['admin', 5374],
          ['landing', 5376]
        ]
      : [
          ['client', 5373],
          ['admin', 5374],
          ['scanner', 5375]
        ]) {
      start(
        [
          '--filter',
          `@invitaciones/${app}`,
          'exec',
          'vite',
          '--host',
          'localhost',
          '--port',
          String(port),
          '--strictPort'
        ],
        environment
      );
    }
    await Promise.all(
      (publicCatalog ? [5374, 5376] : [5373, 5374, 5375]).map((port) => ready(`http://localhost:${port}`))
    );
    await run(
      [
        'exec',
        'playwright',
        'test',
        '--config',
        guide
          ? 'playwright.access-control-guide.config.ts'
          : publicCatalog
            ? 'playwright.public-catalog.config.ts'
            : 'playwright.access-control.config.ts'
      ],
      environment
    );
    if (publicCatalog) {
      const current = await sql(
        isolated.toString(),
        `SELECT count(*)::int AS count FROM service_price p JOIN service s ON s.id=p.service_id
        WHERE s.is_active AND s.code IN ('PHYSICAL_QR','FLYER','FLIPBOOK') AND p.pricing_version=2
        AND p.commercial_channel='STANDARD' AND p.valid_from<=now() AND (p.valid_until IS NULL OR now()<p.valid_until)`
      );
      if (current.rows[0].count !== 9) throw new Error('PR01 did not finish with nine effective public prices.');
      process.stdout.write('[PR01] Nine effective STANDARD prices; isolated fixture only.\n');
    }
    const integrity = await sql(
      isolated.toString(),
      `SELECT
      (SELECT count(*)::int FROM ledger_entry) AS ledger,
      (SELECT count(*)::int FROM receipt) AS receipts,
      (SELECT count(*)::int FROM payment) AS payments,
      (SELECT count(*)::int FROM assistant WHERE response_status <> 'PENDING') AS changed_rsvp,
      (SELECT count(*)::int FROM check_in a JOIN check_in b ON a.assistant_id=b.assistant_id AND a.id<b.id
        WHERE a.reverted_at IS NULL AND b.reverted_at IS NULL) AS duplicate_active_entries,
      (SELECT abs((SELECT count(*) FROM audit_log WHERE action='CHECK_IN_CREATE') - (SELECT count(*) FROM check_in))::int) AS duplicate_checkin_audit,
      (SELECT abs((SELECT count(*) FROM audit_log WHERE action='PHYSICAL_PASS_USE') - (SELECT count(*) FROM physical_pass WHERE used_at IS NOT NULL))::int) AS duplicate_use_audit,
      (SELECT count(*)::int FROM staff_token s JOIN event e ON e.id=s.event_id
        WHERE e.status IN ('closed','cancelled') AND s.expired_at IS NULL) AS terminal_staff`
    );
    if (Object.values(integrity.rows[0]).some((count) => count !== 0))
      throw new Error('Pilot persisted invariants failed: Finance, RSVP, active entries or terminal Staff.');
    process.stdout.write('[pilot-qa] Persisted Finance/RSVP, unique CheckIn and terminal Staff invariants passed.\n');
  }
} catch (error) {
  // Avoid connection strings and credentials in diagnostics.
  process.stderr.write(`[dt07-qa] ${String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[database]')}\n`);
  process.exitCode = 1;
} finally {
  for (const child of children.reverse()) {
    if (!child.pid || (child.exitCode !== null && !guide)) continue;
    if (process.platform === 'win32') {
      await new Promise((done) => {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore'
        });
        killer.once('exit', done);
        killer.once('error', done);
      });
    } else {
      if (guide) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* owned group already exited */
        }
      } else child.kill('SIGTERM');
      if (child.exitCode === null) await Promise.race([new Promise((done) => child.once('exit', done)), delay(5000)]);
      if (guide) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* owned group already exited */
        }
      } else if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  try {
    if (created) await sql(maintenance, `DROP DATABASE "${name}" WITH (FORCE)`);
  } finally {
    // Path is fixed to this run under var/managed-demo; never removes external data.
    await cleanupStorage();
  }
}

async function cleanupStorage() {
  if (!resolve(storage).startsWith(resolve(root, 'var', 'managed-demo') + sep))
    throw new Error('Cleanup escaped DT07 storage.');
  await rm(storage, { recursive: true, force: true });
}

async function sql(url, query, values) {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    return await db.query(query, values);
  } finally {
    await db.end();
  }
}
async function seed(url, password) {
  const clientId = '17000000-0000-4000-8000-000000000001';
  if (!guide)
    await sql(
      url,
      `INSERT INTO client(id,type,operating_profile,name,status,created_at,updated_at)
    VALUES($1,'ORGANIZATION','MANAGED','[DT07] Organización','ACTIVE',now(),now())`,
      [clientId]
    );
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const hash = ['scrypt', 'v=1', 'N=16384,r=8,p=1', salt.toString('base64url'), key.toString('base64url')].join('$');
  for (const [email, role] of guide
    ? [['operacion@invitaciones.example', 'PLATFORM_ADMIN']]
    : [
        ['provider@dt07.example', 'PLATFORM_ADMIN'],
        ['planner@dt07.example', 'ORGANIZATION_PLANNER'],
        ['unassigned@dt07.example', 'ORGANIZATION_PLANNER']
      ]) {
    await sql(
      url,
      `INSERT INTO app_user(id,email,password_hash,role,client_id,created_at,updated_at)
      VALUES($1,$2,$3,$4::user_role,$5,now(),now())`,
      [randomUUID(), email, hash, role, role === 'PLATFORM_ADMIN' ? null : clientId]
    );
  }
  await sql(
    url,
    `INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,'ACCESS_CONTROL',true,now(),now())`,
    [randomUUID()]
  );
}
function start(args, env) {
  const child = spawnPnpm(args, env, ['ignore', 'ignore', 'pipe']);
  children.push(child);
  services.push(child);
  // API errors can contain request paths with Staff secrets; only report process failure.
  child.stderr.resume();
}
async function run(args, env) {
  if (interrupted) throw new Error('Guide capture interrupted; cleaning owned resources.');
  const child = spawnPnpm(args, env, 'inherit');
  if (guide) children.push(child);
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('exit', (code) => done(code ?? 1));
  });
  if (code !== 0) throw new Error(`pnpm ${args.join(' ')} failed (${code}).`);
}
function spawnPnpm(args, env, stdio) {
  if (!process.env.npm_execpath) throw new Error('Run through pnpm exec node.');
  return spawn(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    env,
    stdio,
    windowsHide: true,
    detached: guide && process.platform !== 'win32'
  });
}
async function ready(url) {
  const until = Date.now() + 240000;
  while (Date.now() < until) {
    if (interrupted) throw new Error('Guide capture interrupted; cleaning owned resources.');
    if (services.some((child) => child.exitCode !== null))
      throw new Error('An owned DT07 service exited before readiness.');
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* startup */
    }
    await delay(300);
  }
  throw new Error('An isolated DT07 service did not become ready.');
}
function delay(ms) {
  return new Promise((done) => setTimeout(done, ms));
}
