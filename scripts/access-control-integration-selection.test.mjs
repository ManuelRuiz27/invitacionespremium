import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertNominalPerformanceResult, integrationSelection } from './access-control-integration-selection.mjs';

test('NOMINAL shortcut selects the single load case and never starts browser services', () => {
  const selected = integrationSelection(['--nominal-performance']);
  assert.equal(selected.integrationOnly, true);
  assert.equal(selected.runIntegration, true);
  assert.equal(selected.testArgs[0], 'test/access-control-operations.integration-spec.ts');
  const pattern = new RegExp(selected.testArgs[2]);
  const name =
    'DT08 authoritative access operations, privacy and MVCC DT09 measures 150 NOMINAL rights with two concurrent readers, history and dashboard traffic';
  assert.ok(pattern.test(name));
  assert.ok(!pattern.test(name.replace('NOMINAL', 'ANONYMOUS')));
  assert.ok(!pattern.test('DT08 reads empty NOMINAL preparation'));
});

test('rejects ambiguous or unsafe selectors before creating any resources', () => {
  for (const flag of ['--guide', '--public-catalog', '--integration-files=scanner'])
    assert.throws(() => integrationSelection(['--nominal-performance', flag]));
  for (const files of ['', '../scanner', '--help', 'scanner,', 'scanner/other', 'scanner\nother'])
    assert.throws(() => integrationSelection(['--integration-only', `--integration-files=${files}`]));
  assert.throws(() => integrationSelection(['--integration-files=scanner']));
  assert.throws(() =>
    integrationSelection(['--integration-only', '--integration-files=scanner', '--integration-files=events'])
  );
});

test('preserves full integration and focused regression selection', () => {
  assert.deepEqual(integrationSelection(['--integration-only']), {
    integrationOnly: true,
    runIntegration: true,
    testArgs: []
  });
  assert.deepEqual(
    integrationSelection(['--integration-only', '--integration-files=scanner,access-control-operations']).testArgs,
    ['test/scanner.integration-spec.ts', 'test/access-control-operations.integration-spec.ts']
  );
  assert.equal(integrationSelection([]).runIntegration, false);
});

test('a renamed or skipped benchmark cannot silently pass the harness', () => {
  const fullName =
    'DT08 authoritative access operations, privacy and MVCC DT09 measures 150 NOMINAL rights with two concurrent readers, history and dashboard traffic';
  const report = {
    numPassedTests: 1,
    numFailedTests: 0,
    testResults: [{ assertionResults: [{ status: 'passed', fullName }] }]
  };
  assertNominalPerformanceResult(report);
  assert.throws(() => assertNominalPerformanceResult({ numPassedTests: 0, numFailedTests: 0, testResults: [] }));
  assert.throws(() => assertNominalPerformanceResult({ ...report, numPassedTests: 2 }));
  assert.throws(() =>
    assertNominalPerformanceResult({
      ...report,
      testResults: [{ assertionResults: [{ status: 'passed', fullName: fullName.replace('NOMINAL', 'ANONYMOUS') }] }]
    })
  );
});
