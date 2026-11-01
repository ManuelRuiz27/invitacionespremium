import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises';
import { createHash, randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientFixture, eventFixture, assistantFixture } from '../calca06/browser-helpers.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const work = join(root, 'var/qa/calca-blocker03b/migration-verification');
const migration = '20261101170000_align_seat_transition_capacity';
const requireApi = createRequire(join(root, 'apps/api/package.json'));
const { Client } = requireApi('pg');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(work, { recursive: true });
for (const p of ['.env', 'apps/api/.env'])
  try {
    process.loadEnvFile(join(root, p));
  } catch {
    /* optional */
  }
const maintenanceUrl = new URL(process.env.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(maintenanceUrl.hostname), 'Loopback PostgreSQL only');
maintenanceUrl.pathname = '/postgres';
const maintenance = new Client({ connectionString: maintenanceUrl.toString() });
await maintenance.connect();
const history = (await readdir(join(root, 'apps/api/prisma/migrations'), { withFileTypes: true }))
  .filter((e) => e.isDirectory() && e.name !== migration)
  .map((e) => e.name)
  .sort();
const prior = join(work, `prior-${Date.now()}`);
await mkdir(prior);
await cp(join(root, 'apps/api/prisma/migrations/migration_lock.toml'), join(prior, 'migration_lock.toml'));
for (const name of history) {
  const file = `apps/api/prisma/migrations/${name}/migration.sql`;
  assert.equal(
    (await readFile(join(root, file), 'utf8')).replaceAll('\r\n', '\n'),
    execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' }).replaceAll('\r\n', '\n'),
    `Historical migration modified: ${name}`
  );
  await cp(join(root, `apps/api/prisma/migrations/${name}`), join(prior, name), { recursive: true });
}
const config = join(work, 'pre-head.config.ts');
await writeFile(
  config,
  `import { defineConfig } from ${JSON.stringify(requireApi.resolve('prisma/config'))};\nexport default defineConfig({ schema: ${JSON.stringify(join(root, 'apps/api/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(prior)} }, datasource: { url: process.env.DATABASE_URL } });\n`
);
const currentConfig = join(work, 'current.config.ts');
await writeFile(
  currentConfig,
  `import { defineConfig } from ${JSON.stringify(requireApi.resolve('prisma/config'))};\nexport default defineConfig({ schema: ${JSON.stringify(join(root, 'apps/api/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(join(root, 'apps/api/prisma/migrations'))} }, datasource: { url: process.env.DATABASE_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } });\n`
);
const result = {
  baseHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  migration,
  historicalMigrationsUnchanged: history.length,
  scenarios: [],
  status: 'RUNNING'
};
try {
  let baselineSchemaSql;
  for (const kind of ['upgrade', 'fresh']) {
    const name = `invitacionespremium_calca03b_${kind}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    await maintenance.query(`CREATE DATABASE "${name}"`);
    const shadowName = `${name}_shadow`;
    await maintenance.query(`CREATE DATABASE "${shadowName}"`);
    const url = new URL(maintenanceUrl);
    url.pathname = `/${name}`;
    const shadowUrl = new URL(url);
    shadowUrl.pathname = `/${shadowName}`;
    const env = {
      ...process.env,
      DATABASE_URL: url.toString(),
      SHADOW_DATABASE_URL: shadowUrl.toString(),
      NODE_ENV: 'test'
    };
    const db = new Client({ connectionString: url.toString() });
    await db.connect();
    try {
      const beforeConfig = kind === 'upgrade' ? ['--config', config] : [];
      await run(['--filter', '@invitaciones/api', 'exec', 'prisma', 'migrate', 'deploy', ...beforeConfig], env);
      let fixture, before;
      if (kind === 'upgrade') {
        const baselineDiff = await prismaCapture(
          [
            'migrate',
            'diff',
            '--from-config-datasource',
            '--to-schema',
            join(root, 'apps/api/prisma/schema.prisma'),
            '--script',
            '--exit-code'
          ],
          env
        );
        assert.equal(baselineDiff.code, 2, 'Record the existing SQL/Prisma modeling differences without hiding them');
        baselineSchemaSql = baselineDiff.stdout;
        await writeFile(join(work, 'schema-head-diagnostic.sql'), baselineSchemaSql);
        assert.equal(
          (await db.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE migration_name=$1', [migration]))
            .rows[0].n,
          0
        );
        const salt = randomBytes(16);
        const passwordHash = [
          'scrypt',
          'v=1',
          'N=16384,r=8,p=1',
          salt.toString('base64url'),
          scryptSync(randomUUID(), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64url')
        ].join('$');
        await db.query(
          "INSERT INTO app_user(id,email,password_hash,role,created_at,updated_at) VALUES($1,'operacion@invitaciones.example',$2,'PLATFORM_ADMIN',now(),now())",
          [randomUUID(), passwordHash]
        );
        await db.query(
          "INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,'FLYER',true,now(),now()) ON CONFLICT(code) DO NOTHING",
          [randomUUID()]
        );
        const client = await clientFixture(db),
          event = await eventFixture(db, client, 'Upgrade capacity fixture');
        const asset = randomUUID(),
          plan = randomUUID(),
          table = randomUUID();
        await db.query(
          "INSERT INTO file_asset(id,client_id,event_id,owner_type,owner_id,associated_at,file_type,storage_key,original_name,mime_type,size_bytes,checksum_sha256,width,height,status,created_by_user_id,created_at,updated_at) SELECT $1,$2,$3,'FLOORPLAN',$6,now(),'FLOORPLAN_IMAGE',$4,'fixture.png','image/png',1,$5,1600,1000,'READY',id,now(),now() FROM app_user WHERE email='operacion@invitaciones.example'",
          [asset, client.id, event.id, randomUUID(), hash('fixture'), plan]
        );
        await db.query(
          'INSERT INTO floorplan(id,event_id,image_asset_id,created_at,updated_at) VALUES($1,$2,$3,now(),now())',
          [plan, event.id, asset]
        );
        await db.query(
          "INSERT INTO floorplan_shape(id,floorplan_id,event_id,kind,geometry,name,normalized_name,capacity,x,y,width,height,created_at,updated_at) VALUES($1,$2,$3,'TABLE','CIRCLE','Mesa upgrade','mesa upgrade',12,0.1,0.1,0.1,0.1,now(),now())",
          [table, plan, event.id]
        );
        const person = await assistantFixture(db, event);
        await db.query('UPDATE assistant SET floorplan_shape_id=$1 WHERE id=$2', [table, person.id]);
        fixture = { event, plan, table, person };
        before = await snapshot(db, fixture);
        await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await db.query("UPDATE floorplan SET seating_mode='SEAT' WHERE id=$1", [plan]);
        await assert.rejects(
          db.query('UPDATE floorplan_shape SET capacity=0 WHERE id=$1', [table]),
          /FLOORPLAN_TABLE_OCCUPIED_OR_CAPACITY/u
        );
        await db.query('ROLLBACK');
        assert.deepEqual(await snapshot(db, fixture), before);
        await run(['--filter', '@invitaciones/api', 'exec', 'prisma', 'migrate', 'deploy'], env);
        assert.deepEqual(await snapshot(db, fixture), before, 'Migration must not rewrite existing state');
        await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await db.query("UPDATE floorplan SET seating_mode='SEAT' WHERE id=$1", [plan]);
        await db.query('UPDATE floorplan_shape SET capacity=0 WHERE id=$1', [table]);
        await db.query('COMMIT');
        const after = await snapshot(db, fixture);
        assert.equal(after.capacity, 0);
        assert.equal(after.seating_mode, 'SEAT');
        assert.equal(after.floorplan_shape_id, table);
        assert.equal(after.floorplan_seat_id, null);
        assert.equal(after.seats, 0);
      }
      const countBefore = (
        await db.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL')
      ).rows[0].n;
      await run(['--filter', '@invitaciones/api', 'exec', 'prisma', 'migrate', 'deploy'], env);
      assert.equal(
        (await db.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n,
        countBefore
      );
      const record = (
        await db.query('SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=$1', [
          migration
        ])
      ).rows;
      assert.equal(record.length, 1);
      assert(record[0].finished_at);
      assert.equal(record[0].rolled_back_at, null);
      assert.equal(
        record[0].checksum,
        hash(await readFile(join(root, `apps/api/prisma/migrations/${migration}/migration.sql`)))
      );
      await run(['--filter', '@invitaciones/api', 'exec', 'prisma', 'validate'], env);
      const schemaDiff = await prismaCapture(
        [
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          join(root, 'apps/api/prisma/schema.prisma'),
          '--script',
          '--exit-code'
        ],
        env
      );
      assert.equal(schemaDiff.code, 2);
      assert.equal(
        schemaDiff.stdout,
        baselineSchemaSql,
        'New migration must introduce zero additional SQL/Prisma modeling difference'
      );
      await writeFile(join(work, `schema-${kind}-diagnostic.sql`), schemaDiff.stdout);
      const chainDiff = await prismaCapture(
        [
          'migrate',
          'diff',
          '--from-migrations',
          join(root, 'apps/api/prisma/migrations'),
          '--to-config-datasource',
          '--config',
          currentConfig,
          '--exit-code'
        ],
        env
      );
      assert.equal(chainDiff.code, 0, 'Database must exactly match the migration chain');
      const functions = (
        await db.query(
          "SELECT proname,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('assert_floorplan_shape_capacity','assert_assistant_seating','sync_floorplan_seat_capacity','assert_assistant_floorplan_seat') ORDER BY proname"
        )
      ).rows;
      assert.equal(functions.length, 4);
      const hashes = Object.fromEntries(functions.map((f) => [f.proname, hash(f.definition)]));
      if (result.scenarios.length) assert.deepEqual(hashes, result.scenarios[0].functionSha256);
      result.scenarios.push({
        kind,
        result: 'PASS',
        migrationsApplied: countBefore,
        newMigrationAppliedOnce: true,
        existingRowsPreserved: kind === 'upgrade',
        pendingTransitionAfterUpgrade:
          kind === 'upgrade'
            ? { beforeCapacity: 12, afterCapacity: 0, tableRetained: true, seatId: null, seats: 0 }
            : null,
        migrationChainDrift: false,
        prismaSchemaValid: true,
        preexistingSqlPrismaModelingDifference: {
          exitCode: schemaDiff.code,
          sqlSha256: hash(schemaDiff.stdout),
          identicalToPreMigrationHead: true,
          newDifference: false
        },
        functionSha256: hashes
      });
    } finally {
      await db.end();
      await maintenance.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      await maintenance.query(`DROP DATABASE "${shadowName}" WITH (FORCE)`);
    }
  }
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  throw error;
} finally {
  await maintenance.end();
  await writeFile(
    join(root, 'docs/05-implementacion/evidence/calca-blocker03b/migration.json'),
    JSON.stringify(result, null, 2) + '\n'
  );
}
async function snapshot(db, f) {
  return (
    await db.query(
      'SELECT p.seating_mode,s.capacity,a.floorplan_shape_id,a.floorplan_seat_id,(SELECT count(*)::int FROM floorplan_seat WHERE floorplan_id=p.id) AS seats FROM floorplan p JOIN floorplan_shape s ON s.floorplan_id=p.id JOIN assistant a ON a.id=$2 WHERE p.id=$1',
      [f.plan, f.person.id]
    )
  ).rows[0];
}
async function run(args, env) {
  const child = spawn(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: 'inherit'
  });
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('exit', (c) => done(c ?? 1));
  });
  assert.equal(code, 0, `Prisma operation failed: ${args.filter((a) => !a.includes('config.ts')).join(' ')}`);
}
async function prismaCapture(args, env) {
  const child = spawn(process.execPath, [requireApi.resolve('prisma/build/index.js'), ...args], {
    cwd: join(root, 'apps/api'),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'inherit']
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  const code = await new Promise((done, fail) => {
    child.once('error', fail);
    child.once('exit', (c) => done(c ?? 1));
  });
  assert([0, 2].includes(code), 'Prisma diagnostic must complete without execution errors');
  return { code, stdout };
}
