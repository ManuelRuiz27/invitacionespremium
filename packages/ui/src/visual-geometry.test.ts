import { describe, expect, it } from 'vitest';
import { projectAspectAwareRect } from './visual-geometry';

const rect = { x: 0.2, y: 0.25, width: 0.2, height: 0.2 };

describe('projectAspectAwareRect', () => {
  it.each([
    ['square', 800, 800, 160],
    ['horizontal', 1000, 500, 100],
    ['vertical', 500, 1000, 100]
  ])('projects an equal-sided rect on a %s owner to equal physical sides', (_label, width, height, side) => {
    const projected = projectAspectAwareRect(rect, { width, height }, true);
    expect(projected.x).toBe(rect.x);
    expect(projected.y).toBe(rect.y);
    expect(projected.width * width).toBeCloseTo(side, 10);
    expect(projected.height * height).toBeCloseTo(side, 10);
  });

  it('leaves direct relative rectangles unchanged', () => {
    expect(projectAspectAwareRect({ ...rect, width: 0.3 }, { width: 1000, height: 500 }, false)).toEqual({
      ...rect,
      width: 0.3
    });
  });

  it('uses the direct projection until the owner has measurable dimensions', () => {
    expect(projectAspectAwareRect(rect, { width: 0, height: 0 }, true)).toEqual(rect);
  });
});
