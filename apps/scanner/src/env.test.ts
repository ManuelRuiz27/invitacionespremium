import { describe, expect, it } from 'vitest';
import { readScannerEnv } from './env';

describe('readScannerEnv', () => {
  it('requires exact HTTPS API and Socket.IO server URLs in production', () => {
    expect(
      readScannerEnv(
        {
          VITE_API_BASE_URL: 'https://api-staging.example.com/api/v1',
          VITE_SOCKET_URL: 'https://api-staging.example.com'
        },
        true
      )
    ).toEqual({
      apiBaseUrl: 'https://api-staging.example.com/api/v1',
      realtime: {
        serverUrl: 'https://api-staging.example.com',
        namespace: '/realtime',
        path: '/socket.io'
      }
    });
  });

  it.each([
    [{ VITE_SOCKET_URL: 'https://api-staging.example.com/realtime' }, 'VITE_SOCKET_URL'],
    [{ VITE_SOCKET_URL: 'http://api-staging.example.com' }, 'VITE_SOCKET_URL'],
    [{ VITE_API_BASE_URL: 'https://localhost/api/v1' }, 'VITE_API_BASE_URL'],
    [{ VITE_API_BASE_URL: 'https://api-staging.example.com' }, 'VITE_API_BASE_URL']
  ])('rejects unsafe production configuration %#', (override, expectedKey) => {
    expect(() =>
      readScannerEnv(
        {
          VITE_API_BASE_URL: 'https://api-staging.example.com/api/v1',
          VITE_SOCKET_URL: 'https://api-staging.example.com',
          ...override
        },
        true
      )
    ).toThrow(expectedKey);
  });
});
