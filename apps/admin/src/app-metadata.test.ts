import { describe, expect, it } from 'vitest';
import { appMetadata } from './app-metadata';

describe('admin metadata', () => {
  it('declares its app identity', () => {
    expect(appMetadata.appName).toBe('Admin');
  });
});
