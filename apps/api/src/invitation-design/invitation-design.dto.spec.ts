import { describe, expect, it } from 'vitest';
import { HotspotAction, HotspotVisualOwnerType } from '../generated/prisma/client';
import {
  normalizeExternalHotspotUrl,
  parseCreateHotspot,
  parseReorderPages,
  parseUpdateHotspot
} from './invitation-design.dto';

const flyerOwner = { visualOwnerType: HotspotVisualOwnerType.FLYER };
const coordinates = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

describe('Invitation design DTO validation', () => {
  it.each([HotspotAction.RSVP, HotspotAction.LOCATION, HotspotAction.GIFT_REGISTRY, HotspotAction.QR_AREA])(
    'accepts the non-link action %s without URL',
    (action) => {
      expect(parseCreateHotspot({ ...flyerOwner, ...coordinates, action })).toMatchObject({ action });
    }
  );

  it('accepts a normalized HTTPS external link and rejects credentials, query, fragment and protocols', () => {
    expect(normalizeExternalHotspotUrl('https://example.com/gifts')).toBe('https://example.com/gifts');
    expect(
      parseCreateHotspot({
        ...flyerOwner,
        ...coordinates,
        action: HotspotAction.EXTERNAL_LINK,
        url: 'https://example.com/gifts'
      }).url
    ).toBe('https://example.com/gifts');

    for (const url of [
      'http://example.com',
      'javascript:alert(1)',
      'https://user:secret@example.com',
      'https://example.com/?token=secret',
      'https://example.com/#guest'
    ]) {
      expect(() =>
        parseCreateHotspot({
          ...flyerOwner,
          ...coordinates,
          action: HotspotAction.EXTERNAL_LINK,
          url
        })
      ).toThrow();
    }
  });

  it('rejects URL payloads for actions that do not use them', () => {
    expect(() =>
      parseCreateHotspot({
        ...flyerOwner,
        ...coordinates,
        action: HotspotAction.RSVP,
        url: 'https://example.com'
      })
    ).toThrow();
  });

  it.each([
    { x: -0.1, y: 0, width: 0.1, height: 0.1 },
    { x: 0, y: 0, width: 0, height: 0.1 },
    { x: 0.8, y: 0, width: 0.3, height: 0.1 },
    { x: 0, y: 0.8, width: 0.1, height: 0.3 },
    { x: Number.NaN, y: 0, width: 0.1, height: 0.1 },
    { x: 0, y: Number.POSITIVE_INFINITY, width: 0.1, height: 0.1 }
  ])('rejects invalid relative coordinates %#', (invalid) => {
    expect(() => parseCreateHotspot({ ...flyerOwner, ...invalid, action: HotspotAction.LOCATION })).toThrow();
  });

  it('requires a page owner only for Flipbook hotspots', () => {
    expect(() =>
      parseCreateHotspot({
        ...coordinates,
        action: HotspotAction.RSVP,
        visualOwnerType: HotspotVisualOwnerType.FLIPBOOK_PAGE
      })
    ).toThrow();
    expect(() =>
      parseCreateHotspot({
        ...coordinates,
        action: HotspotAction.RSVP,
        visualOwnerType: HotspotVisualOwnerType.FLYER,
        flipbookPageId: crypto.randomUUID()
      })
    ).toThrow();
  });

  it('requires unique pages in a deterministic reorder and validates partial coordinate pairs', () => {
    const id = crypto.randomUUID();
    expect(() => parseReorderPages({ pageIds: [id, id] })).toThrow();
    expect(() => parseUpdateHotspot({ x: 0.9, width: 0.2 })).toThrow();
    expect(parseUpdateHotspot({ priority: 2 })).toEqual({ priority: 2 });
  });
});
