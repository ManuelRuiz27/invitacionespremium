import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('coerces numeric and boolean values', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'test',
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
});
