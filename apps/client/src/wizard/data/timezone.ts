const fields = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  return match.slice(1).map(Number) as [number, number, number, number, number];
};

function partsAt(timestamp: number, timeZone: string): string {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
    .formatToParts(timestamp)
    .reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function wallClockToInstant(value: string, timeZone: string): string {
  const parsed = fields(value);
  if (!parsed) throw new Error('Captura una fecha y hora válidas.');
  const [year, month, day, hour, minute] = parsed;
  const base = Date.UTC(year, month - 1, day, hour, minute);
  const matches: number[] = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = base + offsetMinutes * 60_000;
    if (partsAt(candidate, timeZone) === value) matches.push(candidate);
  }
  const unique = [...new Set(matches)];
  if (unique.length === 0) throw new Error('La hora no existe en esa zona por un cambio de horario.');
  if (unique.length > 1) throw new Error('La hora es ambigua por un cambio de horario; elige otra hora.');
  return new Date(unique[0]!).toISOString();
}

export function instantToWallClock(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  return partsAt(new Date(value).getTime(), timeZone);
}

export function supportedTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['America/Mexico_City', 'America/Cancun', 'America/Tijuana', 'UTC'];
  }
}
