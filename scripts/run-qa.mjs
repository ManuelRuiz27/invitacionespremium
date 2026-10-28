import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quickRelatedFiles, selectWorkspaces } from './qa-selection.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const startedAt = performance.now();
const [level, ...options] = process.argv.slice(2).filter((arg) => arg !== '--');
if (!['quick', 'focused', 'full'].includes(level)) throw new Error('Expected quick, focused or full.');
if (options.some((arg) => arg !== '--dry-run' && !arg.startsWith('--base=') && !arg.startsWith('--files=')))
  throw new Error('Supported options: --base=<git-ref>, --files=<comma-separated paths>, --dry-run.');
if (level === 'full' && options.some((arg) => arg.startsWith('--base=') || arg.startsWith('--files=')))
  throw new Error('Full QA cannot be filtered.');
for (const prefix of ['--base=', '--files='])
  if (options.filter((arg) => arg.startsWith(prefix)).length > 1) throw new Error(`Repeated ${prefix} option.`);
const dry = options.includes('--dry-run');
const base = options.find((arg) => arg.startsWith('--base='))?.slice(7);
const explicit = options.find((arg) => arg.startsWith('--files='))?.slice(8);
if (base !== undefined && (!base || base.startsWith('-'))) throw new Error('Invalid Git baseline.');
if (explicit !== undefined && !explicit) throw new Error('Empty file selection.');
if (base && explicit) throw new Error('Choose --base or --files.');
const workspaces = ['apps', 'packages'].flatMap((directory) =>
  readdirSync(join(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, directory, entry.name, 'package.json')))
    .map((entry) => {
      const path = `${directory}/${entry.name}`;
      const manifest = JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8'));
      return {
        name: manifest.name,
        path,
        dependencies: Object.keys({
          ...manifest.dependencies,
          ...manifest.devDependencies,
          ...manifest.optionalDependencies
        })
      };
    })
);
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || 'Git selection failed.');
  return result.stdout.split('\0').filter(Boolean);
}
const files =
  level === 'full'
    ? []
    : [
        ...new Set(
          explicit
            ? explicit.split(',')
            : [
                ...git(['diff', '--no-renames', '--name-only', '-z', base ? `${base}...HEAD` : 'HEAD', '--']),
                ...(base ? git(['diff', '--no-renames', '--name-only', '-z', 'HEAD', '--']) : []),
                ...git(['ls-files', '--others', '--exclude-standard', '-z'])
              ]
        )
      ].map((file) => file.replaceAll('\\', '/'));
const selection =
  level === 'full'
    ? {
        global: true,
        owners: [],
        affected: workspaces.map((workspace) => workspace.name),
        selected: workspaces.map((workspace) => workspace.name)
      }
    : selectWorkspaces(workspaces, files, { includeApiConsumers: level !== 'quick' });
process.stdout.write(`${JSON.stringify({ level, files, ...selection }, null, 2)}\n`);
function run(args, environment = process.env) {
  process.stdout.write(`[qa:${level}] pnpm ${args.join(' ')}\n`);
  if (dry) return;
  const started = performance.now();
  if (!process.env.npm_execpath) throw new Error('Run QA through pnpm.');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`QA command failed (${result.status ?? result.signal}).`);
  process.stdout.write(`[qa:${level}] Command completed in ${((performance.now() - started) / 1000).toFixed(2)}s.\n`);
}
function turbo(tasks, names = selection.selected) {
  if (names.length)
    run([
      'exec',
      'turbo',
      'run',
      ...tasks,
      ...(tasks.includes('test') ? ['--concurrency=1'] : []),
      ...names.map((name) => `--filter=${name}`)
    ]);
}

if (level === 'quick') {
  const existing = files.filter((file) => existsSync(join(root, file)));
  if (existing.length) run(['exec', 'prettier', '--check', '--ignore-unknown', ...existing.map((file) => `./${file}`)]);
  else process.stdout.write('[qa:quick] No existing modified files to format.\n');
} else run(['format:check']);
run(['qa:tooling:test']);
if (level === 'full' || (level === 'focused' && selection.affected.includes('@invitaciones/api')))
  await openApiChecks();
turbo(['lint', 'typecheck']);
if (level !== 'quick') turbo(['test']);
for (const name of level === 'quick' ? selection.affected : []) {
  const workspace = workspaces.find((item) => item.name === name);
  const related = quickRelatedFiles(workspace, files, selection);
  if (related) {
    turbo(
      ['build'],
      selection.selected.filter(
        (item) =>
          item.startsWith('@invitaciones/') &&
          item !== name &&
          workspaces.find((entry) => entry.name === item).path.startsWith('packages/')
      )
    );
    if (name === '@invitaciones/api') run(['--filter', name, 'db:generate']);
    run(['--filter', name, 'exec', 'vitest', 'related', '--run', ...related]);
  } else turbo(['test'], [name]);
}
if (level !== 'quick') {
  // All mutable DB suites and performance gates stay sequential in the owned harness.
  if (selection.affected.includes('@invitaciones/api')) run(['test:e2e:access-control', '--', '--integration-only']);
  turbo(['build']);
  const affected = new Set(selection.affected);
  // Journeys boot additional apps (for example Admin/Client for a Scanner change).
  // Prepare their shared runtime packages even in a fresh, focused checkout.
  if (level === 'focused' && affected.size) run(['exec', 'turbo', 'run', 'build', '--filter=@invitaciones/client^...']);
  if (['admin', 'client', 'scanner'].some((app) => affected.has(`@invitaciones/${app}`))) {
    run(['test:e2e:managed', '--', '--port-offset=1000']);
    run(['test:e2e:access-control']);
  }
  if (['admin', 'landing'].some((app) => affected.has(`@invitaciones/${app}`))) run(['test:e2e:public-catalog']);
  if (affected.has('@invitaciones/client')) run(['exec', 'playwright', 'test', '-c', 'playwright.flipbook.config.ts']);
  if (level === 'full' || selection.global || [...affected].some((name) => name !== '@invitaciones/landing')) {
    run(['access-control-guide:test']);
    run(['access-control-guide:verify']);
    run(['access-control-guide:render']);
  }
}
process.stdout.write(
  `[qa:${level}] ${dry ? 'Dry run only; no validations executed' : `Passed in ${((performance.now() - startedAt) / 1000).toFixed(2)}s`}.\n`
);

async function openApiChecks() {
  if (dry) {
    process.stdout.write(
      '[qa] OpenAPI: owned PostgreSQL DB → validate → migrate → generate → SDK drift/routes → drop.\n'
    );
    return;
  }
  for (const path of ['.env', 'apps/api/.env']) if (existsSync(join(root, path))) process.loadEnvFile(join(root, path));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required for isolated OpenAPI QA.');
  const baseUrl = new URL(process.env.DATABASE_URL);
  if (
    !['postgres:', 'postgresql:'].includes(baseUrl.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)
  )
    throw new Error('Local QA requires loopback PostgreSQL.');
  const name = `invitacionespremium_qa02_${Date.now()}_${randomBytes(4).toString('hex')}`;
  baseUrl.pathname = '/postgres';
  const { Client } = createRequire(join(root, 'apps/api/package.json'))('pg');
  const db = new Client({ connectionString: baseUrl.toString() });
  await db.connect();
  let created = false;
  try {
    await db.query(`CREATE DATABASE "${name}"`);
    created = true;
    baseUrl.pathname = `/${name}`;
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: baseUrl.toString(),
      API_PORT: '5300',
      LOG_LEVEL: 'error',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: 'http://localhost:5173'
    };
    run(['--filter', '@invitaciones/api', 'db:validate'], env);
    run(['--filter', '@invitaciones/api', 'db:migrate:deploy'], env);
    run(['--filter', '@invitaciones/api', 'openapi:generate'], env);
    run(['--filter', '@invitaciones/api-client', 'generate:check'], env);
    run(['--filter', '@invitaciones/api-client', 'verify:openapi-routes'], env);
  } finally {
    try {
      if (created) await db.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await db.end();
    }
  }
}
