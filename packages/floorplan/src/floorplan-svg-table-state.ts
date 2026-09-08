import type { Floorplan, FloorplanShape } from '@invitaciones/api-client';

export type SvgTableOccupancyState = 'EMPTY' | 'PARTIAL' | 'FULL';

export interface SvgTableVisualState {
  capacity: number;
  occupancy: number;
  occupancyState: SvgTableOccupancyState;
  label: string;
  accessibleLabel: string;
  borderStyle: 'solid' | 'dashed' | 'double';
}

type FloorplanWithOptionalSeating = Omit<Floorplan, 'seatingMode' | 'seats'> &
  Pick<Partial<Floorplan>, 'seatingMode' | 'seats'>;

export function resolveSvgTableVisualState(
  floorplan: FloorplanWithOptionalSeating,
  shape: FloorplanShape,
  options: { selected: boolean; readOnly: boolean }
): SvgTableVisualState | undefined {
  if (shape.kind !== 'TABLE' || !shape.sourceElementId) return undefined;
  const capacity = floorplan.seatingMode === 'SEAT'
    ? (floorplan.seats ?? []).filter((seat) => seat.floorplanShapeId === shape.id && !seat.isBlocked).length
    : shape.capacity;
  const occupancy = Math.max(0, Math.min(shape.occupancy, capacity));
  const occupancyState: SvgTableOccupancyState = occupancy === 0
    ? 'EMPTY'
    : capacity > 0 && occupancy >= capacity
      ? 'FULL'
      : 'PARTIAL';
  const label = capacity === 0
    ? 'Sin lugares activos'
    : occupancyState === 'EMPTY'
      ? `Vacía · 0 de ${capacity}`
      : occupancyState === 'FULL'
        ? `Completa · ${capacity} de ${capacity}`
        : `Parcial · ${occupancy} de ${capacity}`;
  const modifiers = [label, options.selected ? 'Seleccionada' : undefined, options.readOnly ? 'Solo lectura' : undefined]
    .filter((value): value is string => Boolean(value));
  return {
    capacity,
    occupancy,
    occupancyState,
    label: modifiers.join(' · '),
    accessibleLabel: `Mesa ${shape.name}, ${modifiers.join(', ')}`,
    borderStyle: options.selected ? 'double' : occupancyState === 'PARTIAL' ? 'dashed' : occupancyState === 'FULL' ? 'double' : 'solid'
  };
}
