import { describe, expect, it } from 'vitest';
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  readCookie
} from './auth-cookie';

const config = {
  authCookieName: 'ip_session',
  authCookiePath: '/api/v1',
  authCookieSameSite: 'lax' as const,
  authCookieSecure: true,
  authSessionTtlSeconds: 3600
};

describe('auth cookies', () => {
  it('serializes an opaque session cookie with restrictive attributes', () => {
    const cookie = buildSessionCookie('opaque/token', config);

    expect(cookie).toContain('ip_session=opaque%2Ftoken');
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('Path=/api/v1');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('reads the exact cookie and clears it using the same scope', () => {
    expect(readCookie('other=1; ip_session=opaque%2Ftoken', 'ip_session')).toBe(
      'opaque/token'
    );

    const cleared = buildClearedSessionCookie(config);
    expect(cleared).toContain('ip_session=');
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('Path=/api/v1');
  });
});
