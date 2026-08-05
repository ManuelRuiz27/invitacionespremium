import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import type { ScannerSessionResponse } from '@invitaciones/api-client';
import { scannerKeys } from './useScannerQueries';
import { readScannerEnv } from '../env';

export function useScannerRealtime(
  staffToken: string,
  sessionData: ScannerSessionResponse | undefined,
  onTerminal: () => void
) {
  const queryClient = useQueryClient();
  const terminalRef = useRef(onTerminal);
  terminalRef.current = onTerminal;

  useEffect(() => {
    if (!staffToken || !sessionData || !['ACTIVE', 'EVENT_DAY'].includes(sessionData.event.status)) return;
    const socket = io(readScannerEnv().wsBaseUrl, {
      auth: { protocolVersion: 1, actorMode: 'STAFF_TOKEN', roomType: 'scanner', staffToken },
      path: '/socket.io',
      transports: ['websocket']
    });
    const recover = () => {
      void queryClient.invalidateQueries({ queryKey: scannerKeys.session(staffToken) });
      if (sessionData.event.floorplanEnabled) {
        void queryClient.invalidateQueries({ queryKey: scannerKeys.floorplan(staffToken) });
      }
    };
    const terminate = () => {
      terminalRef.current();
      recover();
      socket.disconnect();
    };
    socket.on('connect', recover);
    socket.on('event.closed', terminate);
    socket.on('event.cancelled', terminate);
    socket.on('seating.updated', () => {
      void queryClient.invalidateQueries({ queryKey: scannerKeys.floorplan(staffToken) });
    });
    return () => {
      socket.disconnect();
    };
  }, [staffToken, sessionData, queryClient]);
}
