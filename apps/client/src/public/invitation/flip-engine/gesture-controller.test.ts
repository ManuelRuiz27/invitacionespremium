import { describe, expect, it } from 'vitest';
import { GestureController } from './gesture-controller';

describe('GestureController', () => {
  it('keeps the gesture undecided until movement clears the tap slop', () => {
    const controller = new GestureController();
    controller.start({ x: 200, y: 300, at: 0 });

    expect(controller.move({ x: 206, y: 301, at: 20 })).toMatchObject({ intent: 'undecided', direction: null });
  });

  it('leaves a vertical gesture available to the browser scroll', () => {
    const controller = new GestureController();
    controller.start({ x: 200, y: 300, at: 0 });

    expect(controller.move({ x: 210, y: 340, at: 20 })).toMatchObject({ intent: 'scroll', direction: null });
  });

  it('maps horizontal swipes to physical forward and backward turns', () => {
    const controller = new GestureController();
    controller.start({ x: 360, y: 300, at: 0 });
    expect(controller.move({ x: 300, y: 310, at: 20 })).toMatchObject({ intent: 'turn', direction: 'next' });

    controller.reset();
    controller.start({ x: 120, y: 300, at: 0 });
    expect(controller.move({ x: 185, y: 308, at: 20 })).toMatchObject({ intent: 'turn', direction: 'prev' });
  });

  it('uses only the lateral quarters as tap navigation zones', () => {
    const controller = new GestureController();
    controller.start({ x: 20, y: 300, at: 0 });
    expect(controller.finish({ x: 20, y: 300, at: 40 }, 400)).toMatchObject({ tapDirection: 'prev' });

    controller.start({ x: 200, y: 300, at: 0 });
    expect(controller.finish({ x: 200, y: 300, at: 40 }, 400)).toMatchObject({ tapDirection: null });

    controller.start({ x: 380, y: 300, at: 0 });
    expect(controller.finish({ x: 380, y: 300, at: 40 }, 400)).toMatchObject({ tapDirection: 'next' });
  });

  it('does not reinterpret a dragged gesture as a tap', () => {
    const controller = new GestureController();
    controller.start({ x: 200, y: 300, at: 0 });

    expect(controller.finish({ x: 205, y: 340, at: 40 }, 400)).toMatchObject({ intent: 'scroll', tapDirection: null });
  });
});
