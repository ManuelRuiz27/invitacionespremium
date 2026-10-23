import { describe, expect, it } from 'vitest';
import { parseAccessOperationsPage } from './access-control-operations.dto';

describe('bounded operations history query', () => {
  it('defaults to first page and accepts a positive canonical page', () => {
    expect(parseAccessOperationsPage({})).toBe(1);
    expect(parseAccessOperationsPage({ page: '2' })).toBe(2);
  });
  it.each([
    null,
    [],
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: '01' },
    { page: ['1'] },
    { page: '99999999' },
    { limit: '500' },
    { page: '1', search: 'name' }
  ])('rejects unsupported query %j', (query) => {
    expect(() => parseAccessOperationsPage(query)).toThrow();
  });
});
