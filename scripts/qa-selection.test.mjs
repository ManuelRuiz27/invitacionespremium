import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { qaPlan, quickRelatedFiles, requiresApiConsumers, selectWorkspaces, touchesQaTooling } from './qa-selection.mjs';

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
test('agent configuration is non-runtime and does not activate every workspace', () => {
  const files = ['.codex/config.toml', '.agents/rules/ui.md', '.agents/skills/qa-scope/SKILL.md', 'AGENTS.md'];
  const selected = selectWorkspaces(workspaces, files);
  assert.deepEqual(selected.selected, []);
  assert.equal(selected.global, false);
  assert.equal(qaPlan(files).risk, 'L0');
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
    ['focused', '--unknown'],
    ['quick', '--journeys=managed'],
    ['focused', '--journeys=unknown', '--files=apps/client/src/App.tsx'],
    ['focused', '--risk=invalid', '--files=apps/client/src/App.tsx']
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-qa.mjs', import.meta.url)), ...args], {
      encoding: 'utf8',
      windowsHide: true
    });
    assert.notEqual(result.status, 0);
    assert(!result.stdout.includes('[qa:'));
  }
});
test('API contract scope traverses consumers; ordinary service changes do not', () => {
  assert.equal(requiresApiConsumers(['apps/api/src/events/events.service.ts']), false);
  assert.equal(requiresApiConsumers(['apps/api/src/events/events.controller.ts']), true);
  assert.equal(requiresApiConsumers(['apps/api/prisma/schema.prisma']), true);
  assert.deepEqual(selectWorkspaces(workspaces, ['scripts/run-qa.mjs']).selected, []);
  assert.equal(touchesQaTooling(['scripts/run-qa.mjs']), true);
});
test('critical paths cannot be classified as trivial', () => {
  assert.equal(qaPlan(['apps/landing/src/App.css']).risk, 'L0');
  assert.equal(qaPlan(['apps/landing/src/App.tsx'], { risk: 'L0' }).risk, 'L1');
  assert.equal(qaPlan(['apps/api/src/events/events.service.ts']).risk, 'L2');
  assert.equal(qaPlan(['apps/scanner/src/App.tsx'], { risk: 'L0' }).risk, 'L3');
  assert.deepEqual(qaPlan(['apps/scanner/src/App.tsx']).journeys, ['managed', 'access-control']);
  assert.deepEqual(qaPlan(['apps/api/prisma/schema.prisma']).journeys, ['managed', 'access-control', 'public-catalog']);
  assert.throws(() => qaPlan([], { journeys: ['unknown'] }));
});
test('focused landing QA requires explicit browser journeys', () => {
  const entry = fileURLToPath(new URL('./run-qa.mjs', import.meta.url));
  const basic = spawnSync(process.execPath, [entry, 'focused', '--files=apps/landing/src/App.tsx', '--dry-run'], {
    encoding: 'utf8', windowsHide: true
  });
  assert.equal(basic.status, 0, basic.stderr);
  assert(!basic.stdout.includes('test:e2e:managed'));
  assert(!basic.stdout.includes('playwright test'));
  assert(!basic.stdout.includes('pnpm format:check'));
  assert(basic.stdout.includes('vitest related --run src/App.tsx'));
  const selected = spawnSync(process.execPath, [entry, 'focused', '--files=apps/landing/src/App.tsx', '--journeys=public-catalog', '--dry-run'], {
    encoding: 'utf8', windowsHide: true
  });
  assert.equal(selected.status, 0, selected.stderr);
  assert(selected.stdout.includes('test:e2e:public-catalog'));
});
test('critical Scanner retains mandatory E2E regardless of requested risk', () => {
  const entry = fileURLToPath(new URL('./run-qa.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [entry, 'focused', '--files=apps/scanner/src/App.tsx', '--risk=L0', '--dry-run'], {
    encoding: 'utf8', windowsHide: true
  });
  assert.equal(run.status, 0, run.stderr);
  assert(run.stdout.includes('Requested risk upgraded to L3'));
  assert(run.stdout.includes('test:e2e:managed'));
  assert(run.stdout.includes('test:e2e:access-control'));
  assert(!run.stdout.includes('playwright.flipbook.config.ts'));
});
test('docs and QA tooling skip unrelated runtime suites', () => {
  const entry = fileURLToPath(new URL('./run-qa.mjs', import.meta.url));
  const docs = spawnSync(process.execPath, [entry, 'focused', '--files=docs/INDEX.md', '--dry-run'], {
    encoding: 'utf8', windowsHide: true
  });
  assert.equal(docs.status, 0, docs.stderr);
  assert(docs.stdout.includes('No runtime suites required'));
  const tooling = spawnSync(process.execPath, [entry, 'focused', '--files=scripts/qa-selection.mjs', '--dry-run'], {
    encoding: 'utf8', windowsHide: true
  });
  assert.equal(tooling.status, 0, tooling.stderr);
  assert(tooling.stdout.includes('pnpm qa:tooling:test'));
  assert(!tooling.stdout.includes('turbo run lint typecheck'));
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
