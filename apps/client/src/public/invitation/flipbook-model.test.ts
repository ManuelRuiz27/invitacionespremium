import { describe, expect, it } from 'vitest';
import { createFlipbookViews, preloadFlipbookPageIndexes } from './flipbook-model';

describe('createFlipbookViews', () => {
  it.each([
    [1, [[0]]],
    [2, [[0], [1]]],
    [3, [[0], [1, 2]]],
    [4, [[0], [1, 2], [3]]],
    [5, [[0], [1, 2], [3, 4]]],
    [10, [[0], [1, 2], [3, 4], [5, 6], [7, 8], [9]]]
  ])('builds the desktop publication model for %s pages', (pageCount, expected) => {
    expect(createFlipbookViews(pageCount, 'spread').map((view) => view.pageIndexes)).toEqual(expected);
  });

  it('keeps every page individual on mobile', () => {
    expect(createFlipbookViews(5, 'single').map((view) => view.pageIndexes)).toEqual([[0], [1], [2], [3], [4]]);
  });

  it('preloads only the current and adjacent logical views', () => {
    const views = createFlipbookViews(10, 'spread');
    expect([...preloadFlipbookPageIndexes(views, 2)]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
