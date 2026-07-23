import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { ClientStatus, ClientType, UserRole } from '../generated/prisma/client';
import type { AuthenticatedRequest } from './auth.types';
import { RolesGuard } from './roles.guard';

function context(role: UserRole): ExecutionContext {
  const request: AuthenticatedRequest = {
    auth: {
      userId: '00000000-0000-4000-8000-000000000001',
      sessionId: '00000000-0000-4000-8000-000000000002',
      email: 'user@example.com',
      role,
      clientId: '00000000-0000-4000-8000-000000000003',
      clientType: ClientType.ORGANIZATION,
      clientStatus: ClientStatus.ACTIVE
    }
  } as AuthenticatedRequest;

  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows a role included in endpoint metadata', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([UserRole.ORGANIZATION_ADMIN])
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(context(UserRole.ORGANIZATION_ADMIN))).toBe(true);
  });

  it('rejects a role outside endpoint metadata', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([UserRole.ORGANIZATION_ADMIN])
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(context(UserRole.ORGANIZATION_PLANNER))).toThrow(ForbiddenException);
  });
});
