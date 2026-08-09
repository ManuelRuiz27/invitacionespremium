import { describe, expect, it } from 'vitest';
import { commitHistory, createHistory, redoHistory, undoHistory } from './floorplan-history';

describe('floorplan local history', () => {
  it('undoes and redoes visual drafts without duplicating the current value', () => {
    const first = createHistory({ x: 0.1 });
    const second = commitHistory(first, { x: 0.2 });
    const undone = undoHistory(second);
    expect(undone.present).toEqual({ x: 0.1 });
    expect(redoHistory(undone).present).toEqual({ x: 0.2 });
  });

  it('caps retained history to twenty previous drafts', () => {
    const history = Array.from({ length: 30 }, (_, x) => x + 1).reduce(commitHistory, createHistory(0));
    expect(history.past).toHaveLength(20);
  });
});
