export type FlipbookMode = 'single' | 'spread';

export interface FlipbookView {
  pageIndexes: number[];
}

export function createFlipbookViews(pageCount: number, mode: FlipbookMode): FlipbookView[] {
  if (pageCount <= 0) return [];
  if (mode === 'single') return Array.from({ length: pageCount }, (_, pageIndex) => ({ pageIndexes: [pageIndex] }));

  const views: FlipbookView[] = [{ pageIndexes: [0] }];
  for (let pageIndex = 1; pageIndex < pageCount; pageIndex += 2) {
    views.push({ pageIndexes: [pageIndex, ...(pageIndex + 1 < pageCount ? [pageIndex + 1] : [])] });
  }
  return views;
}

export function preloadFlipbookPageIndexes(views: FlipbookView[], currentViewIndex: number): Set<number> {
  if (currentViewIndex < 0 || currentViewIndex >= views.length) return new Set();

  return new Set(
    [views[currentViewIndex - 1], views[currentViewIndex], views[currentViewIndex + 1]]
      .filter((view): view is FlipbookView => Boolean(view))
      .flatMap((view) => view.pageIndexes)
  );
}
