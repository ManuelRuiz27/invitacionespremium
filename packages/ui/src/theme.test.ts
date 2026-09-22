import { describe, expect, it } from 'vitest';
import { appTheme } from './theme';

describe('appTheme', () => {
  it('uses the shared premium-neutral tokens', () => {
    expect(appTheme.shape.borderRadius).toBe(10);
    expect(appTheme.palette.background.default).toBe('#F5F2EC');
    expect(appTheme.palette.primary.main).toBe('#171717');
  });
});
