import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientStatus, ClientType, UserRole } from '../generated/prisma/client';
import type { AuthPrincipal } from '../auth/auth.types';

@Injectable()
export class ClientAccessPolicy {
  assertOwnedClient(principal: AuthPrincipal, clientId: string): void {
    if (principal.clientId !== clientId) {
      throw clientNotFound();
    }
  }

  assertOrganizationClient(principal: AuthPrincipal, clientId: string): void {
    this.assertOwnedClient(principal, clientId);

    if (principal.clientType !== ClientType.ORGANIZATION) {
      throw clientNotFound();
    }
  }

  assertCanActivateEvents(principal: AuthPrincipal): void {
    if (principal.role === UserRole.PLATFORM_ADMIN) {
      throw new ConflictException({
        code: 'CLIENT_OPERATION_REQUIRED',
        message: 'Platform Admin cannot activate Events through Client operations.'
      });
    }

    if (principal.clientStatus === ClientStatus.SUSPENDED) {
      throw new ConflictException({
        code: 'CLIENT_SUSPENDED',
        message: 'The Client is suspended and cannot activate Events.'
      });
    }
  }
}

export function clientNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'CLIENT_NOT_FOUND',
    message: 'Client not found.'
  });
}
