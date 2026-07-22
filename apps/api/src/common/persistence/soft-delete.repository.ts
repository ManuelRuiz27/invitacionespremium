import { ForbiddenException } from '@nestjs/common';
import { AuditActorType } from '../../generated/prisma/client';

export interface RestorationPrincipal {
  actorType: AuditActorType;
  isPlatformAdmin: boolean;
}

export type ActiveWhere<TWhere extends object> = Omit<
  TWhere,
  'deletedAt'
> & {
  deletedAt: null;
};

export function activeWhere<TWhere extends object>(
  where?: TWhere
): ActiveWhere<TWhere> {
  return {
    ...(where ?? {}),
    deletedAt: null
  } as ActiveWhere<TWhere>;
}

export function assertPlatformAdminRestoration(
  principal: RestorationPrincipal
): void {
  if (
    principal.actorType !== AuditActorType.USER ||
    principal.isPlatformAdmin !== true
  ) {
    throw new ForbiddenException({
      code: 'RESTORE_FORBIDDEN',
      message: 'Only Platform Admin can restore soft-deleted resources.'
    });
  }
}

export abstract class SoftDeleteRepository<
  TRecord,
  TWhere extends object,
  TWhereUnique extends object
> {
  protected abstract findManyActive(
    where: ActiveWhere<TWhere>
  ): Promise<TRecord[]>;

  protected abstract findFirstActive(
    where: ActiveWhere<TWhere>
  ): Promise<TRecord | null>;

  protected abstract updateDeletedAt(
    where: TWhereUnique,
    deletedAt: Date | null
  ): Promise<TRecord>;

  findMany(where?: TWhere): Promise<TRecord[]> {
    return this.findManyActive(activeWhere(where));
  }

  findFirst(where?: TWhere): Promise<TRecord | null> {
    return this.findFirstActive(activeWhere(where));
  }

  softDelete(
    where: TWhereUnique,
    deletedAt: Date = new Date()
  ): Promise<TRecord> {
    return this.updateDeletedAt(where, deletedAt);
  }

  restore(
    where: TWhereUnique,
    principal: RestorationPrincipal
  ): Promise<TRecord> {
    assertPlatformAdminRestoration(principal);

    return this.updateDeletedAt(where, null);
  }
}
