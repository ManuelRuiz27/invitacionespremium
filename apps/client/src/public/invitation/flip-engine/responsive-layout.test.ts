import { describe, expect, it } from 'vitest';
import { resolveResponsiveLayout } from './responsive-layout';

describe('resolveResponsiveLayout', () => {
  it('uses one leaf in portrait and in height-constrained landscape viewports', () => {
    expect(resolveResponsiveLayout({ width: 390, height: 844 })).toBe('single');
    expect(resolveResponsiveLayout({ width: 844, height: 390 })).toBe('single');
  });

  it('uses a spread only when each leaf has enough readable space', () => {
    expect(resolveResponsiveLayout({ width: 1024, height: 768 })).toBe('spread');
    expect(resolveResponsiveLayout({ width: 900, height: 390 })).toBe('single');
  });
});
