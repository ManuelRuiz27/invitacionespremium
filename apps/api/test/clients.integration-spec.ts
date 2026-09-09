import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientOperatingProfile,
  ClientStatus,
  ClientType,
  CommercialChannel,
  UserRole
} from '../src/generated/prisma/client';

const trustedOrigin = 'http://localhost:5173';

describe('Clients and Client users', () => {
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
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';

    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.client.deleteMany();
  });

  afterAll(async () => {
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.client.deleteMany();
    await app.close();
  });

  it('registers an independent Planner atomically and isolates Client ownership', async () => {
    const first = await registerPlanner(`Planner ${randomUUID()}`, `planner-${randomUUID()}@example.com`);
    const second = await registerPlanner(`Planner ${randomUUID()}`, `planner-${randomUUID()}@example.com`);

    expect(first.body).toMatchObject({
      client: {
        type: ClientType.PLANNER,
        operatingProfile: null,
        status: ClientStatus.ACTIVE
      },
      user: {
        role: UserRole.INDEPENDENT_PLANNER
      }
    });
    expect(first.body).not.toHaveProperty('password');
    expect(first.body.user).not.toHaveProperty('passwordHash');
    expect(
      await prisma.client.findUniqueOrThrow({
        where: { id: String(first.body.client.id) },
        select: { operatingProfile: true }
      })
    ).toEqual({ operatingProfile: null });

    const cookie = await login(first.body.user.email as string, registrationPassword());

    await request(app.getHttpServer())
      .get(`/api/v1/clients/${String(first.body.client.id)}`)
      .set('Cookie', cookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(first.body.client.id);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/clients/${String(second.body.client.id)}`)
      .set('Cookie', cookie)
      .expect(404)
      .expect((response) => {
        expect(response.body.code).toBe('CLIENT_NOT_FOUND');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/clients/${String(first.body.client.id)}/users/planner`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ email: `internal-${randomUUID()}@example.com`, password: registrationPassword() })
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe('ROLE_FORBIDDEN');
      });

    await request(app.getHttpServer())
      .post('/api/v1/clients/register-planner')
      .set('Origin', trustedOrigin)
      .send({
        name: 'Duplicate email',
        email: first.body.user.email,
        password: registrationPassword()
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('EMAIL_ALREADY_EXISTS');
      });
  });

  it('allows only Platform Admin to classify the operating profile independently from Client type and channel', async () => {
    const registered = await registerPlanner(`Planner ${randomUUID()}`, `planner-${randomUUID()}@example.com`);
    const clientId = String(registered.body.client.id);
    const plannerCookie = await login(String(registered.body.user.email), registrationPassword());
    const platformAdmin = await createPlatformAdmin();
    const platformCookie = await login(platformAdmin.email, platformAdmin.password);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({ operatingProfile: ClientOperatingProfile.MANAGED })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: clientId,
          type: ClientType.PLANNER,
          operatingProfile: ClientOperatingProfile.MANAGED,
          commercialChannel: null
        });
      });

    const managedAudit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: clientId, action: 'CLIENT_OPERATING_PROFILE_UPDATE' },
      orderBy: { occurredAt: 'desc' }
    });
    expect(managedAudit.beforeData).toMatchObject({ operatingProfile: null });
    expect(managedAudit.afterData).toMatchObject({ operatingProfile: ClientOperatingProfile.MANAGED });

    await request(app.getHttpServer())
      .patch(`/api/v1/clients/${clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', plannerCookie)
      .send({ operatingProfile: ClientOperatingProfile.SELF_SERVICE })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({ operatingProfile: null })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({
        operatingProfile: ClientOperatingProfile.SELF_SERVICE,
        commercialChannel: CommercialChannel.PARTNER
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          type: ClientType.PLANNER,
          operatingProfile: ClientOperatingProfile.SELF_SERVICE,
          commercialChannel: CommercialChannel.PARTNER
        });
      });

    const selfServiceAudit = await prisma.auditLog.findFirstOrThrow({
      where: { resourceId: clientId, action: 'CLIENT_OPERATING_PROFILE_UPDATE' },
      orderBy: { occurredAt: 'desc' }
    });
    expect(selfServiceAudit.beforeData).toMatchObject({
      operatingProfile: ClientOperatingProfile.MANAGED,
      commercialChannel: null
    });
    expect(selfServiceAudit.afterData).toMatchObject({
      operatingProfile: ClientOperatingProfile.SELF_SERVICE,
      commercialChannel: CommercialChannel.PARTNER
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({ commercialChannel: CommercialChannel.VENUE })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          operatingProfile: ClientOperatingProfile.SELF_SERVICE,
          commercialChannel: CommercialChannel.VENUE
        });
      });

    await request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${clientId}`)
      .set('Cookie', platformCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.operatingProfile).toBe(ClientOperatingProfile.SELF_SERVICE);
      });
  });

  it('lets Platform Admin create and suspend an Organization without impersonation', async () => {
    const platformAdmin = await createPlatformAdmin();
    const platformCookie = await login(platformAdmin.email, platformAdmin.password);
    const organizationAdminEmail = `org-admin-${randomUUID()}@example.com`;
    const organizationAdminPassword = registrationPassword();

    const organizationResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/clients/organizations')
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({
        name: 'Organización de prueba',
        adminEmail: organizationAdminEmail,
        adminPassword: organizationAdminPassword
      })
      .expect(201);

    const clientId = String(organizationResponse.body.client.id);
    expect(organizationResponse.body).toMatchObject({
      client: {
        type: ClientType.ORGANIZATION,
        status: ClientStatus.ACTIVE
      },
      user: {
        email: organizationAdminEmail,
        role: UserRole.ORGANIZATION_ADMIN,
        clientId
      }
    });

    await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}`)
      .set('Cookie', platformCookie)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe('ROLE_FORBIDDEN');
      });

    const createdPlanner = await request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/users/planner`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({
        email: `org-planner-${randomUUID()}@example.com`,
        password: registrationPassword()
      })
      .expect(201);

    const organizationCookie = await login(organizationAdminEmail, organizationAdminPassword);

    await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}/users`)
      .set('Cookie', organizationCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
      });

    const plannerCookie = await login(createdPlanner.body.email as string, registrationPassword());
    await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}/users`)
      .set('Cookie', plannerCookie)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe('ROLE_FORBIDDEN');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/suspend`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .send({ reason: 'Validación operativa' })
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe(ClientStatus.SUSPENDED);
      });

    const suspendedCookie = await login(organizationAdminEmail, organizationAdminPassword);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', suspendedCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          clientId,
          clientType: ClientType.ORGANIZATION,
          clientStatus: ClientStatus.SUSPENDED
        });
      });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/restore`)
      .set('Origin', trustedOrigin)
      .set('Cookie', platformCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body.status).toBe(ClientStatus.ACTIVE);
        expect(response.body.suspendedAt).toBeNull();
      });
  });

  it('enforces role and Client type compatibility in PostgreSQL', async () => {
    const organization = await prisma.client.create({
      data: {
        type: ClientType.ORGANIZATION,
        name: 'Organización incompatible'
      }
    });

    await expect(
      prisma.user.create({
        data: {
          email: `invalid-${randomUUID()}@example.com`,
          passwordHash: await hashPassword(registrationPassword()),
          role: UserRole.INDEPENDENT_PLANNER,
          clientId: organization.id
        }
      })
    ).rejects.toThrow();
  });

  async function registerPlanner(name: string, email: string) {
    return request(app.getHttpServer())
      .post('/api/v1/clients/register-planner')
      .set('Origin', trustedOrigin)
      .send({ name, email, password: registrationPassword() })
      .expect(201);
  }

  async function createPlatformAdmin(): Promise<{ email: string; password: string }> {
    const email = `platform-${randomUUID()}@example.com`;
    const password = registrationPassword();
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: UserRole.PLATFORM_ADMIN,
        clientId: null
      }
    });

    return { email, password };
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email, password })
      .expect(200);
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const cookie = cookieHeader?.split(';')[0];

    if (!cookie) {
      throw new Error('Login did not return a session cookie.');
    }

    return cookie;
  }
});

function registrationPassword(): string {
  return 'correct horse battery staple';
}
