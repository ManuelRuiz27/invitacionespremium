import { describe, expect, it } from 'vitest';
import { ClientType, UserRole } from '../src/generated/prisma/client';
import { assertLocalSeedEnvironment, LOCAL_CLIENT_FIXTURES } from './seed-local-clients';

describe('local Client seed', () => {
  it('covers both contractual Client types and every operational user role', () => {
    expect(LOCAL_CLIENT_FIXTURES.map((fixture) => fixture.clientType)).toEqual([
      ClientType.PLANNER,
      ClientType.ORGANIZATION
    ]);
    expect(LOCAL_CLIENT_FIXTURES.flatMap((fixture) => fixture.users.map((user) => user.role))).toEqual([
      UserRole.INDEPENDENT_PLANNER,
      UserRole.ORGANIZATION_ADMIN,
      UserRole.ORGANIZATION_PLANNER
    ]);
    expect(new Set(LOCAL_CLIENT_FIXTURES.map((fixture) => fixture.creditIdempotencyKey)).size).toBe(
      LOCAL_CLIENT_FIXTURES.length
    );
  });

  it('cannot run against production', () => {
    expect(() => assertLocalSeedEnvironment('production')).toThrow('disabled in production');
    expect(() => assertLocalSeedEnvironment('development')).not.toThrow();
    expect(() => assertLocalSeedEnvironment('test')).not.toThrow();
  });
});
