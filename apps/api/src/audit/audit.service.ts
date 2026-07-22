import { Inject, Injectable } from '@nestjs/common';
import { AuditActorType, type Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { sanitizeAuditObject } from './audit-sanitizer';
import type { AuditActor, AuditRecordInput } from './audit.types';

@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(
    input: AuditRecordInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma
  ): Promise<string> {
    assertValidActor(input.actor);

    const data: Prisma.AuditLogUncheckedCreateInput = {
      actorType: input.actor.type,
      resourceType: input.resourceType,
      action: input.action,
      ...(input.actor.id === undefined ? {} : { actorId: input.actor.id }),
      ...(input.actor.fingerprint === undefined
        ? {}
        : { actorFingerprint: input.actor.fingerprint }),
      ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
      ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
      ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
      ...(input.beforeData === undefined
        ? {}
        : {
            beforeData: sanitizeAuditObject(
              input.beforeData
            ) as Prisma.InputJsonObject
          }),
      ...(input.afterData === undefined
        ? {}
        : {
            afterData: sanitizeAuditObject(
              input.afterData
            ) as Prisma.InputJsonObject
          }),
      ...(input.metadata === undefined
        ? {}
        : {
            metadata: sanitizeAuditObject(
              input.metadata
            ) as Prisma.InputJsonObject
          }),
      ...(input.operationId === undefined
        ? {}
        : { operationId: input.operationId })
    };

    const created = await client.auditLog.create({
      data,
      select: {
        id: true
      }
    });

    return created.id;
  }
}

function assertValidActor(actor: AuditActor): void {
  if (
    (actor.type === AuditActorType.USER ||
      actor.type === AuditActorType.STAFF_TOKEN) &&
    actor.id === undefined
  ) {
    throw new TypeError(`${actor.type} audit actor requires an id.`);
  }

  if (
    actor.type === AuditActorType.PUBLIC_TOKEN &&
    actor.fingerprint === undefined
  ) {
    throw new TypeError('PUBLIC_TOKEN audit actor requires a fingerprint.');
  }

  if (
    actor.type === AuditActorType.SYSTEM &&
    (actor.id !== undefined || actor.fingerprint !== undefined)
  ) {
    throw new TypeError('SYSTEM audit actor cannot include an id or fingerprint.');
  }
}
