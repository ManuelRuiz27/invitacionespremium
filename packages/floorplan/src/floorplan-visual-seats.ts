export interface VisualSeat {
  x: number;
  y: number;
}

const distributeAcrossSides = (capacity: number, width: number, height: number): VisualSeat[] => {
  const perimeter = Math.max(Number.EPSILON, 2 * (width + height));
  return Array.from({ length: capacity }, (_, index) => {
    let distance = ((index + 0.5) / capacity) * perimeter;
    if (distance <= width) return { x: distance, y: 0 };
    distance -= width;
    if (distance <= height) return { x: width, y: distance };
    distance -= height;
    if (distance <= width) return { x: width - distance, y: height };
    return { x: 0, y: height - (distance - width) };
  });
};

export function visualSeats(
  geometry: 'CIRCLE' | 'SQUARE' | 'RECTANGLE' | 'POLYGON',
  capacity: number,
  width: number,
  height: number,
  offset = 10
): VisualSeat[] {
  if (capacity <= 0) return [];
  if (geometry === 'CIRCLE') {
    const radiusX = width / 2 + offset;
    const radiusY = height / 2 + offset;
    return Array.from({ length: capacity }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / capacity;
      return { x: width / 2 + Math.cos(angle) * radiusX, y: height / 2 + Math.sin(angle) * radiusY };
    });
  }
  return distributeAcrossSides(capacity, width + offset * 2, height + offset * 2).map((seat) => ({
    x: seat.x - offset,
    y: seat.y - offset
  }));
}
