import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditActorFactory } from '../src/audit/audit-actor.factory';
import { AuditService } from '../src/audit/audit.service';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditActorType } from '../src/generated/prisma/client';

describe('Audit persistence', () => {
  let app: INestApplication;
  let audit: AuditService;
  let prisma: PrismaService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests.');
    }

    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = 'http://localhost:5173';

    app = await createApp();
    await app.init();

    audit = app.get(AuditService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('persists a public actor without storing its raw token or personal contact fields', async () => {
    const rawToken = `public-${randomUUID()}`;
    const operationId = randomUUID();
    const resourceId = randomUUID();

    const auditId = await audit.record({
      actor: AuditActorFactory.publicToken(rawToken),
      resourceType: 'INVITATION',
      resourceId,
      action: 'PUBLIC_INVITATION_VIEWED',
      operationId,
      beforeData: {
        invitationToken: rawToken,
        phone: '+5214440000000',
        status: 'active'
      },
      metadata: {
        authorization: `Bearer ${rawToken}`,
        source: 'integration-test'
      }
    });

    const stored = await prisma.auditLog.findUniqueOrThrow({
      where: {
        id: auditId
      }
    });

    expect(stored).toMatchObject({
      actorType: AuditActorType.PUBLIC_TOKEN,
      actorId: null,
      actorFingerprint: createHash('sha256').update(rawToken).digest('hex'),
      resourceType: 'INVITATION',
      resourceId,
      action: 'PUBLIC_INVITATION_VIEWED',
      operationId
    });
    expect(stored.beforeData).toEqual({
      invitationToken: '[REDACTED]',
      phone: '[REDACTED]',
      status: 'active'
    });
    expect(stored.metadata).toEqual({
      authorization: '[REDACTED]',
      source: 'integration-test'
    });
    expect(JSON.stringify(stored)).not.toContain(rawToken);
  });

  it('rejects updates and deletes at the PostgreSQL layer', async () => {
    const auditId = await audit.record({
      actor: AuditActorFactory.system(),
      resourceType: 'SYSTEM',
      action: 'IMMUTABILITY_TEST',
      operationId: randomUUID()
    });

    await expect(
      prisma.auditLog.update({
        where: {
          id: auditId
        },
        data: {
          action: 'MUTATED'
        }
      })
    ).rejects.toThrow(/audit_log is append-only/i);

    await expect(
      prisma.auditLog.delete({
        where: {
          id: auditId
        }
      })
    ).rejects.toThrow(/audit_log is append-only/i);
  });
});
