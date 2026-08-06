import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import type { ScannerSessionResponse } from '@invitaciones/api-client';
import { scannerKeys } from './useScannerQueries';
import type { ScannerRealtimeConfig } from '../env';

export type ScannerRealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ScannerRealtimeCallbacks {
  onTerminal: () => void;
  onInvitationStale: () => void;
  onSeatingStale: () => void;
}

export function useScannerRealtime(
  staffToken: string,
  sessionData: ScannerSessionResponse | undefined,
  config: ScannerRealtimeConfig,
  callbacks: ScannerRealtimeCallbacks
) {
  const queryClient = useQueryClient();
  const callbacksRef = useRef(callbacks);
  const [status, setStatus] = useState<ScannerRealtimeStatus>('idle');
  callbacksRef.current = callbacks;
  const eventStatus = sessionData?.event.status;
  const floorplanEnabled = sessionData?.event.floorplanEnabled ?? false;

  useEffect(() => {
    if (!staffToken || !eventStatus || !['ACTIVE', 'EVENT_DAY'].includes(eventStatus)) {
      setStatus('idle');
      return;
    }
    let terminal = false;
    setStatus('connecting');
    const namespaceUrl = `${config.serverUrl.replace(/\/$/u, '')}${config.namespace}`;
    const socket = io(namespaceUrl, {
      auth: { protocolVersion: 1, actorMode: 'STAFF_TOKEN', roomType: 'scanner', staffToken },
      path: config.path,
      transports: ['websocket']
    });
    const recover = () => {
      void queryClient.invalidateQueries({ queryKey: scannerKeys.session(staffToken) });
      if (floorplanEnabled) {
        void queryClient.invalidateQueries({ queryKey: scannerKeys.floorplan(staffToken) });
      }
    };
    const terminate = () => {
      terminal = true;
      callbacksRef.current.onTerminal();
      recover();
      socket.disconnect();
    };
    const connected = () => {
      setStatus('connected');
      recover();
    };
    const connectionError = () => setStatus('error');
    const disconnected = () => {
      if (!terminal) setStatus('disconnected');
    };
    const reconnected = () => {
      setStatus('connected');
      recover();
    };
    const invitationStale = () => {
      callbacksRef.current.onInvitationStale();
      void queryClient.invalidateQueries({ queryKey: scannerKeys.session(staffToken) });
    };
    const seatingStale = () => {
      callbacksRef.current.onSeatingStale();
      void queryClient.invalidateQueries({ queryKey: scannerKeys.floorplan(staffToken) });
    };
    socket.on('connect', connected);
    socket.on('connect_error', connectionError);
    socket.on('disconnect', disconnected);
    socket.on('event.closed', terminate);
    socket.on('event.cancelled', terminate);
    socket.on('checkin.created', invitationStale);
    socket.on('seating.updated', seatingStale);
    socket.io.on('reconnect', reconnected);
    return () => {
      socket.io.off('reconnect', reconnected);
      socket.disconnect();
    };
  }, [config.namespace, config.path, config.serverUrl, eventStatus, floorplanEnabled, queryClient, staffToken]);

  return status;
}
