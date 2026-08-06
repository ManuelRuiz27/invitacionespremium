import { describe, expect, it } from 'vitest';
import { readClientEnv } from './env';

describe('client environment', () => {
  it('requires every public URL in production', () => {
    expect(() => readClientEnv({}, true)).toThrow('VITE_API_BASE_URL is required in production.');
  });

  it('validates and normalizes explicit URLs', () => {
    expect(
      readClientEnv(
        {
          VITE_API_BASE_URL: 'https://api.example.com/api/v1/',
          VITE_ADMIN_APP_URL: 'https://admin.example.com/',
          VITE_LANDING_URL: 'https://example.com/'
        },
        true
      )
    ).toEqual({
      apiBaseUrl: 'https://api.example.com/api/v1',
      adminAppUrl: 'https://admin.example.com',
      landingUrl: 'https://example.com'
    });
  });
});
