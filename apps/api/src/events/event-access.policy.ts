import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';

@Injectable()
export class EventAccessPolicy {
  ownedWhere(principal: AuthPrincipal): Prisma.EventWhereInput {
    return eventOwnedWhere(principal);
  }
}

export function eventOwnedWhere(principal: AuthPrincipal): Prisma.EventWhereInput {
  if (!principal.clientId) {
    throw eventNotFound();
  }

  return {
    clientId: principal.clientId,
    ...(principal.role === UserRole.ORGANIZATION_PLANNER ? { createdByUserId: principal.userId } : {})
  };
}

export function eventNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'EVENT_NOT_FOUND',
    message: 'Event not found.'
  });
}
