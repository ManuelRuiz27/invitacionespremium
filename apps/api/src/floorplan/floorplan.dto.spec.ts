import { describe, expect, it } from 'vitest';
import { FloorplanGeometry, FloorplanShapeKind } from '../generated/prisma/client';
import { normalizeFloorplanName, parseAssignSeating, parseCreateShape, parseUpdateShape } from './floorplan.dto';
import { requestSignature } from './floorplan.service';
import { SeatingAction } from '../generated/prisma/client';

const base = {
  kind: FloorplanShapeKind.TABLE,
  geometry: FloorplanGeometry.RECTANGLE,
  name: ' Mesa   principal ',
  capacity: 8,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.15,
  rotation: 0,
  polygonPoints: null
};

describe('Floorplan DTOs', () => {
  it('normalizes names and accepts a valid relative table', () => {
    expect(parseCreateShape(base)).toMatchObject({ name: 'Mesa principal', capacity: 8 });
    expect(normalizeFloorplanName('  Zona   norte ')).toBe('Zona norte');
  });

  it.each([
    [{ ...base, capacity: 0 }],
    [{ ...base, kind: FloorplanShapeKind.DECORATIVE_ZONE, capacity: 1 }],
    [{ ...base, x: 0.9, width: 0.2 }],
    [{ ...base, geometry: FloorplanGeometry.SQUARE, width: 0.2, height: 0.1 }],
    [{ ...base, polygonPoints: [{ x: 0, y: 0 }] }],
    [{ ...base, geometry: FloorplanGeometry.POLYGON, polygonPoints: null }],
    [
      {
        ...base,
        geometry: FloorplanGeometry.POLYGON,
        polygonPoints: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 1 }
        ]
      }
    ]
  ])('rejects invalid capacity, geometry, coordinates or polygon %#', (input) => {
    expect(() => parseCreateShape(input)).toThrow();
  });

  it('keeps patch DTOs strict and assignment IDs unique', () => {
    expect(() => parseUpdateShape({ capacity: 10, unexpected: true })).toThrow();
    const id = '11111111-1111-4111-8111-111111111111';
    expect(() => parseAssignSeating({ assistantIds: [id, id], tableShapeId: id })).toThrow();
  });

  it('creates deterministic payload-sensitive signatures without PII snapshots', () => {
    const eventId = '11111111-1111-4111-8111-111111111111';
    const first = requestSignature(eventId, SeatingAction.ASSIGN, {
      assistantIds: ['22222222-2222-4222-8222-222222222222'],
      tableShapeId: '33333333-3333-4333-8333-333333333333'
    });
    const repeated = requestSignature(eventId, SeatingAction.ASSIGN, {
      assistantIds: ['22222222-2222-4222-8222-222222222222'],
      tableShapeId: '33333333-3333-4333-8333-333333333333'
    });
    expect(first).toBe(repeated);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).not.toContain('Mesa');
  });
});
