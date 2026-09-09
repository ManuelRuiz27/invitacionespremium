import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PrismaService } from '../common/database/prisma.service';
import { ClientOperatingProfile, type Prisma } from '../generated/prisma/client';
import { clientNotFound } from './client-access.policy';

@Injectable()
export class ClientOperatingProfilePolicy {
  async assertTechnicalMutationAllowed(
    database: PrismaService | Prisma.TransactionClient,
    clientId: string
  ): Promise<void> {
    const client = await database.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { operatingProfile: true }
    });
    if (!client) throw clientNotFound();
    if (client.operatingProfile === ClientOperatingProfile.MANAGED) {
      throw new ForbiddenException({
        code: 'CLIENT_MANAGED_CAPABILITY_FORBIDDEN',
        message: 'This technical capability is managed by the provider.'
      });
    }
  }
}
