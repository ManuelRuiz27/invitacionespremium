import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  it('coerces numeric and boolean values', () => {
    const environment = validateEnvironment({
      NODE_ENV: 'test',
      API_PORT: '3100',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/app',
      DATABASE_POOL_MAX: '5',
      SWAGGER_ENABLED: 'false'
    });

    expect(environment.API_PORT).toBe(3100);
    expect(environment.DATABASE_POOL_MAX).toBe(5);
    expect(environment.SWAGGER_ENABLED).toBe(false);
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'mysql://localhost/invitacionespremium'
      })
    ).toThrow(/PostgreSQL connection URL/);
  });
});
