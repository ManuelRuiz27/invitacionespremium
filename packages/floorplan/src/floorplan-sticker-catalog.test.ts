import { describe, expect, it } from 'vitest';
import { normalizeFloorplanShape } from './floorplan-geometry';
import {
  createStickerDraft,
  createUniqueFloorplanName,
  floorplanStickerPresets,
  placeStickerDraft
} from './floorplan-sticker-catalog';
import type { FloorplanStickerPresetId } from './floorplan-sticker-catalog';

const expected: Record<
  FloorplanStickerPresetId,
  {
    kind: 'TABLE' | 'DECORATIVE_ZONE';
    geometry: 'CIRCLE' | 'RECTANGLE';
    capacity: number;
    width: number;
    height: number;
  }
> = {
  'round-table': { kind: 'TABLE', geometry: 'CIRCLE', capacity: 10, width: 0.12, height: 0.12 },
  'rectangular-table': { kind: 'TABLE', geometry: 'RECTANGLE', capacity: 8, width: 0.16, height: 0.1 },
  'imperial-table': { kind: 'TABLE', geometry: 'RECTANGLE', capacity: 12, width: 0.24, height: 0.08 },
  'main-table': { kind: 'TABLE', geometry: 'RECTANGLE', capacity: 10, width: 0.24, height: 0.1 },
  'dance-floor': { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.3, height: 0.2 },
  bar: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.22, height: 0.07 },
  'stage-dj': { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.26, height: 0.1 },
  entrance: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.12, height: 0.06 },
  restrooms: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.16, height: 0.08 },
  zone: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.2, height: 0.14 },
  'text-label': { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.18, height: 0.05 }
};

describe('floorplan Sticker catalog', () => {
  it.each(floorplanStickerPresets)('maps $label to a normalized FloorplanShapeInput only', ({ id }) => {
    const draft = createStickerDraft(id);
    expect(draft).toEqual(expect.objectContaining(expected[id]));
    expect(normalizeFloorplanShape(draft)).toEqual(draft);
    expect(draft.x).toBeGreaterThanOrEqual(0);
    expect(draft.y).toBeGreaterThanOrEqual(0);
    expect(draft.x + draft.width).toBeLessThanOrEqual(1);
    expect(draft.y + draft.height).toBeLessThanOrEqual(1);
    expect(JSON.parse(JSON.stringify(draft))).not.toEqual(
      expect.objectContaining({
        stickerId: expect.anything(),
        presetId: expect.anything(),
        subtype: expect.anything(),
        category: expect.anything(),
        styleKey: expect.anything(),
        metadata: expect.anything()
      })
    );
    expect(Object.keys(draft).sort()).toEqual(
      ['capacity', 'geometry', 'height', 'kind', 'name', 'polygonPoints', 'rotation', 'width', 'x', 'y'].sort()
    );
  });

  it('uses natural unique names without encoding preset semantics', () => {
    const context = { existingNames: ['Mesa 1', 'Mesa 3', 'Mesa principal', 'Pista'] };
    expect(createStickerDraft('round-table', context).name).toBe('Mesa 2');
    expect(createStickerDraft('main-table', context).name).toBe('Mesa principal 2');
    expect(createStickerDraft('dance-floor', context).name).toBe('Pista 2');
    expect(createUniqueFloorplanName('Zona', [' zona ', 'Zona 2'])).toBe('Zona 3');
  });

  it('centers a draft around the canvas point and clamps it through the shared normalizer', () => {
    const pista = createStickerDraft('dance-floor');
    const centered = placeStickerDraft(pista, { x: 0.5, y: 0.4 });
    expect(centered.x).toBeCloseTo(0.35);
    expect(centered.y).toBeCloseTo(0.3);
    const edge = placeStickerDraft(pista, { x: 0, y: 0 });
    expect(edge.x).toBe(0);
    expect(edge.y).toBe(0);
  });
});
