import { describe, expect, it } from 'vitest';
import { BookState, spreadsFor } from './book-state';

describe('BookState', () => {
  it('keeps cover and back cover as individual leaves in a spread layout', () => {
    expect(spreadsFor(6, 'spread')).toEqual([[0], [1, 2], [3, 4], [5]]);
  });

  it('preserves the focused leaf when changing between single and spread layouts', () => {
    const book = new BookState(6, 'single');
    book.goTo(4);

    expect(book.setLayout('spread')).toMatchObject({ page: 3, orientation: 'landscape', visiblePages: [3, 4] });
    expect(book.setLayout('single')).toMatchObject({ page: 4, orientation: 'portrait', visiblePages: [4] });
  });

  it('commits only valid directional turns', () => {
    const book = new BookState(4, 'spread');
    expect(book.commit('prev')).toBeNull();
    expect(book.commit('next')).toMatchObject({ visiblePages: [1, 2] });
    expect(book.commit('next')).toMatchObject({ visiblePages: [3] });
    expect(book.commit('next')).toBeNull();
  });
});
