import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import { ClientStatus, ClientType, UserRole } from '../generated/prisma/client';
import { ClientAccessPolicy } from './client-access.policy';

const policy = new ClientAccessPolicy();

describe('ClientAccessPolicy', () => {
  it('hides Clients outside the authenticated ownership', () => {
    expect(() => policy.assertOwnedClient(principal(), '00000000-0000-4000-8000-000000000002')).toThrow(
      NotFoundException
    );
  });

  it('blocks Event activation for suspended Clients', () => {
    expect(() =>
      policy.assertCanActivateEvents(
        principal({
          clientStatus: ClientStatus.SUSPENDED
        })
      )
    ).toThrow(ConflictException);
  });

  it('allows active operational Clients to reach activation policies', () => {
    expect(() => policy.assertCanActivateEvents(principal())).not.toThrow();
  });
});

function principal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
  return {
    userId: '00000000-0000-4000-8000-000000000010',
    sessionId: '00000000-0000-4000-8000-000000000011',
    email: 'planner@example.com',
    role: UserRole.INDEPENDENT_PLANNER,
    clientId: '00000000-0000-4000-8000-000000000001',
    clientType: ClientType.PLANNER,
    clientStatus: ClientStatus.ACTIVE,
    ...overrides
  };
}
