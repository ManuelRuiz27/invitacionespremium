import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactQaText } from '../e2e/private-reporter.mjs';

test('private reporter removes credentials, payloads, passwords and database URLs from failure logs', () => {
  const samples = [
    'st1.' + 'A'.repeat(43),
    'na1.id.' + 'b'.repeat(64) + '.' + 'C'.repeat(43),
    'pp1.id.' + 'd'.repeat(64) + '.' + 'E'.repeat(43),
    'ip1.id.' + 'f'.repeat(64) + '.' + 'G'.repeat(43),
    'qr1.id.' + 'h'.repeat(64) + '.' + 'I'.repeat(43),
    'J'.repeat(32),
    'postgresql://user:secret@localhost/database'
  ];
  for (const sample of samples) assert.ok(!redactQaText(`Failure: ${sample}`).includes(sample));
  assert.equal(redactQaText('HTTP 409 ASSISTANT_ALREADY_CHECKED_IN'), 'HTTP 409 ASSISTANT_ALREADY_CHECKED_IN');
});
