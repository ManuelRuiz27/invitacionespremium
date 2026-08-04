import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { AuditActorType, type Prisma } from '../generated/prisma/client';
import { AuditLogPageResponseDto, AuditLogQuery, decodeAuditCursor, encodeAuditCursor } from './audit-query.dto';
import { sanitizeAuditObject, sanitizeAuditValue } from './audit-sanitizer';
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
      ...(input.actor.fingerprint === undefined ? {} : { actorFingerprint: input.actor.fingerprint }),
      ...(input.resourceId === undefined ? {} : { resourceId: input.resourceId }),
      ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
      ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
      ...(input.beforeData === undefined
        ? {}
        : {
            beforeData: sanitizeAuditObject(input.beforeData) as Prisma.InputJsonObject
          }),
      ...(input.afterData === undefined
        ? {}
        : {
            afterData: sanitizeAuditObject(input.afterData) as Prisma.InputJsonObject
          }),
      ...(input.metadata === undefined
        ? {}
        : {
            metadata: sanitizeAuditObject(input.metadata) as Prisma.InputJsonObject
          }),
      ...(input.operationId === undefined ? {} : { operationId: input.operationId })
    };

    const created = await client.auditLog.create({
      data,
      select: {
        id: true
      }
    });

    return created.id;
  }

  async list(query: AuditLogQuery): Promise<AuditLogPageResponseDto> {
    const cursor = query.cursor ? decodeAuditCursor(query.cursor) : undefined;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.clientId ? { clientId: query.clientId } : {}),
        ...(query.eventId ? { eventId: query.eventId } : {}),
        ...(query.actorType ? { actorType: query.actorType } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.resourceType ? { resourceType: query.resourceType } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.operationId ? { operationId: query.operationId } : {}),
        ...(query.createdFrom || query.createdTo
          ? {
              occurredAt: {
                ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
                ...(query.createdTo ? { lte: new Date(query.createdTo) } : {})
              }
            }
          : {}),
        ...(cursor
          ? {
              OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }]
            }
          : {})
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        occurredAt: true,
        actorType: true,
        actorId: true,
        actorFingerprint: true,
        resourceType: true,
        resourceId: true,
        clientId: true,
        eventId: true,
        action: true,
        operationId: true,
        beforeData: true,
        afterData: true,
        metadata: true
      }
    });

    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = pageRows.at(-1);

    return {
      items: pageRows.map((row) => ({
        id: row.id,
        createdAt: row.occurredAt.toISOString(),
        actorType: row.actorType,
        actorId: row.actorId,
        actorFingerprint: row.actorFingerprint,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        clientId: row.clientId,
        eventId: row.eventId,
        action: row.action,
        operationId: row.operationId,
        beforeData: sanitizeAuditValue(row.beforeData),
        afterData: sanitizeAuditValue(row.afterData),
        metadata: sanitizeAuditValue(row.metadata)
      })),
      nextCursor: hasNextPage && last ? encodeAuditCursor(last.occurredAt, last.id) : null
    };
  }
}

function assertValidActor(actor: AuditActor): void {
  if ((actor.type === AuditActorType.USER || actor.type === AuditActorType.STAFF_TOKEN) && actor.id === undefined) {
    throw new TypeError(`${actor.type} audit actor requires an id.`);
  }

  if (actor.type === AuditActorType.PUBLIC_TOKEN && actor.fingerprint === undefined) {
    throw new TypeError('PUBLIC_TOKEN audit actor requires a fingerprint.');
  }

  if (actor.type === AuditActorType.SYSTEM && (actor.id !== undefined || actor.fingerprint !== undefined)) {
    throw new TypeError('SYSTEM audit actor cannot include an id or fingerprint.');
  }
}
