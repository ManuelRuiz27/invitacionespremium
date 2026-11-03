import { describe, expect, it } from 'vitest';
import { parseCountdownRevision, parseSaveCountdown } from './countdown.dto';

const input = {
  visualOwnerType: 'FLYER',
  flipbookPageId: null,
  x: 0.1,
  y: 0.2,
  width: 0.8,
  height: 0.2,
  numberFont: 'montserrat',
  labelFont: 'playfair',
  numberWeight: 600,
  labelWeight: 400,
  layout: 'row',
  numberColor: '#abc',
  labelColor: '#57594f',
  backgroundColor: '#ffffff',
  borderColor: '#B8A58A',
  shadowColor: '#171717',
  backgroundOpacity: 0.85,
  frame: 'thin',
  shadow: 'soft',
  revision: 0
};

describe('Countdown input', () => {
  it('quantizes geometry to DECIMAL(9,8) without rounding beyond the image', () => {
    expect(
      parseSaveCountdown({ ...input, x: 0.499999995, width: 0.500000005, y: 0.499999995, height: 0.500000005 })
    ).toMatchObject({ x: 0.5, width: 0.5, y: 0.5, height: 0.5 });
    expect(() => parseSaveCountdown({ ...input, width: 0.0000000001 })).toThrow();
    expect(() => parseSaveCountdown({ ...input, x: 0.50000001, width: 0.5 })).toThrow();
  });
  it('normalizes short/lowercase HEX independently and accepts transparent backgrounds', () => {
    expect(parseSaveCountdown({ ...input, backgroundOpacity: 0 })).toMatchObject({
      numberColor: '#AABBCC',
      labelColor: '#57594F',
      backgroundColor: '#FFFFFF',
      backgroundOpacity: 0
    });
  });
  it.each([
    { x: -0.1 },
    { width: 0 },
    { x: 0.9 },
    { height: Number.NaN },
    { backgroundOpacity: 1.01 },
    { backgroundOpacity: Number.POSITIVE_INFINITY },
    { numberColor: 'red' },
    { labelColor: '#FF000080' },
    { shadowColor: 'url(https://example.com)' },
    { numberFont: 'custom' },
    { numberWeight: 900 },
    { frame: 'arbitrary' },
    { layout: 'unknown' },
    { revision: -1 },
    { revision: 1.5 },
    { flipbookPageId: '649af3af-10a3-4490-8698-ce72b63974c9' },
    { visualOwnerType: 'FLIPBOOK_PAGE' },
    { eventDateTime: '2030-01-01T00:00:00Z' },
    { clientId: 'spoof' }
  ])('rejects invalid configuration %j', (patch) => {
    expect(() => parseSaveCountdown({ ...input, ...patch })).toThrow();
  });
  it('requires an explicit positive revision for deletion', () => {
    expect(parseCountdownRevision('12')).toBe(12);
    for (const value of [undefined, '0', '-1', '1.5', '1e3', ['1'], '2147483647']) {
      expect(() => parseCountdownRevision(value)).toThrow();
    }
  });
});
