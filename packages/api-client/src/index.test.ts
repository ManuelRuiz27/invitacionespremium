import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl } from './index';

describe('normalizeApiBaseUrl', () => {
  it('removes trailing slashes', () => {
    expect(normalizeApiBaseUrl('https://api.example.com///')).toBe('https://api.example.com');
  });
});
