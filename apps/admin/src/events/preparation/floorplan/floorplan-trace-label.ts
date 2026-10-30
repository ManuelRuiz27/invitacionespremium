import type { AdminFloorplanSeat } from '@invitaciones/api-client';

// Propose a free human label from the authoritative active seats. UUID remains the identity;
// the API continues to enforce uniqueness, including concurrent changes.
const normalized = (label: string) => label.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-MX');
function tableLabels(seats: readonly AdminFloorplanSeat[], parentId: string) {
  return new Set(seats.filter((seat) => seat.floorplanShapeId === parentId).map((seat) => normalized(seat.label)));
}
export function nextTraceSeatLabel(seats: readonly AdminFloorplanSeat[], parentId: string) {
  const labels = tableLabels(seats, parentId);
  let next = 1;
  while (labels.has(`lugar ${next}`)) next++;
  return `Lugar ${next}`;
}

export function nextDuplicateSeatLabel(seats: readonly AdminFloorplanSeat[], parentId: string, label: string) {
  const labels = tableLabels(seats, parentId);
  let sequence = 2;
  // Keep the proposal within the existing API's 120-character label limit.
  const candidate = () => {
    const suffix = ` ${sequence}`;
    return `${label
      .trim()
      .slice(0, 120 - suffix.length)
      .trimEnd()}${suffix}`;
  };
  while (labels.has(normalized(candidate()))) sequence++;
  return candidate();
}
