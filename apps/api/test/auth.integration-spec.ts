import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { UserRole } from '../src/generated/prisma/client';
import { hashPassword } from '../src/auth/password-hasher';

const trustedOrigin = 'http://localhost:5173';

describe('Local authentication', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests.');
    }

    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = trustedOrigin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';

    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  it('creates a cookie session, resolves me and revokes the session on logout', async () => {
    const email = `admin-${randomUUID()}@example.com`;
    const password = 'correct horse battery staple';
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: UserRole.PLATFORM_ADMIN,
        clientId: null
      }
    });

    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .set('x-operation-id', randomUUID())
      .send({ email, password })
      .expect(200);

    expect(loginResponse.body).toMatchObject({
      user: {
        id: user.id,
        email,
        role: UserRole.PLATFORM_ADMIN,
        clientId: null
      }
    });
    expect(loginResponse.body).not.toHaveProperty('token');

    const setCookie = loginResponse.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    expect(cookieHeader).toContain('ip_session=');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('SameSite=Lax');
    expect(cookieHeader).toContain('Path=/api/v1');
    expect(cookieHeader).not.toContain('Secure');

    const sessionCookie = cookieHeader?.split(';')[0];
    expect(sessionCookie).toBeTruthy();

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie ?? '')
      .expect(200)
      .expect({
        id: user.id,
        email,
        role: UserRole.PLATFORM_ADMIN,
        clientId: null
      });

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', trustedOrigin)
      .set('Cookie', sessionCookie ?? '')
      .expect(204);

    const clearedCookie = logoutResponse.headers['set-cookie'];
    expect(Array.isArray(clearedCookie) ? clearedCookie[0] : clearedCookie).toContain(
      'Max-Age=0'
    );

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie ?? '')
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'UNAUTHENTICATED',
          message: 'A valid session is required.'
        });
      });

    const storedSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: user.id }
    });
    expect(storedSession.revokedAt).not.toBeNull();

    const auditActions = await prisma.auditLog.findMany({
      where: {
        actorId: user.id,
        action: { in: ['AUTH_LOGIN', 'AUTH_LOGOUT'] }
      },
      select: { action: true }
    });
    expect(auditActions.map((entry) => entry.action).sort()).toEqual([
      'AUTH_LOGIN',
      'AUTH_LOGOUT'
    ]);
  });

  it('does not reveal whether the email exists', async () => {
    const email = `planner-${randomUUID()}@example.com`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword('valid password for this account'),
        role: UserRole.PLATFORM_ADMIN,
        clientId: null
      }
    });

    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email, password: 'wrong password' })
      .expect(401);

    const missingUser = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email: `missing-${randomUUID()}@example.com`, password: 'wrong password' })
      .expect(401);

    expect(pickError(wrongPassword.body)).toEqual(pickError(missingUser.body));
    expect(pickError(wrongPassword.body)).toEqual({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.'
    });

    const failedAudits = await prisma.auditLog.findMany({
      where: { action: 'AUTH_LOGIN_FAILED' },
      orderBy: { occurredAt: 'desc' },
      take: 2
    });
    expect(failedAudits).toHaveLength(2);
    expect(JSON.stringify(failedAudits)).not.toContain(email);
  });

  it('rejects unsafe requests from an untrusted browser origin', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://malicious.example')
      .send({ email: 'admin@example.com', password: 'not relevant' })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'UNTRUSTED_ORIGIN'
        });
      });
  });
});

function pickError(body: Record<string, unknown>): Record<string, unknown> {
  return {
    statusCode: body.statusCode,
    code: body.code,
    message: body.message
  };
}
