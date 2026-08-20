import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { readClientEnv } from '../app/env';

interface WorkspaceRealtimeCallbacks {
  onSeatingUpdated: (affectedTables: Array<{ tableId: string; occupancy: number }>) => void;
  onTerminal: () => void;
}

interface RealtimeEnvelope {
  version: number;
  eventId: string;
  operationId: string;
  data?: unknown;
}

export function useWorkspaceRealtime(eventId: string, enabled: boolean, callbacks: WorkspaceRealtimeCallbacks) {
  const queryClient = useQueryClient();
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!enabled || import.meta.env.MODE === 'test') return;

    const serverUrl = new URL(readClientEnv().apiBaseUrl).origin;
    const socket = io(`${serverUrl}/realtime`, {
      auth: { protocolVersion: 1, actorMode: 'USER', roomType: 'floorplan', eventId, administrative: false },
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true
    });
    return wireWorkspaceRealtime(socket, eventId, queryClient, () => callbacksRef.current);
  }, [enabled, eventId, queryClient]);
}

export function wireWorkspaceRealtime(
  socket: ReturnType<typeof io>,
  eventId: string,
  queryClient: QueryClient,
  getCallbacks: () => WorkspaceRealtimeCallbacks
) {
  const remember = createOperationDeduper();
  let terminalHandled = false;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['workspace-floorplan', eventId] });
    void queryClient.invalidateQueries({ queryKey: ['workspace-seating', eventId] });
  };
  const onSeating = (value: unknown) => {
    const envelope = parseWorkspaceEnvelope(value, eventId);
    if (!envelope || !remember(envelope.operationId)) return;
    const affectedTables = parseAffectedTables(envelope.data);
    if (!affectedTables) return;
    getCallbacks().onSeatingUpdated(affectedTables);
    refresh();
  };
  const onTerminal = (value: unknown) => {
    const envelope = parseWorkspaceEnvelope(value, eventId);
    if (!envelope || terminalHandled || !remember(envelope.operationId)) return;
    terminalHandled = true;
    getCallbacks().onTerminal();
    void queryClient.cancelQueries({ queryKey: ['workspace-seating', eventId] });
    void queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    refresh();
    socket.disconnect();
  };
  const recover = () => refresh();
  socket.on('connect', recover);
  socket.io.on('reconnect', recover);
  socket.on('seating.updated', onSeating);
  socket.on('event.closed', onTerminal);
  socket.on('event.cancelled', onTerminal);
  return () => {
    socket.off('connect', recover);
    socket.io.off('reconnect', recover);
    socket.off('seating.updated', onSeating);
    socket.off('event.closed', onTerminal);
    socket.off('event.cancelled', onTerminal);
    socket.disconnect();
  };
}

export function parseWorkspaceEnvelope(value: unknown, eventId: string): RealtimeEnvelope | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.eventId !== eventId || typeof candidate.operationId !== 'string') {
    return undefined;
  }
  return {
    version: candidate.version,
    eventId: candidate.eventId,
    operationId: candidate.operationId,
    data: candidate.data
  };
}

export function parseAffectedTables(value: unknown): Array<{ tableId: string; occupancy: number }> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const affectedTables = (value as Record<string, unknown>).affectedTables;
  if (!Array.isArray(affectedTables)) return undefined;
  const parsed: Array<{ tableId: string; occupancy: number }> = [];
  for (const table of affectedTables) {
    if (!table || typeof table !== 'object') return undefined;
    const candidate = table as Record<string, unknown>;
    if (typeof candidate.tableId !== 'string' || typeof candidate.occupancy !== 'number') return undefined;
    parsed.push({ tableId: candidate.tableId, occupancy: candidate.occupancy });
  }
  return parsed;
}

export function createOperationDeduper(limit = 100) {
  const seenOperations = new Set<string>();
  return (operationId: string) => {
    if (seenOperations.has(operationId)) return false;
    seenOperations.add(operationId);
    if (seenOperations.size > limit) seenOperations.delete(seenOperations.values().next().value!);
    return true;
  };
}
