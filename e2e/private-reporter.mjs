// Private journeys carry live single-delivery credentials. Never print Playwright's
// raw call log (which can contain a goto URL, POST payload or filled password).
export function redactQaText(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, '[database]')
    .replace(/\b(?:st|na|pp|ip|qr)\d+\.[A-Za-z0-9_.-]+/gu, '[credential]')
    .replace(/[A-Za-z0-9_-]{30,}/gu, '[opaque value]');
}

export default class PrivateReporter {
  onBegin(_config, suite) {
    process.stdout.write(`[private-qa] ${suite.allTests().length} tests\n`);
  }
  onTestEnd(test, result) {
    process.stdout.write(redactQaText(`[${result.status}] ${test.title} (${result.duration} ms)\n`));
    for (const error of result.errors)
      process.stderr.write(`${redactQaText(error.stack ?? error.message ?? 'Test failed')}\n`);
  }
  onStdOut(chunk) {
    process.stdout.write(redactQaText(chunk));
  }
  onStdErr(chunk) {
    process.stderr.write(redactQaText(chunk));
  }
  onError(error) {
    process.stderr.write(`${redactQaText(error.stack ?? error.message ?? 'Runner failed')}\n`);
  }
  onEnd(result) {
    process.stdout.write(`[private-qa] ${result.status}\n`);
  }
}
