export interface RelativeVisualRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedSize {
  width: number;
  height: number;
}

export function projectAspectAwareRect(
  rect: RelativeVisualRect,
  renderedSize: RenderedSize,
  equalPhysicalSides: boolean
): RelativeVisualRect {
  if (!equalPhysicalSides || renderedSize.width <= 0 || renderedSize.height <= 0) return { ...rect };
  const physicalSide = rect.width * Math.min(renderedSize.width, renderedSize.height);
  return {
    x: rect.x,
    y: rect.y,
    width: physicalSide / renderedSize.width,
    height: physicalSide / renderedSize.height
  };
}

export function relativeRectStyles(rect: RelativeVisualRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`
  } as const;
}
