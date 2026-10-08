import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MutableRefObject } from 'react';
import { PageRenderer } from './page-renderer';

describe('PageRenderer', () => {
  it('keeps every logical page independent while adding faces and lighting only to the moving leaf', () => {
    const movingRef: MutableRefObject<HTMLDivElement | null> = { current: null };
    const { container } = render(
      <PageRenderer
        activeTurn={{ direction: 'next', source: 2, reveal: 3, rigidity: 1 }}
        currentSpread={[1, 2]}
        layout="spread"
        movingRef={movingRef}
        pageCount={6}
        hoverDirection={null}
        renderPage={({ index, shouldLoad }) => <div data-load={shouldLoad || undefined} data-test-page={index} />}
        targetSpread={[3, 4]}
      />
    );

    expect(container.querySelectorAll('[data-test-page]')).toHaveLength(7);
    expect(container.querySelectorAll('[data-flip-engine-visible="true"]')).toHaveLength(3);
    expect(container.querySelector('.stf__item')).toBeNull();
    expect(container.querySelector('[data-flip-engine-role="moving"]')).toHaveAttribute('data-turn-direction', 'next');
    expect(container.querySelectorAll('.flip-engine-page-back')).toHaveLength(1);
    expect(container.querySelector('.flip-engine-page-back [data-test-page="3"]')).toBeInTheDocument();
    expect(container.querySelectorAll('.flip-engine-lighting')).toHaveLength(1);
    expect(
      container.querySelector('[data-flip-engine-role="reveal"] [data-test-page="3"]')?.parentElement?.parentElement
    ).toHaveAttribute('data-flip-engine-role', 'reveal');
    expect(container.querySelectorAll('[data-load="true"]')).toHaveLength(6);
  });
});
