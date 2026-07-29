import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import { ClientType, PromotionScope, ServiceCode, UserRole } from '../src/generated/prisma/client';
import { ServicesPricingService } from '../src/services-pricing/services-pricing.service';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const execFileAsync = promisify(execFile);

describe('Services, prices, and promotions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servicesPricing: ServicesPricingService;

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
    servicesPricing = app.get(ServicesPricingService);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedInitialCatalog();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  });

  it('contains four services and eight initial Planner and Organization prices', async () => {
    expect(await prisma.service.count()).toBe(4);
    expect(await prisma.servicePrice.count()).toBe(8);

    const prices = await prisma.servicePrice.findMany({
      include: { service: true },
      orderBy: [{ clientType: 'asc' }, { service: { code: 'asc' } }]
    });
    const priceMap = new Map(prices.map((price) => [`${price.clientType}:${price.service.code}`, price.credits]));

    expect(priceMap).toMatchObject(
      new Map([
        [`${ClientType.PLANNER}:${ServiceCode.FLIPBOOK}`, 30],
        [`${ClientType.PLANNER}:${ServiceCode.FLYER}`, 20],
        [`${ClientType.PLANNER}:${ServiceCode.PHYSICAL_QR}`, 15],
        [`${ClientType.PLANNER}:${ServiceCode.DEMO}`, 0],
        [`${ClientType.ORGANIZATION}:${ServiceCode.FLIPBOOK}`, 27],
        [`${ClientType.ORGANIZATION}:${ServiceCode.FLYER}`, 17],
        [`${ClientType.ORGANIZATION}:${ServiceCode.PHYSICAL_QR}`, 10],
        [`${ClientType.ORGANIZATION}:${ServiceCode.DEMO}`, 0]
      ])
    );
  });

  it('derives prices from the authenticated Client type, including an Organization Planner', async () => {
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organizationPlanner = await createOperationalUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_PLANNER);
    const plannerCookie = await login(planner.email);
    const organizationCookie = await login(organizationPlanner.email);

    const plannerResponse = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Cookie', plannerCookie)
      .expect(200);
    const organizationResponse = await request(app.getHttpServer())
      .get('/api/v1/services')
      .set('Cookie', organizationCookie)
      .expect(200);

    expect(creditsFor(plannerResponse.body, ServiceCode.FLIPBOOK)).toBe(30);
    expect(creditsFor(organizationResponse.body, ServiceCode.FLIPBOOK)).toBe(27);
    expect(creditsFor(organizationResponse.body, ServiceCode.PHYSICAL_QR)).toBe(10);
  });

  it('resolves exactly one current price or a stable domain error', async () => {
    await expect(
      servicesPricing.resolveCurrentPrice(ServiceCode.FLIPBOOK, ClientType.ORGANIZATION)
    ).resolves.toMatchObject({
      serviceCode: ServiceCode.FLIPBOOK,
      clientType: ClientType.ORGANIZATION,
      credits: 27
    });

    await expect(
      servicesPricing.resolveCurrentPrice(
        ServiceCode.FLIPBOOK,
        ClientType.ORGANIZATION,
        new Date('2000-01-01T00:00:00.000Z')
      )
    ).rejects.toMatchObject({
      response: {
        code: 'CURRENT_PRICE_NOT_FOUND'
      }
    });
  });

  it('forbids Client users from administrative routes', async () => {
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const cookie = await login(planner.email);

    await request(app.getHttpServer())
      .get('/api/v1/admin/prices')
      .set('Cookie', cookie)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe('ROLE_FORBIDDEN');
      });
  });

  it('rejects nonzero DEMO prices in the API and PostgreSQL', async () => {
    const cookie = await createPlatformAdminCookie();
    const demo = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.DEMO } });

    await request(app.getHttpServer())
      .post('/api/v1/admin/prices')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({
        serviceId: demo.id,
        clientType: ClientType.PLANNER,
        credits: 1,
        validFrom: futureIso(60)
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('DEMO_PRICE_MUST_BE_ZERO');
      });

    await expect(
      prisma.servicePrice.create({
        data: {
          serviceId: demo.id,
          clientType: ClientType.PLANNER,
          credits: 1,
          validFrom: new Date('2035-01-01T00:00:00.000Z'),
          validUntil: new Date('2035-02-01T00:00:00.000Z')
        }
      })
    ).rejects.toThrow();
  });

  it('rejects overlapping price ranges and serializes concurrent replacements', async () => {
    const cookie = await createPlatformAdminCookie();
    const flyer = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.FLYER } });
    const firstStart = futureIso(120);
    const firstEnd = futureIso(240);

    await request(app.getHttpServer())
      .post('/api/v1/admin/prices')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({
        serviceId: flyer.id,
        clientType: ClientType.PLANNER,
        credits: 21,
        validFrom: firstStart,
        validUntil: firstEnd
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/admin/prices')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({
        serviceId: flyer.id,
        clientType: ClientType.PLANNER,
        credits: 22,
        validFrom: futureIso(180),
        validUntil: futureIso(300)
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('PRICE_OVERLAP');
      });

    const flipbook = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.FLIPBOOK } });
    const concurrent = await Promise.all(
      [31, 32].map((credits) =>
        request(app.getHttpServer())
          .post('/api/v1/admin/prices')
          .set('Origin', trustedOrigin)
          .set('Cookie', cookie)
          .send({
            serviceId: flipbook.id,
            clientType: ClientType.PLANNER,
            credits,
            validFrom: futureIso(360)
          })
      )
    );

    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);
    const futurePrices = await prisma.servicePrice.count({
      where: {
        serviceId: flipbook.id,
        clientType: ClientType.PLANNER,
        validFrom: { gt: new Date() }
      }
    });
    expect(futurePrices).toBe(1);
  });

  it('only closes open price validity and preserves historical fields', async () => {
    const cookie = await createPlatformAdminCookie();
    const price = await prisma.servicePrice.findFirstOrThrow({
      where: { service: { code: ServiceCode.PHYSICAL_QR }, clientType: ClientType.PLANNER }
    });
    const validUntil = futureIso(120);

    const closed = await request(app.getHttpServer())
      .patch(`/api/v1/admin/prices/${price.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ validUntil })
      .expect(200);

    expect(closed.body).toMatchObject({
      id: price.id,
      serviceId: price.serviceId,
      clientType: price.clientType,
      credits: price.credits,
      validFrom: price.validFrom.toISOString(),
      validUntil
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/prices/${price.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ validUntil: futureIso(240) })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('PRICE_HISTORY_IMMUTABLE');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/prices/${price.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ credits: 999, validUntil: futureIso(240) })
      .expect(400);
  });

  it('evaluates active, inactive, and expired promotion eligibility without financial calculation', async () => {
    const cookie = await createPlatformAdminCookie();
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const flyer = await prisma.service.findUniqueOrThrow({ where: { code: ServiceCode.FLYER } });
    const activePromotion = await createPromotion(cookie, {
      name: 'Planner Flyer',
      scope: PromotionScope.EVENT_ACTIVATION,
      clientType: ClientType.PLANNER,
      serviceId: flyer.id,
      validFrom: pastIso(60),
      validUntil: futureIso(60),
      allowsStacking: true
    });
    const inactivePromotion = await createPromotion(cookie, {
      name: 'Inactive',
      scope: PromotionScope.EVENT_ACTIVATION,
      validFrom: pastIso(60),
      validUntil: futureIso(60),
      allowsStacking: false
    });
    const expiredPromotion = await createPromotion(cookie, {
      name: 'Expired',
      scope: PromotionScope.EVENT_ACTIVATION,
      validFrom: pastIso(120),
      validUntil: pastIso(60),
      allowsStacking: false
    });

    await activatePromotion(cookie, activePromotion.id);
    await activatePromotion(cookie, expiredPromotion.id);
    const eligible = await servicesPricing.findEligiblePromotions({
      scope: PromotionScope.EVENT_ACTIVATION,
      clientId: planner.clientId,
      clientType: ClientType.PLANNER,
      serviceId: flyer.id
    });

    expect(eligible.map((promotion) => promotion.id)).toEqual([activePromotion.id]);
    expect(eligible[0]?.allowsStacking).toBe(true);
    expect(eligible.map((promotion) => promotion.id)).not.toContain(inactivePromotion.id);
    expect(eligible.map((promotion) => promotion.id)).not.toContain(expiredPromotion.id);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/promotions/${activePromotion.id}/deactivate`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .expect(200);
    expect(
      await servicesPricing.findEligiblePromotions({
        scope: PromotionScope.EVENT_ACTIVATION,
        clientId: planner.clientId,
        clientType: ClientType.PLANNER,
        serviceId: flyer.id
      })
    ).toHaveLength(0);
  });

  it('requires a targeted promotion clientType to match the real Client type', async () => {
    const cookie = await createPlatformAdminCookie();
    const planner = await createOperationalUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const basePromotion = {
      name: 'Targeted Planner',
      scope: PromotionScope.CREDIT_PURCHASE,
      clientId: planner.clientId,
      validFrom: pastIso(1),
      validUntil: futureIso(60),
      allowsStacking: false
    };

    await request(app.getHttpServer())
      .post('/api/v1/admin/promotions')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ ...basePromotion, clientType: ClientType.ORGANIZATION })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('PROMOTION_CLIENT_TYPE_MISMATCH');
      });

    const compatible = await request(app.getHttpServer())
      .post('/api/v1/admin/promotions')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ ...basePromotion, clientType: ClientType.PLANNER })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/promotions/${String(compatible.body.id)}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send({ clientType: ClientType.ORGANIZATION })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('PROMOTION_CLIENT_TYPE_MISMATCH');
      });
  });

  it('runs the real services-pricing seed twice without duplicating services or prices', async () => {
    await prisma.servicePrice.deleteMany();
    await prisma.service.deleteMany();

    const firstRun = await runSeedScript();
    const secondRun = await runSeedScript();
    const services = await prisma.service.findMany({ orderBy: { code: 'asc' } });
    const prices = await prisma.servicePrice.findMany({
      orderBy: [{ serviceId: 'asc' }, { clientType: 'asc' }, { validFrom: 'asc' }]
    });
    const uniquePrices = new Set(
      prices.map((price) => `${price.serviceId}:${price.clientType}:${price.validFrom.toISOString()}`)
    );

    expect(firstRun).toContain('"pricesCreated":8');
    expect(secondRun).toContain('"pricesCreated":0');
    expect(services.map((service) => service.code).sort()).toEqual(Object.values(ServiceCode).sort());
    expect(prices).toHaveLength(8);
    expect(uniquePrices.size).toBe(8);
  }, 30_000);

  it('audits mutations and publishes the complete OpenAPI contract', async () => {
    const cookie = await createPlatformAdminCookie();
    const created = await createPromotion(cookie, {
      name: 'Audited',
      scope: PromotionScope.CREDIT_PURCHASE,
      validFrom: pastIso(1),
      validUntil: futureIso(60),
      allowsStacking: false
    });
    await activatePromotion(cookie, created.id);

    const actions = await prisma.auditLog.findMany({
      where: { resourceType: 'PROMOTION', resourceId: created.id },
      orderBy: { occurredAt: 'asc' },
      select: { action: true, actorType: true }
    });
    expect(actions).toMatchObject([{ action: 'PROMOTION_ACTIVATE', actorType: 'USER' }]);
    expect(
      await prisma.auditLog.count({
        where: { resourceType: 'PROMOTION', action: 'PROMOTION_CREATE' }
      })
    ).toBeGreaterThan(0);

    const openApi = await request(app.getHttpServer()).get('/docs-json').expect(200);
    const paths = openApi.body.paths as Record<string, unknown>;
    expect(paths).toHaveProperty('/api/v1/services');
    expect(paths).toHaveProperty('/api/v1/admin/services');
    expect(paths).toHaveProperty('/api/v1/admin/services/{serviceId}');
    expect(paths).toHaveProperty('/api/v1/admin/prices');
    expect(paths).toHaveProperty('/api/v1/admin/prices/{priceId}');
    expect(paths).toHaveProperty('/api/v1/admin/promotions');
    expect(paths).toHaveProperty('/api/v1/admin/promotions/{promotionId}');
    expect(paths).toHaveProperty('/api/v1/admin/promotions/{promotionId}/activate');
    expect(paths).toHaveProperty('/api/v1/admin/promotions/{promotionId}/deactivate');
  });

  async function resetDatabase(): Promise<void> {
    await prisma.promotion.deleteMany();
    await prisma.servicePrice.deleteMany();
    await prisma.service.deleteMany();
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.client.deleteMany();
  }

  async function seedInitialCatalog(): Promise<void> {
    const services = await Promise.all(
      Object.values(ServiceCode).map((code) => prisma.service.create({ data: { code } }))
    );
    const ids = new Map(services.map((service) => [service.code, service.id]));
    const validFrom = new Date(Date.now() - 60_000);
    const prices: Record<ClientType, Record<ServiceCode, number>> = {
      [ClientType.PLANNER]: {
        [ServiceCode.FLIPBOOK]: 30,
        [ServiceCode.FLYER]: 20,
        [ServiceCode.PHYSICAL_QR]: 15,
        [ServiceCode.DEMO]: 0
      },
      [ClientType.ORGANIZATION]: {
        [ServiceCode.FLIPBOOK]: 27,
        [ServiceCode.FLYER]: 17,
        [ServiceCode.PHYSICAL_QR]: 10,
        [ServiceCode.DEMO]: 0
      }
    };

    await prisma.servicePrice.createMany({
      data: Object.values(ClientType).flatMap((clientType) =>
        Object.values(ServiceCode).map((code) => ({
          serviceId: requiredId(ids, code),
          clientType,
          credits: prices[clientType][code],
          validFrom
        }))
      )
    });
  }

  async function createOperationalUser(clientType: ClientType, role: UserRole) {
    const client = await prisma.client.create({
      data: { type: clientType, name: `Client ${randomUUID()}` }
    });
    const email = `${randomUUID()}@example.com`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role,
        clientId: client.id
      }
    });

    return { clientId: client.id, email };
  }

  async function createPlatformAdminCookie(): Promise<string> {
    const email = `${randomUUID()}@example.com`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: UserRole.PLATFORM_ADMIN
      }
    });

    return login(email);
  }

  async function login(email: string): Promise<string> {
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

  async function createPromotion(cookie: string, body: Record<string, unknown>) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/promotions')
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .send(body)
      .expect(201);

    return response.body as { id: string };
  }

  async function activatePromotion(cookie: string, promotionId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/promotions/${promotionId}/activate`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .expect(200);
  }

  async function runSeedScript(): Promise<string> {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required to execute the seed script.');
    }

    const workspaceRoot = resolve(__dirname, '../../..');
    const isWindows = process.platform === 'win32';
    const executable = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : 'pnpm';
    const args = isWindows
      ? ['/d', '/s', '/c', 'pnpm --filter @invitaciones/api services-pricing:seed']
      : ['--filter', '@invitaciones/api', 'services-pricing:seed'];
    const { stdout } = await execFileAsync(executable, args, {
      cwd: workspaceRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      maxBuffer: 1024 * 1024
    });

    return stdout;
  }
});

function requiredId(ids: Map<ServiceCode, string>, code: ServiceCode): string {
  const id = ids.get(code);

  if (!id) {
    throw new Error(`Missing service ${code}.`);
  }

  return id;
}

function creditsFor(body: unknown, code: ServiceCode): number | undefined {
  if (!Array.isArray(body)) {
    return undefined;
  }

  const service = body.find((entry: unknown) => {
    return typeof entry === 'object' && entry !== null && 'code' in entry && entry.code === code;
  });

  return typeof service === 'object' && service !== null && 'credits' in service && typeof service.credits === 'number'
    ? service.credits
    : undefined;
}

function futureIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function pastIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
