export function localDateTimeToInstant(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('La fecha y hora no son validas.');
  return date.toISOString();
}
