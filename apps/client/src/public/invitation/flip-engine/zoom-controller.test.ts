import { describe, expect, it } from 'vitest';
import { ZoomController } from './zoom-controller';

const bounds = { width: 480, height: 680 };

describe('ZoomController', () => {
  it('toggles between fit and readable scale at a double tap', () => {
    const controller = new ZoomController();
    expect(controller.registerTap({ x: 240, y: 340, at: 0 }, bounds)).toBeNull();
    expect(controller.registerTap({ x: 240, y: 340, at: 200 }, bounds)).toMatchObject({ scale: 2, x: 0, y: 0 });

    controller.registerTap({ x: 240, y: 340, at: 500 }, bounds);
    expect(controller.registerTap({ x: 240, y: 340, at: 650 }, bounds)).toMatchObject({ scale: 1, x: 0, y: 0 });
  });

  it('keeps a pinch scale within the supported range and pans around the midpoint', () => {
    const controller = new ZoomController();
    controller.addPointer(1, { x: 160, y: 340, at: 0 }, bounds);
    controller.addPointer(2, { x: 320, y: 340, at: 0 }, bounds);

    expect(controller.movePointer(2, { x: 480, y: 340, at: 20 }, bounds)).toMatchObject({
      handled: true,
      snapshot: { scale: 2 }
    });
    expect(controller.movePointer(2, { x: 1600, y: 340, at: 40 }, bounds).snapshot.scale).toBe(3);
  });

  it('uses one-finger drags as bounded pan while zoomed', () => {
    const controller = new ZoomController();
    controller.toggleAt({ x: 240, y: 340, at: 0 }, bounds);
    controller.addPointer(1, { x: 240, y: 340, at: 10 }, bounds);

    expect(controller.movePointer(1, { x: 1000, y: 1000, at: 40 }, bounds)).toMatchObject({
      handled: true,
      snapshot: { scale: 2, x: 240, y: 340 }
    });
  });

  it('returns to fit scale when a page change resets the controller', () => {
    const controller = new ZoomController();
    controller.toggleAt({ x: 240, y: 340, at: 0 }, bounds);

    expect(controller.reset()).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
