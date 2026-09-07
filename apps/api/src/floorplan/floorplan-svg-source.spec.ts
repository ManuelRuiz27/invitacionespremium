import { describe, expect, it } from 'vitest';
import { FloorplanSvgValidator } from '../file-assets/floorplan-svg-validator';
import type { AppConfigService } from '../config/app-config.service';
import { deriveFloorplanSvgSource } from './floorplan-svg-source';

const validator = new FloorplanSvgValidator({ floorplanSvgMaxBytes: 1024 * 1024, floorplanSvgMaxNodes: 200, floorplanSvgMaxDepth: 20 } as AppConfigService);

describe('deriveFloorplanSvgSource', () => {
  it('derives stable normalized selectable geometry for a real SVG vocabulary', () => {
    const bytes = validator.validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 200 100"><g transform="translate(10 0)"><rect width="20" height="10"/><circle cx="40" cy="10" r="5"/><ellipse cx="60" cy="10" rx="4" ry="2"/><path d="M80 0 C90 30 100 -10 110 10"/><polyline points="120,0 130,10"/><polygon points="140,0 150,10 145,20"/></g></svg>')).bytes;
    const first = deriveFloorplanSvgSource('asset', bytes);
    const second = deriveFloorplanSvgSource('asset', bytes);
    expect(first).toEqual(second);
    expect(first.viewBox).toEqual({ minX: 10, minY: 20, width: 200, height: 100 });
    expect(first.aspectRatio).toBe(2);
    expect(first.selectableElements).toHaveLength(7);
    expect(first.selectableElements.every(({ bbox }) => [bbox.x, bbox.y, bbox.width, bbox.height].every((value) => value >= 0 && value <= 1))).toBe(true);
  });

  it('uses nested transforms and rejects a zero-size viewBox deterministically', () => {
    const bytes = validator.validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(10,20)"><g transform="scale(2)"><rect width="10" height="10"/></g></g></svg>')).bytes;
    const source = deriveFloorplanSvgSource('asset', bytes);
    expect(source.selectableElements.at(-1)?.bbox).toMatchObject({ x: 0.1, y: 0.2, height: 0.2 });
    expect(source.selectableElements.at(-1)?.bbox.width).toBeCloseTo(0.2);
    expect(() => deriveFloorplanSvgSource('asset', Buffer.from('<svg viewBox="0 0 0 1"/>'))).toThrow('non-zero viewBox');
  });

  it('keeps more than fifty independently selectable canonical elements', () => {
    const rects = Array.from({ length: 55 }, (_, index) => `<rect x="${index}" width="1" height="1"/>`).join('');
    const bytes = validator.validate(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 10">${rects}</svg>`)).bytes;
    const source = deriveFloorplanSvgSource('asset', bytes);
    expect(source.selectableElements).toHaveLength(55);
    expect(new Set(source.selectableElements.map(({ sourceElementId }) => sourceElementId)).size).toBe(55);
  });
});
