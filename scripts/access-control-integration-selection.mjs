export function integrationSelection(args) {
  const nominalPerformance = args.includes('--nominal-performance');
  const integrationOnly = args.includes('--integration-only') || nominalPerformance;
  const fileArgs = args.filter((arg) => arg.startsWith('--integration-files='));
  if (nominalPerformance && (args.includes('--public-catalog') || args.includes('--guide') || fileArgs.length))
    throw new Error('NOMINAL performance must run alone in its isolated database.');
  if (fileArgs.length > 1 || (fileArgs.length && !integrationOnly && !args.includes('--integration')))
    throw new Error('Integration files require one explicit integration selection.');
  const files = fileArgs.length ? fileArgs[0].slice('--integration-files='.length).split(',') : [];
  if (files.some((file) => !/^[a-z][a-z0-9-]+$/u.test(file))) throw new Error('Invalid integration file selection.');
  return {
    integrationOnly,
    runIntegration: integrationOnly || args.includes('--integration'),
    testArgs: nominalPerformance
      ? ['test/access-control-operations.integration-spec.ts', '-t', '^DT08 .* DT09 measures 150 NOMINAL rights ']
      : files.map((file) => `test/${file}.integration-spec.ts`)
  };
}

export function assertNominalPerformanceResult(report) {
  const passed =
    report.testResults?.flatMap((file) => file.assertionResults ?? []).filter((test) => test.status === 'passed') ?? [];
  if (
    report.numPassedTests !== 1 ||
    report.numFailedTests !== 0 ||
    passed.length !== 1 ||
    !/^DT08 .* DT09 measures 150 NOMINAL rights /u.test(passed[0].fullName)
  )
    throw new Error('NOMINAL performance did not execute exactly its required load case.');
}
