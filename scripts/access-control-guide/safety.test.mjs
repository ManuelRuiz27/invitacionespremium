import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { maskQrPixels, secretPattern } from './safe-capture.mjs';
import { expectedImages, verifyImages } from './verify.mjs';
import { adminGuide, salonGuide } from './content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireApi = createRequire(join(root, 'apps/api/package.json'));
const qr = requireApi('qrcode');

test('publication verifier rejects secrets, altered masks, usable QR and extra files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ip-guide-security-'));
  const entry = {
    file: 'admin-test.png',
    surface: 'admin',
    mode: 'AMBOS',
    route: '/clientes',
    anchor: 'Clientes',
    width: 1440,
    height: 900,
    masks: [{ x: 0, y: 0, width: 60, height: 60 }]
  };
  const write = async (bytes) => {
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(directory, entry.file), bytes);
    await writeFile(join(directory, 'inventory.json'), JSON.stringify({ version: 1, captures: [entry] }));
  };
  try {
    await write(
      await sharp({ create: { width: 1440, height: 900, channels: 3, background: '#334155' } })
        .png()
        .toBuffer()
    );
    await verifyImages(directory, [entry.file]);
    const safe = await readFile(join(directory, 'inventory.json'), 'utf8');
    await writeFile(join(directory, 'inventory.json'), safe.replace('Clientes', 'st1.' + 'A'.repeat(43)));
    await assert.rejects(verifyImages(directory, [entry.file]), /Secret/u);
    await writeFile(join(directory, 'inventory.json'), safe);
    await writeFile(join(directory, 'unexpected.svg'), '<svg/>');
    await assert.rejects(verifyImages(directory, [entry.file]), /Unexpected/u);
    await rm(join(directory, 'unexpected.svg'));
    await write(
      await sharp({ create: { width: 1440, height: 900, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer()
    );
    await assert.rejects(verifyImages(directory, [entry.file]), /masked/u);
    entry.masks = [];
    const code = await qr.toBuffer('DOCUMENTATION_SECURITY_TEST_ONLY', { width: 256, margin: 4 });
    await write(
      await sharp({ create: { width: 1440, height: 900, channels: 3, background: '#ffffff' } })
        .composite([{ input: code, left: 1000, top: 500 }])
        .png()
        .toBuffer()
    );
    await assert.rejects(verifyImages(directory, [entry.file]), /QR/u);
    const redacted = await maskQrPixels(await readFile(join(directory, entry.file)));
    assert(redacted.masks.length > 0);
    entry.masks = redacted.masks;
    await write(redacted.png);
    await verifyImages(directory, [entry.file]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('token formats and operational identifiers are recognized without publishing them', () => {
  for (const prefix of ['st1', 'na1', 'pp1', 'ip1', 'qr1']) assert(secretPattern.test(prefix + '.' + 'A'.repeat(43)));
  assert(secretPattern.test('00000000-0000-4000-8000-000000000001'));
  assert(!secretPattern.test('Salón Jardines del Lago · Folio 6'));
  assert.equal(new Set(expectedImages).size, 39);
});

test('user instructions name current controls and only inventoried images', async () => {
  const files = [
    'apps/admin/src/auth/AdminLoginPage.tsx',
    'apps/admin/src/clients/AdminClientsPage.tsx',
    'apps/admin/src/clients/AdminClientDetailPage.tsx',
    'apps/admin/src/events/AdminEventIntakeDialog.tsx',
    'apps/admin/src/events/preparation/AdminAccessSection.tsx',
    'apps/admin/src/events/preparation/AdminEventPreparationPage.tsx',
    'apps/admin/src/events/AdminAccessOperationsPanel.tsx',
    'apps/client/src/auth/LoginPage.tsx',
    'apps/client/src/guests/GuestManagementPanel.tsx',
    'apps/client/src/workspace/access-control/AccessMaterialPanel.tsx',
    'apps/client/src/workspace/StaffAccessPanel.tsx',
    'apps/scanner/src/pages/ScannerSessionPage.tsx'
  ];
  const sources = (await Promise.all(files.map((file) => readFile(join(root, file), 'utf8')))).join('\n');
  for (const guide of [adminGuide, salonGuide])
    for (const section of guide.sections)
      for (const step of section.steps) {
        assert(expectedImages.includes(step.image + '.png'));
        for (const control of step.controls) assert(sources.includes(control), `Unknown guide control: ${control}`);
        assert(
          !/readiness|provider|tenant|endpoint|idempotencia|criptográfica|PostgreSQL|\bDTO\b/iu.test(
            `${step.title} ${step.action} ${step.result}`
          )
        );
        assert(!/NOMINAL|ANONYMOUS/u.test(step.title));
      }
});

function harness(env) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['scripts/run-access-control-e2e.mjs', '--guide'], {
      cwd: root,
      env: { ...process.env, ...env },
      windowsHide: true
    });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.once('error', fail);
    child.once('exit', (code) => done({ code, output }));
  });
}

test('guide refuses a nonlocal database before connecting', async () => {
  const result = await harness({ DATABASE_URL: 'postgresql://unused:unused@database.example/unused' });
  assert.equal(result.code, 1);
  assert(result.output.includes('requires loopback PostgreSQL'));
  assert(!result.output.includes('unused:unused'));
});

test('guide refuses an occupied port without stopping its owner', async () => {
  const server = net.createServer();
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(5300, done);
  });
  try {
    const result = await harness({ DATABASE_URL: 'postgresql://unused:unused@localhost/unused' });
    assert.equal(result.code, 1);
    assert(result.output.includes('occupied; no external process was stopped'));
    assert(server.listening);
  } finally {
    await new Promise((done) => server.close(done));
  }
});
