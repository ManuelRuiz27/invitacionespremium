import { describe, expect, it } from 'vitest';
import { resolveOperationId } from './request-context';

describe('resolveOperationId', () => {
  it('preserves a valid UUID correlation value', () => {
    const operationId = '8f66c916-9aa5-4b88-81f2-b0dd3e2f86e5';

    expect(resolveOperationId(operationId)).toBe(operationId);
  });

  it('replaces an invalid correlation value with a UUID', () => {
    expect(resolveOperationId('invalid-correlation')).toMatch(
      /^[0-9a-f-]{36}$/i
    );
  });
});
