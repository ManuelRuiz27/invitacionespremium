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
});
