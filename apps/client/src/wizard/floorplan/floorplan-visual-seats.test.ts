import { describe, expect, it } from 'vitest';
import { visualSeats } from './floorplan-visual-seats';

describe('derived visual seats', () => {
  it.each(['CIRCLE', 'SQUARE', 'RECTANGLE'] as const)('derives exactly capacity seats for %s', (geometry) => {
    expect(visualSeats(geometry, 12, 120, 80)).toHaveLength(12);
  });

  it('does not create nodes for zero capacity', () => {
    expect(visualSeats('CIRCLE', 0, 100, 100)).toEqual([]);
  });

  it('places circular seats around, rather than inside, the table body', () => {
    const seats = visualSeats('CIRCLE', 4, 100, 100, 10);
    expect(seats[0]?.x).toBeCloseTo(50);
    expect(seats[0]?.y).toBeCloseTo(-10);
    expect(seats[1]?.x).toBeCloseTo(110);
    expect(seats[1]?.y).toBeCloseTo(50);
  });
});
