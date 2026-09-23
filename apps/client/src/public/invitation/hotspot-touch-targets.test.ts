import { describe, expect, it } from 'vitest';
import { hotspotTouchInsets } from './hotspot-touch-targets';

describe('Flipbook presentation touch targets', () => {
  it('centres a 44px hit surface without moving a small visual region', () => {
    expect(hotspotTouchInsets([{ x: 0.5, y: 0.5, width: 0.1, height: 0.05 }], { width: 200, height: 400 })).toEqual([
      '-12px -12px -12px -12px'
    ]);
  });
  it('keeps edge expansion inside the asset', () => {
    expect(hotspotTouchInsets([{ x: 0.95, y: 0.95, width: 0.05, height: 0.05 }], { width: 200, height: 200 })).toEqual([
      '-34px 0px 0px -34px'
    ]);
  });
  it('does not introduce ambiguous neighbouring targets', () => {
    expect(
      hotspotTouchInsets(
        [
          { x: 0.4, y: 0.5, width: 0.05, height: 0.05 },
          { x: 0.5, y: 0.5, width: 0.05, height: 0.05 }
        ],
        { width: 200, height: 200 }
      )
    ).toEqual(['0px', '0px']);
  });
});
