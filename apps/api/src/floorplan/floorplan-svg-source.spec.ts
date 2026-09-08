import { describe, expect, it } from 'vitest';
import { FloorplanSvgValidator } from '../file-assets/floorplan-svg-validator';
import type { AppConfigService } from '../config/app-config.service';
import { deriveFloorplanSvgSource } from './floorplan-svg-source';

const validator = new FloorplanSvgValidator({
  floorplanSvgMaxBytes: 1024 * 1024,
  floorplanSvgMaxNodes: 5_000,
  floorplanSvgMaxDepth: 20
} as AppConfigService);

describe('deriveFloorplanSvgSource', () => {
  const transformedBox = (transform: string) =>
    deriveFloorplanSvgSource(
      'asset',
      Buffer.from(
        `<svg viewBox="0 0 100 100"><rect id="table" x="10" y="10" width="10" height="20" transform="${transform}"/></svg>`
      )
    ).selectableElements[0]!.bbox;

  it.each([
    ['matrix(1 0 0 1 10 20)', { x: 0.2, y: 0.3, width: 0.1, height: 0.2 }],
    ['translate(1e1, +20)', { x: 0.2, y: 0.3, width: 0.1, height: 0.2 }],
    ['scale(2 .5)', { x: 0.2, y: 0.05, width: 0.2, height: 0.1 }],
    ['rotate(90 20 20)', { x: 0.1, y: 0.1, width: 0.2, height: 0.1 }],
    ['skewX(45)', { x: 0.2, y: 0.1, width: 0.3, height: 0.2 }],
    ['skewY(45)', { x: 0.1, y: 0.2, width: 0.1, height: 0.3 }],
    ['translate(10) scale(2), skewX(45)', { x: 0.5, y: 0.2, width: 0.5, height: 0.4 }]
  ])('matches SVG transform semantics for %s', (transform, expected) => {
    const box = transformedBox(transform);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(box[key]).toBeCloseTo(expected[key]);
  });

  it.each([
    'skewZ(20)',
    'translate(10) bogus(20)',
    'junk translate(10)',
    'translate(10) junk',
    'translate()',
    'translate(1 2 3)',
    'scale()',
    'scale(1 2 3)',
    'rotate(10 20)',
    'rotate(1 2 3 4)',
    'matrix(1 0 0 1 0)',
    'skewX(1 2)',
    'skewY()',
    'translate(1,,2)',
    'translate(1,)',
    'translate(,1)',
    'translate(10px)',
    'translate(0x10)',
    'translate(NaN)',
    'translate(Infinity)',
    'translate(1e309)',
    'translate(1',
    'translate((1))',
    'translate(1),',
    'translate(1),,scale(2)',
    'scale(1e308) scale(1e308)'
  ])('fails closed for malformed or unsupported transform %s', (transform) => {
    expect(() => transformedBox(transform)).toThrow('Invalid canonical SVG source');
  });

  it('rejects malformed transforms on ancestors and finite inputs whose composition overflows', () => {
    for (const transform of ['unknown(2)', 'scale(1e308)']) {
      expect(() =>
        deriveFloorplanSvgSource(
          'asset',
          Buffer.from(
            `<svg viewBox="0 0 100 100"><g transform="${transform}"><rect id="table" width="1" height="1" transform="scale(1e308)"/></g></svg>`
          )
        )
      ).toThrow('Invalid canonical SVG source');
    }
  });

  it('rejects finite transforms that overflow the selected geometry instead of clamping an invalid proxy', () => {
    expect(() => transformedBox('scale(1e308)')).toThrow('Invalid SVG transformed geometry');
  });

  it('derives stable normalized selectable geometry for a real SVG vocabulary', () => {
    const bytes = validator.validate(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 200 100"><g transform="translate(10 0)"><rect width="20" height="10"/><circle cx="40" cy="10" r="5"/><ellipse cx="60" cy="10" rx="4" ry="2"/><path d="M80 0 C90 30 100 -10 110 10"/><polyline points="120,0 130,10"/><polygon points="140,0 150,10 145,20"/></g></svg>'
      )
    ).bytes;
    const first = deriveFloorplanSvgSource('asset', bytes);
    const second = deriveFloorplanSvgSource('asset', bytes);
    expect(first).toEqual(second);
    expect(first.viewBox).toEqual({ minX: 10, minY: 20, width: 200, height: 100 });
    expect(first.aspectRatio).toBe(2);
    expect(first.selectableElements).toHaveLength(7);
    expect(
      first.selectableElements.every(({ bbox }) =>
        [bbox.x, bbox.y, bbox.width, bbox.height].every((value) => value >= 0 && value <= 1)
      )
    ).toBe(true);
  });

  it('uses nested transforms and rejects a zero-size viewBox deterministically', () => {
    const bytes = validator.validate(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(10,20)"><g transform="scale(2)"><rect width="10" height="10"/></g></g></svg>'
      )
    ).bytes;
    const source = deriveFloorplanSvgSource('asset', bytes);
    expect(source.selectableElements.at(-1)?.bbox).toMatchObject({ x: 0.1, y: 0.2, height: 0.2 });
    expect(source.selectableElements.at(-1)?.bbox.width).toBeCloseTo(0.2);
    expect(() => deriveFloorplanSvgSource('asset', Buffer.from('<svg viewBox="0 0 0 1"/>'))).toThrow(
      'non-zero viewBox'
    );
  });

  it.each([50, 100, 200])('keeps %d independently selectable canonical elements with stable proxy boxes', (count) => {
    const rects = Array.from({ length: count }, (_, index) => `<rect x="${index}" width="1" height="1"/>`).join('');
    const bytes = validator.validate(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${count} 1">${rects}</svg>`)
    ).bytes;
    const source = deriveFloorplanSvgSource('asset', bytes);
    expect(source.selectableElements).toHaveLength(count);
    expect(new Set(source.selectableElements.map(({ sourceElementId }) => sourceElementId)).size).toBe(count);
    expect(source.selectableElements[0]?.bbox).toMatchObject({ x: 0, y: 0, height: 1 });
    expect(source.selectableElements[0]?.bbox.width).toBeCloseTo(1 / count);
    expect(source.selectableElements.at(-1)?.bbox).toMatchObject({ x: (count - 1) / count, y: 0, height: 1 });
    expect(source.selectableElements.at(-1)?.bbox.width).toBeCloseTo(1 / count);
  });
});
