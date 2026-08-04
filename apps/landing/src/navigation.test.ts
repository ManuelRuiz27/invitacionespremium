import { scrollToLandingSection } from './navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('landing section navigation', () => {
  it('uses smooth scrolling when reduced motion is not requested', () => {
    const target = document.createElement('section');
    target.id = 'servicios';
    document.body.append(target);
    const scrollIntoView = vi.spyOn(target, 'scrollIntoView');
    expect(scrollToLandingSection('#servicios')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('uses immediate scrolling for reduced motion', () => {
    vi.mocked(window.matchMedia).mockReturnValueOnce({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    });
    const target = document.createElement('section');
    target.id = 'demo';
    document.body.append(target);
    const scrollIntoView = vi.spyOn(target, 'scrollIntoView');
    expect(scrollToLandingSection('#demo')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('returns false for an unknown section', () => {
    expect(scrollToLandingSection('#missing')).toBe(false);
  });
});
