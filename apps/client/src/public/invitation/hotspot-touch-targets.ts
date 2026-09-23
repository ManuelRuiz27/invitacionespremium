interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Presentation only: expand the hit surface around the original artwork, but
// never outside its image or into another action's expanded target.
export function hotspotTouchInsets(rects: Rect[], size: { width: number; height: number }): string[] {
  if (size.width <= 0 || size.height <= 0) return rects.map(() => '0px');
  const original = rects.map((rect) => ({
    x: rect.x * size.width,
    y: rect.y * size.height,
    width: rect.width * size.width,
    height: rect.height * size.height
  }));
  const expanded = original.map((rect) => {
    const width = Math.min(size.width, Math.max(44, rect.width));
    const height = Math.min(size.height, Math.max(44, rect.height));
    return {
      x: Math.max(0, Math.min(size.width - width, rect.x - (width - rect.width) / 2)),
      y: Math.max(0, Math.min(size.height - height, rect.y - (height - rect.height) / 2)),
      width,
      height
    };
  });
  return expanded.map((rect, index) => {
    const overlaps = expanded.some((other, otherIndex) =>
      index !== otherIndex && rect.x < other.x + other.width && rect.x + rect.width > other.x &&
      rect.y < other.y + other.height && rect.y + rect.height > other.y
    );
    if (overlaps) return '0px';
    const source = original[index]!;
    return `${rect.y - source.y}px ${source.x + source.width - rect.x - rect.width}px ${source.y + source.height - rect.y - rect.height}px ${rect.x - source.x}px`;
  });
}
