import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { hashPassword } from '../src/auth/password-hasher';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditActorFactory } from '../src/audit/audit-actor.factory';
import { AuditService } from '../src/audit/audit.service';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { AuditActorType, ClientType, UserRole } from '../src/generated/prisma/client';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Audit persistence', () => {
  let app: INestApplication;
  let audit: AuditService;
  let prisma: PrismaService;
  let adminCookie: string;
  let plannerCookie: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests.');
    }

    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = trustedOrigin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';

    app = await createApp();
    await app.init();

    audit = app.get(AuditService);
    prisma = app.get(PrismaService);

    const adminEmail = `audit-admin-${randomUUID()}@example.com`;
    const plannerEmail = `audit-planner-${randomUUID()}@example.com`;
    const client = await prisma.client.create({ data: { name: `Audit ${randomUUID()}`, type: ClientType.PLANNER } });
    await prisma.user.createMany({
      data: [
        { email: adminEmail, passwordHash: await hashPassword(password), role: UserRole.PLATFORM_ADMIN },
        {
          email: plannerEmail,
          passwordHash: await hashPassword(password),
          role: UserRole.INDEPENDENT_PLANNER,
          clientId: client.id
        }
      ]
    });
    adminCookie = await login(adminEmail);
    plannerCookie = await login(plannerEmail);
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

  it('enforces authentication and the PLATFORM_ADMIN role', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/audit-logs').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('Cookie', plannerCookie)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ROLE_FORBIDDEN'));
    await request(app.getHttpServer()).get('/api/v1/admin/audit-logs').set('Cookie', adminCookie).expect(200);
  });

  it.each([
    'unknown=value',
    'clientId=invalid',
    'actorType=INVALID',
    'createdFrom=not-an-instant',
    'createdFrom=2026-08-05T00%3A00%3A00Z&createdTo=2026-08-04T00%3A00%3A00Z',
    'limit=0',
    'limit=101',
    'cursor=invalid!'
  ])('rejects invalid and unknown query parameters: %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/audit-logs?${query}`)
      .set('Cookie', adminCookie)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_ERROR'));
  });

  it('applies exact filters and sanitizes persisted JSON again without enriching the response', async () => {
    const id = randomUUID();
    const clientId = randomUUID();
    const eventId = randomUUID();
    const actorId = randomUUID();
    const operationId = randomUUID();
    const resourceType = `AUDIT_QUERY_${randomUUID()}`;
    await prisma.$executeRaw`
      INSERT INTO "audit_log" (
        "id", "actor_type", "actor_id", "client_id", "event_id", "resource_type", "resource_id",
        "action", "operation_id", "before_data", "after_data", "metadata", "occurred_at"
      ) VALUES (
        ${id}::uuid, 'USER'::"audit_actor_type", ${actorId}::uuid, ${clientId}::uuid, ${eventId}::uuid,
        ${resourceType}, ${id}::uuid, 'EXACT_FILTER', ${operationId}::uuid,
        ${JSON.stringify({ password: 'raw-password', safe: ['value', null] })}::jsonb,
        ${JSON.stringify([{ invitationToken: 'raw-token' }, { count: 2 }])}::jsonb,
        ${JSON.stringify({ authorization: 'Bearer raw', source: 'integration' })}::jsonb,
        ${new Date('2026-08-04T12:00:00.000Z')}
      )
    `;

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({
        clientId,
        eventId,
        actorType: 'USER',
        actorId,
        resourceType,
        resourceId: id,
        action: 'EXACT_FILTER',
        operationId,
        createdFrom: '2026-08-04T11:59:59.000Z',
        createdTo: '2026-08-04T12:00:01.000Z',
        limit: 10
      })
      .set('Cookie', adminCookie)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id,
          createdAt: '2026-08-04T12:00:00.000Z',
          actorType: 'USER',
          actorId,
          actorFingerprint: null,
          resourceType,
          resourceId: id,
          clientId,
          eventId,
          action: 'EXACT_FILTER',
          operationId,
          beforeData: { password: '[REDACTED]', safe: ['value', null] },
          afterData: [{ invitationToken: '[REDACTED]' }, { count: 2 }],
          metadata: { authorization: '[REDACTED]', source: 'integration' }
        }
      ],
      nextCursor: null
    });
    expect(JSON.stringify(response.body)).not.toContain('raw-password');
    expect(JSON.stringify(response.body)).not.toContain('raw-token');
    expect(response.body.items[0]).not.toHaveProperty('email');
    expect(response.body.items[0]).not.toHaveProperty('passwordHash');
  });

  it('paginates equal timestamps by id without duplicates or omissions', async () => {
    const resourceType = `AUDIT_PAGE_${randomUUID()}`;
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
    const ids = [
      `ffffffff-ffff-4fff-8fff-${suffix}`,
      `88888888-8888-4888-8888-${suffix}`,
      `11111111-1111-4111-8111-${suffix}`
    ];
    for (const id of ids) {
      await prisma.$executeRaw`
        INSERT INTO "audit_log" ("id", "actor_type", "resource_type", "action", "occurred_at")
        VALUES (${id}::uuid, 'SYSTEM'::"audit_actor_type", ${resourceType}, 'PAGE', ${new Date(
          '2026-08-04T15:00:00.000Z'
        )})
      `;
    }

    const first = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({ resourceType, limit: 2 })
      .set('Cookie', adminCookie)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({ resourceType, limit: 2, cursor: first.body.nextCursor })
      .set('Cookie', adminCookie)
      .expect(200);

    expect(first.body.items.map((entry: { id: string }) => entry.id)).toEqual(ids.slice(0, 2));
    expect(second.body.items.map((entry: { id: string }) => entry.id)).toEqual(ids.slice(2));
    expect(new Set([...first.body.items, ...second.body.items].map((entry: { id: string }) => entry.id)).size).toBe(3);
    expect(second.body.nextCursor).toBeNull();
  });

  it('orders different timestamps descending and supports an empty filtered result at the maximum limit', async () => {
    const resourceType = `AUDIT_ORDER_${randomUUID()}`;
    await prisma.$executeRaw`
      INSERT INTO "audit_log" ("actor_type", "resource_type", "action", "occurred_at")
      VALUES
        ('SYSTEM'::"audit_actor_type", ${resourceType}, 'OLDER', ${new Date('2026-08-03T15:00:00.000Z')}),
        ('SYSTEM'::"audit_actor_type", ${resourceType}, 'NEWER', ${new Date('2026-08-04T15:00:00.000Z')})
    `;

    const ordered = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({ resourceType, limit: 100 })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(ordered.body.items.map((item: { action: string }) => item.action)).toEqual(['NEWER', 'OLDER']);

    const empty = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({ resourceType: `MISSING_${randomUUID()}`, limit: 100 })
      .set('Cookie', adminCookie)
      .expect(200);
    expect(empty.body).toEqual({ items: [], nextCursor: null });
  });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email, password })
      .expect(200);
    const cookieHeader = response.headers['set-cookie'];
    const cookie = (Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader)?.split(';')[0];
    if (!cookie) throw new Error('Login did not return a session cookie.');
    return cookie;
  }
});
