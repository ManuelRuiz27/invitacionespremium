import type { AdminFloorplanSeat } from '@invitaciones/api-client';

// Propose a free human label from the authoritative active seats. UUID remains the identity;
// the API continues to enforce uniqueness, including concurrent changes.
export function nextTraceSeatLabel(seats: readonly AdminFloorplanSeat[], parentId: string) {
  const labels = new Set(
    seats
      .filter((seat) => seat.floorplanShapeId === parentId)
      .map((seat) => seat.label.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-MX'))
  );
  let next = 1;
  while (labels.has(`lugar ${next}`)) next++;
  return `Lugar ${next}`;
}
