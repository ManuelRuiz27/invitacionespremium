import type { BookSnapshot, FlipDirection, FlipLayout } from './types';

export function spreadsFor(pageCount: number, layout: FlipLayout): number[][] {
  if (pageCount <= 0) return [];
  if (layout === 'single' || pageCount === 1) return Array.from({ length: pageCount }, (_, index) => [index]);

  const result: number[][] = [[0]];
  let next = 1;
  while (next < pageCount - 1) {
    const remainingBeforeBackCover = pageCount - 1 - next;
    if (remainingBeforeBackCover >= 2) {
      result.push([next, next + 1]);
      next += 2;
    } else {
      result.push([next]);
      next += 1;
    }
  }
  result.push([pageCount - 1]);
  return result;
}

export class BookState {
  private readonly pageCount: number;
  private layout: FlipLayout;
  private spreadIndex: number;
  private focalPage: number;

  constructor(pageCount: number, layout: FlipLayout, initialPage = 0) {
    this.pageCount = Math.max(0, pageCount);
    this.layout = layout;
    this.focalPage = Math.min(Math.max(0, initialPage), Math.max(0, this.pageCount - 1));
    this.spreadIndex = this.findSpreadIndex(this.focalPage);
  }

  snapshot(): BookSnapshot {
    const visiblePages = this.currentSpread();
    return {
      page: visiblePages[0] ?? 0,
      pageCount: this.pageCount,
      orientation: this.layout === 'spread' ? 'landscape' : 'portrait',
      visiblePages
    };
  }

  currentSpread(): number[] {
    return this.spreads()[this.spreadIndex] ?? [];
  }

  canTurn(direction: FlipDirection): boolean {
    return direction === 'next' ? this.spreadIndex < this.spreads().length - 1 : this.spreadIndex > 0;
  }

  targetSpread(direction: FlipDirection): number[] | null {
    if (!this.canTurn(direction)) return null;
    return this.spreads()[this.spreadIndex + (direction === 'next' ? 1 : -1)] ?? null;
  }

  commit(direction: FlipDirection): BookSnapshot | null {
    if (!this.canTurn(direction)) return null;
    this.spreadIndex += direction === 'next' ? 1 : -1;
    this.focalPage = this.currentSpread()[direction === 'next' ? 0 : this.currentSpread().length - 1] ?? this.focalPage;
    return this.snapshot();
  }

  goTo(page: number): BookSnapshot | null {
    if (!Number.isInteger(page) || page < 0 || page >= this.pageCount) return null;
    this.focalPage = page;
    this.spreadIndex = this.findSpreadIndex(page);
    return this.snapshot();
  }

  setLayout(layout: FlipLayout): BookSnapshot {
    if (layout === this.layout) return this.snapshot();
    const visiblePages = this.currentSpread();
    const preserved = visiblePages.includes(this.focalPage) ? this.focalPage : (visiblePages[0] ?? this.focalPage);
    this.layout = layout;
    this.spreadIndex = this.findSpreadIndex(preserved);
    this.focalPage = preserved;
    return this.snapshot();
  }

  private spreads(): number[][] {
    return spreadsFor(this.pageCount, this.layout);
  }

  private findSpreadIndex(page: number): number {
    const index = this.spreads().findIndex((spread) => spread.includes(page));
    return index < 0 ? 0 : index;
  }
}
