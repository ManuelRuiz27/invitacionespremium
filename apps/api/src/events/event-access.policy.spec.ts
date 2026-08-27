import { describe, expect, it } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import { ClientStatus, ClientType, UserRole } from '../generated/prisma/client';
import { eventOwnedWhere } from './event-access.policy';

function principal(role: UserRole): AuthPrincipal {
  return {
    userId: 'planner-user',
    sessionId: 'session',
    email: 'planner@example.com',
    role,
    clientId: 'client-id',
    clientType: ClientType.ORGANIZATION,
    clientStatus: ClientStatus.ACTIVE
  };
}

describe('eventOwnedWhere', () => {
  it('uses assigned Planner ownership for Organization Planner without changing tenant-wide roles', () => {
    expect(eventOwnedWhere(principal(UserRole.ORGANIZATION_PLANNER))).toEqual({
      clientId: 'client-id',
      assignedPlannerUserId: 'planner-user'
    });
    expect(eventOwnedWhere(principal(UserRole.ORGANIZATION_ADMIN))).toEqual({ clientId: 'client-id' });
    expect(eventOwnedWhere(principal(UserRole.INDEPENDENT_PLANNER))).toEqual({ clientId: 'client-id' });
  });
});
