import { describe, expect, it } from 'vitest';
import { PageTurnController } from './page-turn-controller';

const bounds = { width: 480, height: 680 };

describe('PageTurnController', () => {
  it('completes a forward turn once the fold passes its midpoint', () => {
    const controller = new PageTurnController();
    controller.start('next', { x: 480, y: 340, at: 0 }, bounds);
    controller.move({ x: 220, y: 340, at: 120 });
    expect(controller.release(130)).toMatchObject({ phase: 'completing', direction: 'next' });

    const result = controller.advance(600);
    expect(result.complete).toBe(true);
    expect(result.snapshot).toMatchObject({ phase: 'completing', progress: 1 });
    expect(controller.current.phase).toBe('idle');
  });

  it('snaps back a partial or cancelled turn without committing it', () => {
    const controller = new PageTurnController();
    controller.start('prev', { x: 0, y: 340, at: 0 }, bounds);
    controller.move({ x: 120, y: 340, at: 200 });
    expect(controller.cancel(210).phase).toBe('snapping_back');

    const result = controller.advance(700);
    expect(result.complete).toBe(false);
    expect(result.snapshot).toMatchObject({ phase: 'snapping_back', progress: 0 });
    expect(controller.current.phase).toBe('idle');
  });
});
