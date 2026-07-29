export const REALTIME_ERROR_CODES = [
  'SOCKET_UNAUTHORIZED',
  'SOCKET_ROOM_FORBIDDEN',
  'SOCKET_EVENT_FORBIDDEN',
  'SOCKET_STAFF_TOKEN_EXPIRED',
  'SOCKET_EVENT_NOT_OPERATIONAL',
  'SOCKET_EVENT_CLOSED',
  'SOCKET_EVENT_CANCELLED',
  'SOCKET_PAYLOAD_VERSION_UNSUPPORTED'
] as const;

export type RealtimeErrorCode = (typeof REALTIME_ERROR_CODES)[number];

export class RealtimeConnectionError extends Error {
  constructor(readonly code: RealtimeErrorCode) {
    super(code);
    this.name = 'RealtimeConnectionError';
  }
}

export function socketConnectionError(code: RealtimeErrorCode): Error & {
  data: { code: RealtimeErrorCode };
} {
  return Object.assign(new Error('Socket connection rejected.'), {
    data: { code }
  });
}
