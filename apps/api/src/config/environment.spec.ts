import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('coerces values and permits local invitation defaults in development', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'development',
      API_PORT: '3100',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
      DATABASE_POOL_MAX: '5',
      SWAGGER_ENABLED: 'false',
      AUTH_SESSION_TTL_SECONDS: '3600',
      AUTH_COOKIE_SECURE: 'false'
    });

    expect(environment.API_PORT).toBe(3100);
    expect(environment.DATABASE_POOL_MAX).toBe(5);
    expect(environment.SWAGGER_ENABLED).toBe(false);
    expect(environment.AUTH_SESSION_TTL_SECONDS).toBe(3600);
    expect(environment.AUTH_COOKIE_SECURE).toBe(false);
    expect(environment.CREDIT_UNIT_VALUE_MXN_CENTS).toBe(2000);
    expect(environment.PHONE_DEFAULT_REGION).toBe('MX');
    expect(environment.CONTACT_IMPORT_PREVIEW_TTL_SECONDS).toBe(1800);
    expect(environment.FILE_STORAGE_LOCAL_ROOT).toBe('var/file-assets');
    expect(environment.FILE_UPLOAD_MAX_BYTES).toBe(10_485_760);
    expect(environment.FILE_IMAGE_MAX_PIXELS).toBe(40_000_000);
    expect(environment.FILE_ORPHAN_RETENTION_SECONDS).toBe(86_400);
    expect(Buffer.byteLength(environment.INVITATION_TOKEN_SIGNING_SECRET)).toBeGreaterThanOrEqual(32);
    expect(environment.PUBLIC_INVITATION_BASE_URL).toBe('http://localhost:5173/invitacion');
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'mysql://localhost/invitacionespremium'
      })
    ).toThrow(/PostgreSQL connection URL/);
  });

  it('requires secure cookies in production and for SameSite=None', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        AUTH_COOKIE_SECURE: 'false'
      })
    ).toThrow(/must be true in production/);

    expect(() =>
      validateEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        AUTH_COOKIE_SECURE: 'false',
        AUTH_COOKIE_SAME_SITE: 'none'
      })
    ).toThrow(/none requires AUTH_COOKIE_SECURE=true/);
  });

  it('requires local admin seed credentials as a pair', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        LOCAL_ADMIN_EMAIL: 'admin@example.com'
      })
    ).toThrow(/must be provided together/);
  });

  it('validates contact phone region and preview TTL', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        PHONE_DEFAULT_REGION: 'mex'
      })
    ).toThrow();
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        CONTACT_IMPORT_PREVIEW_TTL_SECONDS: '30'
      })
    ).toThrow();
  });

  it('validates FileAsset storage and upload limits', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        FILE_STORAGE_LOCAL_ROOT: ' '
      })
    ).toThrow();
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        FILE_UPLOAD_MAX_BYTES: '0'
      })
    ).toThrow();
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        FILE_IMAGE_MAX_PIXELS: '0'
      })
    ).toThrow();
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        FILE_ORPHAN_RETENTION_SECONDS: '30'
      })
    ).toThrow();
  });

  it('requires at least 32 bytes for invitation token signing', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
        INVITATION_TOKEN_SIGNING_SECRET: 'too-short'
      })
    ).toThrow(/32 bytes/);
  });

  it('requires invitation token configuration explicitly in production', () => {
    expect(() => validateEnvironment(productionEnvironment())).toThrow(
      /INVITATION_TOKEN_SIGNING_SECRET: must be explicitly configured in production/
    );
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        INVITATION_TOKEN_SIGNING_SECRET: 'safe-production-secret-with-at-least-32-bytes'
      })
    ).toThrow(/PUBLIC_INVITATION_BASE_URL: must be explicitly configured in production/);
  });

  it.each([
    'local-development-invitation-signing-secret',
    'replace-with-at-least-32-random-bytes',
    '  replace-with-at-least-32-random-bytes  '
  ])('rejects a known invitation signing secret in production', (secret) => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        INVITATION_TOKEN_SIGNING_SECRET: secret,
        PUBLIC_INVITATION_BASE_URL: 'https://invitaciones.example.com/invitacion'
      })
    ).toThrow(/must use a unique production secret/);
  });

  it('rejects short production secrets', () => {
    const secret = 'too-short';
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        INVITATION_TOKEN_SIGNING_SECRET: secret,
        PUBLIC_INVITATION_BASE_URL: 'https://invitaciones.example.com/invitacion'
      })
    ).toThrow(/32 bytes/);
    try {
      validateEnvironment({
        ...productionEnvironment(),
        INVITATION_TOKEN_SIGNING_SECRET: secret,
        PUBLIC_INVITATION_BASE_URL: 'https://invitaciones.example.com/invitacion'
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it.each([
    ['an HTTP URL', 'http://invitaciones.example.com/invitacion', /must use https in production/],
    ['localhost', 'https://localhost/invitacion', /must not use a loopback host/],
    ['IPv4 loopback', 'https://127.0.0.1/invitacion', /must not use a loopback host/],
    ['IPv6 loopback', 'https://[::1]/invitacion', /must not use a loopback host/],
    ['credentials', 'https://user:password@invitaciones.example.com/invitacion', /must not contain user credentials/],
    ['a query', 'https://invitaciones.example.com/invitacion?source=unsafe', /must not contain a query or fragment/],
    ['a fragment', 'https://invitaciones.example.com/invitacion#unsafe', /must not contain a query or fragment/],
    ['no path', 'https://invitaciones.example.com', /must include a public invitation path/]
  ])('rejects production invitation URLs with %s', (_case, url, expected) => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        INVITATION_TOKEN_SIGNING_SECRET: 'safe-production-secret-with-at-least-32-bytes',
        PUBLIC_INVITATION_BASE_URL: url
      })
    ).toThrow(expected);
  });

  it('accepts an explicit secure production invitation configuration', () => {
    const environment = validateEnvironment({
      ...productionEnvironment(),
      INVITATION_TOKEN_SIGNING_SECRET: 'safe-production-secret-with-at-least-32-bytes',
      PUBLIC_INVITATION_BASE_URL: 'https://invitaciones.example.com/invitacion'
    });

    expect(environment.INVITATION_TOKEN_SIGNING_SECRET).toBe('safe-production-secret-with-at-least-32-bytes');
    expect(environment.PUBLIC_INVITATION_BASE_URL).toBe('https://invitaciones.example.com/invitacion');
  });
});

function productionEnvironment(): Record<string, unknown> {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
    AUTH_COOKIE_SECURE: 'true'
  };
}
