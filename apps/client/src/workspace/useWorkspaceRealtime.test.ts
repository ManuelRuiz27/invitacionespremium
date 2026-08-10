import { describe, expect, it } from 'vitest';
import { createOperationDeduper, parseAffectedTables, parseWorkspaceEnvelope } from './useWorkspaceRealtime';

describe('workspace realtime validation', () => {
  it('accepts only v1 envelopes for the selected Event', () => {
    const envelope = { version: 1, eventId: 'event-1', operationId: 'operation-1', data: {} };
    expect(parseWorkspaceEnvelope(envelope, 'event-1')).toEqual(envelope);
    expect(parseWorkspaceEnvelope({ ...envelope, version: 2 }, 'event-1')).toBeUndefined();
    expect(parseWorkspaceEnvelope(envelope, 'event-2')).toBeUndefined();
  });

  it('validates affected table snapshots and deduplicates bounded operation history', () => {
    expect(parseAffectedTables({ affectedTables: [{ tableId: 'table-1', occupancy: 8, capacity: 10 }] })).toEqual([
      { tableId: 'table-1', occupancy: 8 }
    ]);
    expect(parseAffectedTables({ affectedTables: [{ tableId: 'table-1', occupancy: '8' }] })).toBeUndefined();
    const remember = createOperationDeduper(2);
    expect(remember('first')).toBe(true);
    expect(remember('first')).toBe(false);
    expect(remember('second')).toBe(true);
    expect(remember('third')).toBe(true);
    expect(remember('first')).toBe(true);
  });
});
