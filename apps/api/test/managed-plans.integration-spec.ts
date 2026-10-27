import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { ManagedPlanModality, ManagedPlanTier, type ManagedPlanVersion } from '../src/generated/prisma/client';

const origin = 'http://localhost:5173';
const password = 'PR02 integration password';

describe('PR02 managed commercial plan catalog', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const actors: string[] = [];
  const clients: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('An isolated test database is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_PATH = '/';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterEach(async () => {
    // Test fixtures only, inside the harness's disposable database. Restore seeded history after each case.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.managedPlanOperation.deleteMany({ where: { actorUserId: { in: actors } } });
      await tx.managedPlanVersion.deleteMany({ where: { createdByUserId: { in: actors } } });
      await tx.managedPlanVersion.updateMany({ where: { createdByUserId: null }, data: { validUntil: null } });
      await tx.managedPlan.updateMany({ data: { isAvailable: true } });
      await tx.authSession.deleteMany({ where: { userId: { in: actors } } });
      await tx.user.deleteMany({ where: { id: { in: actors } } });
      await tx.client.deleteMany({ where: { id: { in: clients } } });
    });
    actors.length = 0;
    clients.length = 0;
  });
  afterAll(async () => {
    await app.close();
  });

  async function provider() {
    const user = await prisma.user.create({
      data: {
        email: `pr02-${randomUUID()}@example.com`,
        passwordHash: await hashPassword(password),
        role: 'PLATFORM_ADMIN'
      }
    });
    actors.push(user.id);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return { user, cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; ') };
  }
  async function plan() {
    const found = await prisma.managedPlan.findUniqueOrThrow({
      where: { modality_tier: { modality: 'STANDARD', tier: 'FREQUENT' } },
      include: { versions: true }
    });
    return { plan: found, version: found.versions.find((version) => version.createdByUserId === null)! };
  }
  function payload(version: ManagedPlanVersion) {
    return {
      commercialName: version.commercialName,
      monthlyAmountMxnCents: version.monthlyAmountMxnCents,
      initialFeeMxnCents: version.initialFeeMxnCents,
      extraEventAmountMxnCents: version.extraEventAmountMxnCents,
      contractMonths: version.contractMonths,
      includedEventsPerMonth: version.includedEventsPerMonth,
      monthlyEventLimit: version.monthlyEventLimit,
      includedEventsPerYear: version.includedEventsPerYear,
      eventCapacity: version.eventCapacity
    };
  }
  function post(path: string, cookie: string, body: object, key = randomUUID()) {
    return request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send(body);
  }

  it('installs the six offerings as independent cent-denominated configurations', async () => {
    const { cookie } = await provider();
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/managed-plans')
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body).toHaveLength(6);
    for (const row of response.body) {
      const version = row.versions.find((value: { id: string }) => value.id === row.currentVersionId);
      const index = [ManagedPlanTier.ESSENTIAL, ManagedPlanTier.FREQUENT, ManagedPlanTier.INTENSIVE].indexOf(row.tier);
      expect(version).toMatchObject({
        monthlyAmountMxnCents:
          [790000, 990000, 1290000][index]! + (row.modality === ManagedPlanModality.PRIVATE ? 100000 : 0),
        initialFeeMxnCents: row.modality === 'PRIVATE' ? 3990000 : 490000,
        extraEventAmountMxnCents: 125000,
        contractMonths: 12,
        eventCapacity: 150,
        includedEventsPerMonth: [4, 8, 12][index],
        monthlyEventLimit: [4, 12, 12][index],
        includedEventsPerYear: index === 1 ? 96 : null,
        createdByUserId: null,
        status: 'CURRENT'
      });
    }
  });

  it('creates an immediate immutable version, closes the previous validity and replays without duplicate audit', async () => {
    const { cookie, user } = await provider();
    const { plan: target, version } = await plan();
    const key = randomUUID();
    const data = { ...payload(version), monthlyAmountMxnCents: 1000001, extraEventAmountMxnCents: 125001 };
    const first = await post(`/admin/managed-plans/${target.id}/versions`, cookie, data, key).expect(201);
    expect(first.body).toMatchObject({
      monthlyAmountMxnCents: 1000001,
      extraEventAmountMxnCents: 125001,
      status: 'CURRENT',
      createdByUserId: user.id
    });
    expect(
      await (
        await post(`/admin/managed-plans/${target.id}/versions`, cookie, data, key).expect(201)
      ).body
    ).toEqual(first.body);
    const old = await prisma.managedPlanVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(old.monthlyAmountMxnCents).toBe(version.monthlyAmountMxnCents);
    expect(old.validFrom).toEqual(version.validFrom);
    expect(old.validUntil?.toISOString()).toBe(first.body.validFrom);
    expect(
      await prisma.auditLog.count({ where: { resourceId: first.body.id, action: 'MANAGED_PLAN_VERSION_CREATE' } })
    ).toBe(1);
    await post(
      `/admin/managed-plans/${target.id}/versions`,
      cookie,
      { ...data, monthlyAmountMxnCents: 999999 },
      key
    ).expect(409);
  });

  it('preserves current, scheduled and historical distinctions without overlapping future prices', async () => {
    const { cookie } = await provider();
    const { plan: target, version } = await plan();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const first = await post(`/admin/managed-plans/${target.id}/versions`, cookie, {
      ...payload(version),
      monthlyAmountMxnCents: 1010000,
      validFrom: future
    }).expect(201);
    expect(first.body.status).toBe('FUTURE');
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/managed-plans')
      .set('Cookie', cookie)
      .expect(200);
    const current = response.body.find((row: { id: string }) => row.id === target.id);
    expect(current.currentVersionId).toBe(version.id);
    await post(`/admin/managed-plans/${target.id}/versions`, cookie, { ...payload(version), validFrom: future }).expect(
      409
    );
    await post(`/admin/managed-plans/${target.id}/versions`, cookie, {
      ...payload(version),
      validFrom: new Date(Date.now() - 60_000).toISOString()
    }).expect(400);
  });

  it('audits idempotent availability without changing prices or legacy finance dimensions', async () => {
    const { cookie } = await provider();
    const { plan: target } = await plan();
    const financeBefore = [
      await prisma.servicePrice.count(),
      await prisma.ledgerEntry.count(),
      await prisma.receipt.count(),
      await prisma.financeBalance.count()
    ];
    const key = randomUUID();
    const first = await post(
      `/admin/managed-plans/${target.id}/availability`,
      cookie,
      { isAvailable: false },
      key
    ).expect(201);
    expect(first.body.isAvailable).toBe(false);
    expect(
      (await post(`/admin/managed-plans/${target.id}/availability`, cookie, { isAvailable: false }, key).expect(201))
        .body
    ).toEqual(first.body);
    expect(
      await prisma.auditLog.count({ where: { resourceId: target.id, action: 'MANAGED_PLAN_AVAILABILITY_SET' } })
    ).toBe(1);
    expect([
      await prisma.servicePrice.count(),
      await prisma.ledgerEntry.count(),
      await prisma.receipt.count(),
      await prisma.financeBalance.count()
    ]).toEqual(financeBefore);
  });

  it('rejects non-Provider and missing sessions for catalog reads and mutations', async () => {
    const { plan: target, version } = await plan();
    const organization = await prisma.client.create({
      data: { name: 'PR02 denied Organization', type: 'ORGANIZATION', operatingProfile: 'MANAGED' }
    });
    clients.push(organization.id);
    const user = await prisma.user.create({
      data: {
        clientId: organization.id,
        email: `org-${randomUUID()}@example.com`,
        role: 'ORGANIZATION_ADMIN',
        passwordHash: await hashPassword(password)
      }
    });
    actors.push(user.id);
    const session = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: user.email, password })
      .expect(200);
    const cookie = (session.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    await request(app.getHttpServer()).get('/api/v1/admin/managed-plans').set('Cookie', cookie).expect(403);
    await post(`/admin/managed-plans/${target.id}/versions`, cookie, payload(version)).expect(403);
    await post(`/admin/managed-plans/${target.id}/availability`, cookie, { isAvailable: false }).expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/managed-plans').expect(401);
  });

  it('guards immutable terms, tier allowances and price validity in PostgreSQL', async () => {
    const { cookie } = await provider();
    const { plan: target, version } = await plan();
    await expect(
      prisma.managedPlanVersion.update({ where: { id: version.id }, data: { monthlyAmountMxnCents: 1 } })
    ).rejects.toThrow();
    await expect(prisma.managedPlanVersion.delete({ where: { id: version.id } })).rejects.toThrow();
    await post(`/admin/managed-plans/${target.id}/versions`, cookie, {
      ...payload(version),
      includedEventsPerYear: null
    }).expect(400);
    const essential = await prisma.managedPlan.findUniqueOrThrow({
      where: { modality_tier: { modality: 'STANDARD', tier: 'ESSENTIAL' } }
    });
    await post(`/admin/managed-plans/${essential.id}/versions`, cookie, payload(version)).expect(400);
  });

  it('rolls back the prior validity, new version and replay record when audit cannot commit', async () => {
    const { cookie } = await provider();
    const { plan: target, version } = await plan();
    const key = randomUUID();
    const countBefore = await prisma.managedPlanVersion.count({ where: { planId: target.id } });
    const audit = vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('Audit unavailable'));
    try {
      await post(`/admin/managed-plans/${target.id}/versions`, cookie, payload(version), key).expect(500);
      expect(await prisma.managedPlanVersion.count({ where: { planId: target.id } })).toBe(countBefore);
      expect((await prisma.managedPlanVersion.findUniqueOrThrow({ where: { id: version.id } })).validUntil).toBeNull();
      expect(await prisma.managedPlanOperation.findUnique({ where: { idempotencyKey: key } })).toBeNull();
    } finally {
      audit.mockRestore();
    }
  });
});
