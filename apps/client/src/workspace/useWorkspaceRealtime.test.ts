import { QueryClient } from '@tanstack/react-query';
import type { io } from 'socket.io-client';
import { describe, expect, it, vi } from 'vitest';
import {
  createOperationDeduper,
  parseAffectedTables,
  parseWorkspaceEnvelope,
  wireWorkspaceRealtime
} from './useWorkspaceRealtime';

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

  it('refreshes bounded authoritative state on connect/reconnect and applies one deduplicated Seating update', () => {
    const socket = realtimeSocket();
    const queryClient = queryClientHarness();
    const onSeatingUpdated = vi.fn();
    const cleanup = wireWorkspaceRealtime(socket.value, 'event-1', queryClient.value, () => ({
      onSeatingUpdated,
      onTerminal: vi.fn()
    }));

    socket.emit('connect');
    socket.emitManager('reconnect');
    const seating = {
      version: 1,
      eventId: 'event-1',
      operationId: 'seating-1',
      data: { affectedTables: [{ tableId: 'table-200', occupancy: 9 }] }
    };
    socket.emit('seating.updated', seating);
    socket.emit('seating.updated', seating);

    expect(queryClient.invalidate).toHaveBeenCalledTimes(6);
    expect(onSeatingUpdated).toHaveBeenCalledOnce();
    expect(onSeatingUpdated).toHaveBeenCalledWith([{ tableId: 'table-200', occupancy: 9 }]);
    cleanup();
    expect(socket.off).toHaveBeenCalledTimes(4);
    expect(socket.managerOff).toHaveBeenCalledOnce();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it.each(['event.closed', 'event.cancelled'] as const)(
    'handles %s once, cancels Seating, refreshes authority and disconnects',
    (eventName) => {
      const socket = realtimeSocket();
      const queryClient = queryClientHarness();
      const onTerminal = vi.fn();
      wireWorkspaceRealtime(socket.value, 'event-1', queryClient.value, () => ({
        onSeatingUpdated: vi.fn(),
        onTerminal
      }));
      const terminal = { version: 1, eventId: 'event-1', operationId: 'terminal-1' };
      socket.emit(eventName, terminal);
      socket.emit(eventName, { ...terminal, operationId: 'terminal-2' });

      expect(onTerminal).toHaveBeenCalledOnce();
      expect(queryClient.cancel).toHaveBeenCalledOnce();
      expect(queryClient.invalidate).toHaveBeenCalledTimes(3);
      expect(socket.disconnect).toHaveBeenCalledOnce();
    }
  );
});

function queryClientHarness() {
  const value = new QueryClient();
  const invalidate = vi.spyOn(value, 'invalidateQueries').mockResolvedValue(undefined);
  const cancel = vi.spyOn(value, 'cancelQueries').mockResolvedValue(undefined);
  return { value, invalidate, cancel };
}

function realtimeSocket() {
  const listeners = new Map<string, (value?: unknown) => void>();
  const managerListeners = new Map<string, () => void>();
  const off = vi.fn((event: string) => listeners.delete(event));
  const managerOff = vi.fn((event: string) => managerListeners.delete(event));
  const disconnect = vi.fn();
  const value = {
    on: (event: string, listener: (value?: unknown) => void) => {
      listeners.set(event, listener);
      return value;
    },
    off,
    disconnect,
    io: {
      on: (event: string, listener: () => void) => {
        managerListeners.set(event, listener);
        return value.io;
      },
      off: managerOff
    }
  } as unknown as ReturnType<typeof io>;
  return {
    value,
    off,
    managerOff,
    disconnect,
    emit: (event: string, payload?: unknown) => listeners.get(event)?.(payload),
    emitManager: (event: string) => managerListeners.get(event)?.()
  };
}
