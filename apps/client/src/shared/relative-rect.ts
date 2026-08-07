export interface RelativeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function relativeRectStyles(rect: RelativeRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`
  } as const;
}
