import { describe, expect, it } from 'vitest';
import type { AdminFloorplanSeat } from '@invitaciones/api-client';
import { nextTraceSeatLabel, nextDuplicateSeatLabel } from './floorplan-trace-label';

describe('Trace label proposal', () => {
  it('fills the first free human label in the selected parent without using array length or UUID', () => {
    const seat = (label: string, parent = 'table'): AdminFloorplanSeat => ({
      id: label,
      label,
      floorplanShapeId: parent,
      x: 0,
      y: 0,
      isBlocked: false,
      occupied: false
    });
    const seats = [seat('  LUGAR   1 '), seat('Lugar 3'), seat('Cabecera'), seat('Lugar 2', 'other')];
    expect(nextTraceSeatLabel(seats, 'table')).toBe('Lugar 2');
    expect(nextTraceSeatLabel([...seats, seat('Lugar 2')], 'table')).toBe('Lugar 4');
    expect(nextTraceSeatLabel(seats.slice(1), 'table')).toBe('Lugar 1');
    expect(nextTraceSeatLabel([], 'table')).toBe('Lugar 1');
    expect(nextDuplicateSeatLabel([seat('LUGAR 1 2'), seat(' lugar  1 3 ')], 'table', 'Lugar 1')).toBe('Lugar 1 4');
    expect(nextDuplicateSeatLabel([], 'table', 'L'.repeat(120))).toHaveLength(120);
  });
});
