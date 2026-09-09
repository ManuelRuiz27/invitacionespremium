import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../common/database/prisma.service';
import { ClientOperatingProfile } from '../generated/prisma/client';
import { ClientOperatingProfilePolicy } from './client-operating-profile.policy';

const policy = new ClientOperatingProfilePolicy();

describe('ClientOperatingProfilePolicy', () => {
  it('allows technical mutations for the current SELF_SERVICE profile', async () => {
    const database = databaseReturning(ClientOperatingProfile.SELF_SERVICE);

    await expect(policy.assertTechnicalMutationAllowed(database, 'client-id')).resolves.toBeUndefined();
    expect(database.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'client-id', deletedAt: null },
      select: { operatingProfile: true }
    });
  });

  it('blocks the current MANAGED profile with the stable capability code', async () => {
    const mutation = policy.assertTechnicalMutationAllowed(
      databaseReturning(ClientOperatingProfile.MANAGED),
      'client-id'
    );

    await expect(mutation).rejects.toBeInstanceOf(ForbiddenException);
    await expect(mutation).rejects.toMatchObject({
      response: {
        code: 'CLIENT_MANAGED_CAPABILITY_FORBIDDEN',
        message: 'This technical capability is managed by the provider.'
      }
    });
  });

  it('does not reveal an absent or deleted Client', async () => {
    await expect(policy.assertTechnicalMutationAllowed(databaseReturning(null), 'client-id')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

function databaseReturning(operatingProfile: ClientOperatingProfile | null) {
  return {
    client: {
      findFirst: vi.fn().mockResolvedValue(operatingProfile === null ? null : { operatingProfile })
    }
  } as unknown as PrismaService;
}
