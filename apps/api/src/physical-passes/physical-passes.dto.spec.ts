import { describe, expect, it } from 'vitest';
import {
  parseGeneratePhysicalPasses,
  parseGenerationSnapshot,
  parseScanPhysicalPass,
  parseUseSnapshot
} from './physical-passes.dto';

describe('physical pass DTOs', () => {
  it('accepts strict generation and scan payloads', () => {
    expect(parseGeneratePhysicalPasses({ quantity: 2, tableShapeId: null })).toEqual({
      quantity: 2,
      tableShapeId: null
    });
    expect(parseScanPhysicalPass({ qrToken: 'opaque' })).toEqual({ qrToken: 'opaque' });
  });

  it('rejects partial, non-positive, non-integer and unknown generation data', () => {
    for (const payload of [{}, { quantity: 0 }, { quantity: 1.5 }, { quantity: 1, passNumber: 4 }]) {
      expect(() => parseGeneratePhysicalPasses(payload)).toThrow();
    }
  });

  it('accepts complete persisted snapshots and rejects partial or extended snapshots', () => {
    const table = { id: '00000000-0000-4000-8000-000000000001', name: 'Mesa 1' };
    const pass = {
      id: '00000000-0000-4000-8000-000000000002',
      eventId: '00000000-0000-4000-8000-000000000003',
      passNumber: 1,
      status: 'UNUSED',
      table,
      usedAt: null,
      createdAt: '2026-07-29T12:00:00.000Z'
    };
    const generation = {
      generationOperationId: '00000000-0000-4000-8000-000000000004',
      eventId: pass.eventId,
      quantity: 1,
      firstPassNumber: 1,
      lastPassNumber: 1,
      table,
      passes: [pass]
    };
    const use = {
      status: 'USED',
      physicalPassId: pass.id,
      passNumber: 1,
      usedAt: '2026-07-29T13:00:00.000Z',
      table
    };
    expect(parseGenerationSnapshot(generation)).toEqual(generation);
    expect(parseUseSnapshot(use)).toEqual(use);
    expect(() => parseGenerationSnapshot({ ...generation, qrTokenNonce: 'secret' })).toThrow(
      'Invalid persisted physical pass snapshot.'
    );
    expect(() => parseUseSnapshot({ ...use, usedAt: null })).toThrow('Invalid persisted physical pass snapshot.');
  });
});
