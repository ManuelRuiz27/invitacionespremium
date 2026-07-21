import { describe, expect, it } from 'vitest';
import { appMetadata } from './app-metadata';

describe('client metadata', () => {
  it('declares its app identity', () => {
    expect(appMetadata.appName).toBe('Client');
  });
});
