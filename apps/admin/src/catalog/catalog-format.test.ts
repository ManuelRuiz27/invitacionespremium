import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toIso, toLocalInput } from './catalog-format';

const testProcess = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process;
const originalTimeZone = testProcess.env.TZ;

describe.sequential('conversion de fechas del catalogo', () => {
  beforeAll(() => {
    testProcess.env.TZ = 'America/Mexico_City';
  });

  afterAll(() => {
    if (originalTimeZone === undefined) delete testProcess.env.TZ;
    else testProcess.env.TZ = originalTimeZone;
  });

  it.each([
    ['2026-08-03T18:00:00.000Z', '2026-08-03T12:00:00'],
    ['2026-08-03T18:00:37.000Z', '2026-08-03T12:00:37'],
    ['2026-08-04T04:30:15.000Z', '2026-08-03T22:30:15'],
    ['2021-01-15T18:00:00.000Z', '2021-01-15T12:00:00'],
    ['2021-07-15T18:00:00.000Z', '2021-07-15T13:00:00']
  ])('conserva el instante %s mediante el valor local %s', (iso, local) => {
    expect(toLocalInput(iso)).toBe(local);
    expect(toIso(local)).toBe(iso);
  });

  it('conserva null y convierte una nueva hora local a UTC', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toIso('2026-12-24T19:05:09')).toBe('2026-12-25T01:05:09.000Z');
  });
});
