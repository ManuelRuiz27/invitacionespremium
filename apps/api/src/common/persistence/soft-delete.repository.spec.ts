import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuditActorType } from '../../generated/prisma/client';
import { type ActiveWhere, SoftDeleteRepository } from './soft-delete.repository';

interface TestRecord {
  id: string;
  state: string;
  deletedAt: Date | null;
}

interface TestWhere {
  id?: string;
  state?: string;
  deletedAt?: Date | null;
}

interface TestWhereUnique {
  id: string;
}

class TestSoftDeleteRepository extends SoftDeleteRepository<TestRecord, TestWhere, TestWhereUnique> {
  readonly record: TestRecord = {
    id: 'record-1',
    state: 'active',
    deletedAt: null
  };

  lastActiveWhere?: ActiveWhere<TestWhere>;
  lastDeletedAt?: Date | null;

  protected findManyActive(where: ActiveWhere<TestWhere>): Promise<TestRecord[]> {
    this.lastActiveWhere = where;
    return Promise.resolve([this.record]);
  }

  protected findFirstActive(where: ActiveWhere<TestWhere>): Promise<TestRecord | null> {
    this.lastActiveWhere = where;
    return Promise.resolve(this.record);
  }

  protected updateDeletedAt(_where: TestWhereUnique, deletedAt: Date | null): Promise<TestRecord> {
    this.lastDeletedAt = deletedAt;
    return Promise.resolve({
      ...this.record,
      deletedAt
    });
  }
}

describe('SoftDeleteRepository', () => {
  it('forces operational queries to exclude deleted records', async () => {
    const repository = new TestSoftDeleteRepository();

    await repository.findMany({
      state: 'active',
      deletedAt: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(repository.lastActiveWhere).toEqual({
      state: 'active',
      deletedAt: null
    });
  });

  it('soft deletes by setting deletedAt without changing state', async () => {
    const repository = new TestSoftDeleteRepository();
    const deletedAt = new Date('2026-07-22T18:00:00.000Z');

    const result = await repository.softDelete({ id: 'record-1' }, deletedAt);

    expect(result).toEqual({
      id: 'record-1',
      state: 'active',
      deletedAt
    });
  });

  it('rejects restoration by any principal other than Platform Admin', () => {
    const repository = new TestSoftDeleteRepository();

    expect(() =>
      repository.restore(
        { id: 'record-1' },
        {
          actorType: AuditActorType.USER,
          isPlatformAdmin: false
        }
      )
    ).toThrow(ForbiddenException);

    expect(() =>
      repository.restore(
        { id: 'record-1' },
        {
          actorType: AuditActorType.SYSTEM,
          isPlatformAdmin: true
        }
      )
    ).toThrow(ForbiddenException);
  });

  it('restores only deletedAt and preserves the previous resource state', async () => {
    const repository = new TestSoftDeleteRepository();

    const result = await repository.restore(
      { id: 'record-1' },
      {
        actorType: AuditActorType.USER,
        isPlatformAdmin: true
      }
    );

    expect(result).toEqual({
      id: 'record-1',
      state: 'active',
      deletedAt: null
    });
    expect(repository.lastDeletedAt).toBeNull();
  });
});
