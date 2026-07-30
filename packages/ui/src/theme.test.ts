import { describe, expect, it } from 'vitest';
import { appTheme } from './theme';

describe('appTheme', () => {
  it('uses the shared premium-neutral tokens', () => {
    expect(appTheme.shape.borderRadius).toBe(16);
    expect(appTheme.palette.background.default).toBe('#F6F4EF');
    expect(appTheme.palette.primary.main).toBe('#3157C8');
  });
});
