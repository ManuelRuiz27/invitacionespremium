import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlipEngine } from './FlipEngine';

function renderEngine() {
  const onChangeState = vi.fn();
  const onPageChange = vi.fn();
  const rendered = render(
    <FlipEngine
      layout="single"
      pageCount={3}
      reducedMotion
      onChangeState={onChangeState}
      onPageChange={onPageChange}
      renderPage={({ index }) => <div>Página {index + 1}</div>}
    />
  );
  const engine = rendered.container.querySelector('.flip-engine') as HTMLDivElement;
  vi.spyOn(engine, 'getBoundingClientRect').mockReturnValue({
    bottom: 680,
    height: 680,
    left: 0,
    right: 480,
    top: 0,
    width: 480,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  return { engine, onChangeState, onPageChange };
}

describe('FlipEngine gestures', () => {
  it('does not start a turn while a vertical pointer gesture is scrolling', () => {
    const { engine, onChangeState } = renderEngine();

    fireEvent.pointerDown(engine, { pointerId: 1, pointerType: 'touch', clientX: 360, clientY: 250 });
    fireEvent.pointerMove(engine, { pointerId: 1, pointerType: 'touch', clientX: 368, clientY: 330 });
    fireEvent.pointerUp(engine, { pointerId: 1, pointerType: 'touch', clientX: 368, clientY: 330 });

    expect(onChangeState).not.toHaveBeenCalled();
  });

  it('waits for a horizontal intent before handing a drag to PageTurnController', () => {
    const { engine, onChangeState } = renderEngine();

    fireEvent.pointerDown(engine, { pointerId: 2, pointerType: 'touch', clientX: 400, clientY: 250 });
    expect(onChangeState).not.toHaveBeenCalled();

    fireEvent.pointerMove(engine, { pointerId: 2, pointerType: 'touch', clientX: 330, clientY: 255 });
    expect(onChangeState).toHaveBeenCalledWith('dragging');
  });

  it('routes a lateral tap through the engine navigation path', () => {
    const { engine, onPageChange } = renderEngine();

    fireEvent.pointerDown(engine, { pointerId: 3, pointerType: 'touch', clientX: 460, clientY: 250 });
    fireEvent.pointerUp(engine, { pointerId: 3, pointerType: 'touch', clientX: 460, clientY: 250 });

    expect(onPageChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, visiblePages: [1] }));
  });

  it('settles a horizontal gesture reported only at pointerup through the same engine path', () => {
    const { engine, onPageChange } = renderEngine();

    fireEvent.pointerDown(engine, { pointerId: 4, pointerType: 'touch', clientX: 420, clientY: 250 });
    fireEvent.pointerUp(engine, { pointerId: 4, pointerType: 'touch', clientX: 320, clientY: 255 });

    expect(onPageChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, visiblePages: [1] }));
  });
});
