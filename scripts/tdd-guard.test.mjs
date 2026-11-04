import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkScope, matches, safePath, validate } from './tdd-guard.mjs';

const contract = 'tdd/contracts/IP-TDD-001.json';
const spec = {
  schemaVersion: 1,
  taskId: 'IP-TDD-001',
  executor: 'codex',
  risk: 'L2',
  testPaths: ['apps/api/src/example.spec.ts'],
  implementationPaths: ['apps/api/src/example.ts'],
  qaCommands: [['node', '--test', 'apps/api/src/example.spec.ts']],
  acceptance: ['Implement verified behavior']
};

test('valid contract allows exactly specified implementation files', () => {
  assert.equal(validate(spec, contract).risk, 'L2');
  assert.equal(matches('apps/api/src/example.ts', spec.implementationPaths), true);
  assert.equal(matches('apps/api/src/another.ts', spec.implementationPaths), false);
  assert.equal(matches('apps/api/src/example/a.ts', ['apps/api/src/example/**']), true);
  assert.doesNotThrow(() => checkScope(['apps/api/src/example.ts'], spec, contract));
});

test('locked tests, contracts and unrelated files cannot change', () => {
  for (const file of [contract, 'apps/api/src/example.spec.ts', 'apps/client/src/App.tsx'])
    assert.throws(() => checkScope([file], spec, contract));
});

test('invalid paths and unsafe contract changes are rejected', () => {
  for (const file of ['../secret', '/etc', 'C:\\a', 'a//b', 'apps/./a', 'apps/*/b'])
    assert.throws(() => safePath(file));
  assert.throws(() => validate({ ...spec, risk: 'L0' }, contract));
  assert.throws(() => validate({ ...spec, risk: 'L3' }, contract));
  assert.throws(() => validate({ ...spec, testPaths: [] }, contract));
  assert.throws(() => validate({ ...spec, implementationPaths: ['AGENTS.md'] }, contract));
  assert.throws(() => validate({ ...spec, implementationPaths: ['apps/api/src/**'] }, contract));
  assert.throws(() => validate({ ...spec, qaCommands: [['pnpm', 'qa:full']] }, contract));
  assert.equal(validate({ ...spec, risk: 'L3', independentReviewRequired: true }, contract).risk, 'L3');
});

test('git integration: RED/GREEN contract locks tests and CI validates original baseline', () => {
  const work = mkdtempSync(join(tmpdir(), 'invitation-tdd-'));
  const runGit = (...args) => {
    const command = spawnSync('git', args, { cwd: work, encoding: 'utf8', windowsHide: true });
    assert.equal(command.status, 0, command.stderr);
    return command.stdout.trim();
  };
  const runGuard = (...args) =>
    spawnSync(process.execPath, [join(work, 'scripts/tdd-guard.mjs'), ...args], {
      cwd: work,
      encoding: 'utf8',
      windowsHide: true
    });
  try {
    runGit('init', '-q');
    runGit('config', 'user.email', 'qa@example.invalid');
    runGit('config', 'user.name', 'QA Fixture');
    runGit('config', 'core.autocrlf', 'true');
    mkdirSync(join(work, 'scripts'), { recursive: true });
    mkdirSync(join(work, 'apps/api/src'), { recursive: true });
    mkdirSync(join(work, 'tdd/contracts'), { recursive: true });
    copyFileSync(new URL('./tdd-guard.mjs', import.meta.url), join(work, 'scripts/tdd-guard.mjs'));
    writeFileSync(join(work, 'package.json'), '{"type":"module"}\n');
    writeFileSync(join(work, '.gitignore'), 'var/tdd/\n');
    writeFileSync(join(work, 'apps/api/src/example.js'), 'export const answer = () => 0;\n');
    runGit('add', '.');
    runGit('commit', '-qm', 'initial implementation');
    runGit('branch', '-M', 'main');
    runGit('switch', '-q', '-c', 'tdd/IP-TDD-001');

    const task = {
      schemaVersion: 1,
      taskId: 'IP-TDD-001',
      executor: 'codex',
      risk: 'L2',
      testPaths: ['apps/api/src/example.spec.js'],
      implementationPaths: ['apps/api/src/example.js'],
      qaCommands: [['node', '--test', 'apps/api/src/example.spec.js']],
      acceptance: ['answer() must return 42']
    };
    writeFileSync(join(work, 'tdd/contracts/IP-TDD-001.json'), JSON.stringify(task, null, 2) + '\n');
    writeFileSync(
      join(work, 'apps/api/src/example.spec.js'),
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { answer } from './example.js';\ntest('RED then GREEN', () => assert.equal(answer(), 42));\n"
    );
    runGit('add', '.');
    runGit('commit', '-qm', 'test: baseline RED');
    const baseline = runGit('rev-parse', 'HEAD');
    const args = ['--contract=tdd/contracts/IP-TDD-001.json', '--baseline=' + baseline];
    const preflight = runGuard(...args);
    assert.equal(preflight.status, 0, preflight.stderr);
    assert.match(preflight.stdout, /Scope PASS/, 'the CLI must execute, not silently exit');
    const red = runGuard(...args, '--run');
    assert.notEqual(red.status, 0, 'RED should fail; stdout: ' + red.stdout + '; stderr: ' + red.stderr);
    assert.match(red.stderr, /QA FAILED/, 'RED must fail because the test failed');

    writeFileSync(join(work, 'apps/api/src/example.js'), 'export const answer = () => 42;\n');
    const green = runGuard(...args, '--run');
    assert.equal(green.status, 0, 'GREEN should pass: ' + green.stderr);
    assert.match(green.stdout, /PASS; log:/, 'GREEN must execute the declared QA command');
    runGit('add', 'apps/api/src/example.js');
    runGit('commit', '-qm', 'feat: implement approved test');
    const ci = runGuard('--ci', '--main-ref=main');
    assert.equal(ci.status, 0, 'CI scope should pass: ' + ci.stderr);
    assert.match(ci.stdout, /CI scope PASS/, 'CI guard must execute');

    writeFileSync(join(work, 'apps/api/src/example.spec.js'), 'test tampered\n');
    const tampered = runGuard(...args);
    assert.notEqual(tampered.status, 0, 'locked test must fail');
    assert.match(tampered.stderr, /Locked TDD file modified/);
    runGit('checkout', '--', 'apps/api/src/example.spec.js');
    const restored = readFileSync(join(work, 'apps/api/src/example.spec.js'), 'utf8');
    assert(restored.includes('\r\n'), 'fixture must reproduce CRLF restoration');
    const afterCheckout = runGuard(...args);
    assert.equal(afterCheckout.status, 0, 'restored test must be recognized despite CRLF: ' + afterCheckout.stderr);
    writeFileSync(join(work, 'apps/client-extra.ts'), 'out of scope\n');
    const outside = runGuard(...args);
    assert.notEqual(outside.status, 0, 'untracked out-of-scope work must fail');
    assert.match(outside.stderr, /Out-of-scope or locked file changed/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
