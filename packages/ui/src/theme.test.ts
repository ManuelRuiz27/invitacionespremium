import { describe, expect, it } from 'vitest';
import { appTheme } from './theme';

describe('appTheme', () => {
  it('uses the shared rounded shape', () => {
    expect(appTheme.shape.borderRadius).toBe(16);
  });
});
