import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { scannerKeys } from './useScannerQueries';
import { readScannerEnv } from '../env';
import type { ScannerSessionResponse } from '@invitaciones/api-client';

export function useScannerRealtime(staffToken: string, sessionData?: ScannerSessionResponse) {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!staffToken || !sessionData) return;

    const env = readScannerEnv();
    const socket = io(env.wsBaseUrl, {
      auth: { token: staffToken },
      path: '/socket.io',
      transports: ['websocket']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Scanner Socket connected');
    });

    socket.on('event.closed', () => {
      queryClient.invalidateQueries({ queryKey: scannerKeys.session(staffToken) });
    });

    socket.on('event.cancelled', () => {
      queryClient.invalidateQueries({ queryKey: scannerKeys.session(staffToken) });
    });

    socket.on('checkin.created', () => {
      // Opcional: Invalidate data if we were showing lists
      // For now, it's a push of checkins to update stats if we had stats.
    });

    socket.on('seating.updated', () => {
      queryClient.invalidateQueries({ queryKey: scannerKeys.floorplan(staffToken) });
    });

    return () => {
      socket.disconnect();
    };
  }, [staffToken, sessionData, queryClient]);

  return socketRef.current;
}
