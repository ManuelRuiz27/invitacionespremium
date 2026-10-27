export const MANAGED_CONTRACT_TIME_ZONE = 'America/Mexico_City';

const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANAGED_CONTRACT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function contractLocalDate(instant: Date): string {
  const parts = localDateFormatter.formatToParts(instant);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}

export function contractDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Compute every boundary from the original anchor, rather than repeatedly adding
// to February's clamped result (which would drift for starts on the 29th–31st).
export function addContractMonths(anchor: string, months: number): string {
  const [year, month, day] = anchor.split('-').map(Number) as [number, number, number];
  const first = new Date(0);
  first.setUTCFullYear(year, month - 1 + months, 1);
  first.setUTCHours(0, 0, 0, 0);
  const nextMonth = new Date(first);
  nextMonth.setUTCMonth(first.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  first.setUTCDate(Math.min(day, nextMonth.getUTCDate()));
  return first.toISOString().slice(0, 10);
}
