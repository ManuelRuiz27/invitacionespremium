import { describe, expect, it } from 'vitest';
import { pageTurnGeometry, turnProgress } from './page-geometry';

describe('page geometry', () => {
  it('maps each drag direction to a positive turn progress', () => {
    expect(turnProgress('next', { x: 480, y: 0, at: 0 }, { x: 240, y: 0, at: 1 }, 480)).toBe(0.5);
    expect(turnProgress('prev', { x: 0, y: 0, at: 0 }, { x: 240, y: 0, at: 1 }, 480)).toBe(0.5);
  });

  it('uses the binding edge as the transform origin for each direction', () => {
    expect(
      pageTurnGeometry(
        { phase: 'dragging', direction: 'next', progress: 0.5, velocity: 0 },
        { width: 480, height: 680 },
        340
      )
    ).toMatchObject({ transformOrigin: '0 50%' });
    expect(
      pageTurnGeometry(
        { phase: 'dragging', direction: 'prev', progress: 0.5, velocity: 0 },
        { width: 480, height: 680 },
        340
      )
    ).toMatchObject({ transformOrigin: '100% 50%' });
  });

  it('derives curvature, lighting and the rear face from continuous turn progress', () => {
    const midTurn = pageTurnGeometry(
      { phase: 'dragging', direction: 'next', progress: 0.5, velocity: 0 },
      { width: 480, height: 680 },
      340
    );

    expect(midTurn.curvature).toBeCloseTo(1);
    expect(midTurn.backOpacity).toBeGreaterThan(0);
    expect(midTurn.foldOpacity).toBeGreaterThan(0.4);
    expect(midTurn.projectionOpacity).toBeGreaterThan(0.4);
    expect(midTurn.transform).toContain('rotateY(-98deg)');
    expect(
      pageTurnGeometry(
        { phase: 'completing', direction: 'next', progress: 1, velocity: 0 },
        { width: 480, height: 680 },
        340
      ).backOpacity
    ).toBe(0);
  });

  it('changes the fold shape when the user grabs the top or bottom corner', () => {
    const top = pageTurnGeometry(
      { phase: 'dragging', direction: 'next', progress: 0.5, velocity: 0 },
      { width: 480, height: 680 },
      0
    );
    const bottom = pageTurnGeometry(
      { phase: 'dragging', direction: 'next', progress: 0.5, velocity: 0 },
      { width: 480, height: 680 },
      680
    );

    expect(top.clipPath).not.toBe(bottom.clipPath);
    expect(top.transform).not.toBe(bottom.transform);
  });

  it('keeps covers on the same turn path with less deformation', () => {
    const leaf = pageTurnGeometry(
      { phase: 'dragging', direction: 'next', progress: 0.5, velocity: 0 },
      { width: 480, height: 680 },
      340
    );
    const cover = pageTurnGeometry(
      { phase: 'dragging', direction: 'next', progress: 0.5, velocity: 0 },
      { width: 480, height: 680 },
      340,
      0.55
    );

    expect(cover.curvature).toBeLessThan(leaf.curvature);
    expect(cover.clipPath).not.toBe(leaf.clipPath);
    expect(cover.transform).toContain('rotateY(-94.4deg)');
  });
});
