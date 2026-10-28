import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { quickRelatedFiles, selectWorkspaces } from './qa-selection.mjs';

const workspaces = [
  { name: '@invitaciones/api', path: 'apps/api', dependencies: [] },
  { name: '@invitaciones/api-client', path: 'packages/api-client', dependencies: [] },
  { name: '@invitaciones/ui', path: 'packages/ui', dependencies: [] },
  { name: '@invitaciones/client', path: 'apps/client', dependencies: ['@invitaciones/api-client', '@invitaciones/ui'] },
  { name: '@invitaciones/admin', path: 'apps/admin', dependencies: ['@invitaciones/api-client', '@invitaciones/ui'] }
];
test('historical quality gate rejects failed, skipped, cancelled and missing prerequisite jobs', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const command = workflow.match(/node -e '([^\n]+)'/u)?.[1];
  assert(command, 'the final quality gate must be executable');
  const names = ['checks', 'unit-tests', 'api-integration', 'pilot-browser-qa', 'flipbook-browser-qa'];
  const results = Object.fromEntries(names.map((name) => [name, { result: 'success' }]));
  function gate(jobs) {
    return spawnSync(process.execPath, ['-e', command], {
      env: { ...process.env, QA_RESULTS: JSON.stringify(jobs) },
      windowsHide: true
    }).status;
  }
  assert.equal(gate(results), 0);
  for (const name of names)
    for (const result of ['failure', 'skipped', 'cancelled'])
      assert.notEqual(gate({ ...results, [name]: { result } }), 0);
  const missing = { ...results };
  delete missing.checks;
  assert.notEqual(gate(missing), 0);
});
test('app selection includes real dependencies without unrelated apps', () => {
  const result = selectWorkspaces(workspaces, ['apps/client/src/view.tsx']);
  assert.deepEqual(result.affected, ['@invitaciones/client']);
  assert.deepEqual(result.selected, ['@invitaciones/api-client', '@invitaciones/client', '@invitaciones/ui']);
  assert.deepEqual(quickRelatedFiles(workspaces[3], ['apps/client/src/view.tsx'], result), ['src/view.tsx']);
});
test('shared code includes all transitive consumers and runs their full suites', () => {
  const result = selectWorkspaces(workspaces, ['packages/ui/src/Button.tsx']);
  assert.deepEqual(result.affected, ['@invitaciones/admin', '@invitaciones/client', '@invitaciones/ui']);
  assert.equal(quickRelatedFiles(workspaces[3], ['packages/ui/src/Button.tsx'], result), null);
});
test('API changes traverse the generated OpenAPI client boundary', () => {
  assert.deepEqual(
    selectWorkspaces(workspaces, ['apps/api/prisma/schema.prisma']).selected,
    workspaces.map((item) => item.name).sort()
  );
});
test('quick API units stay within the API; focused QA traverses the contract boundary', () => {
  assert.deepEqual(
    selectWorkspaces(workspaces, ['apps/api/src/scanner/scanner.service.ts'], { includeApiConsumers: false }).selected,
    ['@invitaciones/api']
  );
});
test('root tooling/config changes conservatively select every workspace', () => {
  const result = selectWorkspaces(workspaces, ['pnpm-lock.yaml']);
  assert.equal(result.selected.length, workspaces.length);
  assert.equal(quickRelatedFiles(workspaces[3], ['apps/client/src/view.tsx'], result), null);
});
test('docs-only and empty selections do not invent affected runtime modules', () => {
  assert.deepEqual(selectWorkspaces(workspaces, ['README.md', 'docs/INDEX.md']).selected, []);
  assert.deepEqual(selectWorkspaces(workspaces, []).selected, []);
});
test('moving a source file between apps includes both the deleted and added owner', () => {
  assert.deepEqual(selectWorkspaces(workspaces, ['apps/client/src/old.ts', 'apps/admin/src/new.ts']).owners, [
    '@invitaciones/admin',
    '@invitaciones/client'
  ]);
});
test('unsafe paths fail and Windows relative paths normalize', () => {
  for (const path of ['../apps/api', '/apps/api', 'C:\\apps\\api'])
    assert.throws(() => selectWorkspaces(workspaces, [path]));
  assert.deepEqual(selectWorkspaces(workspaces, ['apps\\client\\src\\view.tsx']).affected, ['@invitaciones/client']);
});
test('invalid scopes and filtering full QA fail before running tools or creating resources', () => {
  for (const args of [
    ['full', '--files=apps/client/src/App.tsx'],
    ['quick', '--files='],
    ['quick', '--base=--help'],
    ['focused', '--unknown']
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-qa.mjs', import.meta.url)), ...args], {
      encoding: 'utf8',
      windowsHide: true
    });
    assert.notEqual(result.status, 0);
    assert(!result.stdout.includes('[qa:'));
  }
});
test('focused Scanner and Landing QA prepare the dependencies of all browser surfaces', () => {
  for (const app of ['scanner', 'landing']) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./run-qa.mjs', import.meta.url)),
        'focused',
        `--files=apps/${app}/src/App.tsx`,
        '--dry-run'
      ],
      { encoding: 'utf8', windowsHide: true }
    );
    assert.equal(result.status, 0, result.stderr);
    assert(result.stdout.includes('turbo run build --filter=@invitaciones/client^...'));
    assert(result.stdout.includes('Dry run only; no validations executed'));
  }
});
test('quick formatting checks selected existing files; full QA keeps global format validation', () => {
  const entry = fileURLToPath(new URL('./run-qa.mjs', import.meta.url));
  const quick = spawnSync(
    process.execPath,
    [entry, 'quick', '--files=apps/client/src/server/invitation-preview.ts', '--dry-run'],
    { encoding: 'utf8', windowsHide: true }
  );
  assert.equal(quick.status, 0, quick.stderr);
  assert(quick.stdout.includes('prettier --check --ignore-unknown ./apps/client/src/server/invitation-preview.ts'));
  const full = spawnSync(process.execPath, [entry, 'full', '--dry-run'], { encoding: 'utf8', windowsHide: true });
  assert.equal(full.status, 0, full.stderr);
  assert(full.stdout.includes('[qa:full] pnpm format:check'));
});
