import assert from 'node:assert/strict';
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
