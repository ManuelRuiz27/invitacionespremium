import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { ClientType, CommercialOpportunityType, UserRole } from '../src/generated/prisma/client';

const trustedOrigin = 'http://localhost:5176';
const endpoint = '/api/v1/public/commercial-leads';

describe('LAND-02 commercial lead intake', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests.');
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = trustedOrigin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    process.env.PHONE_DEFAULT_REGION = 'MX';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('accepts Planner and Venue leads, normalizes email/phone and creates one sanitized audit without side effects', async () => {
    const operationId = randomUUID();
    const before = await sideEffectCounts(prisma);
    await postLead(
      validLead({
        email: '  MARIA.LOPEZ@EXAMPLE.COM  ',
        phone: '55 1234 5678',
        contactName: '  María López  ',
        businessName: '  Eventos Aurora  ',
        notes: '  Cuatro bodas por mes.  '
      }),
      operationId
    ).expect(201, { accepted: true });
    await postLead(validLead({ opportunityType: CommercialOpportunityType.VENUE, email: 'venue@example.com' })).expect(
      201,
      { accepted: true }
    );

    const planner = await prisma.commercialLead.findFirstOrThrow({ where: { email: 'maria.lopez@example.com' } });
    expect(planner).toMatchObject({
      opportunityType: CommercialOpportunityType.PLANNER_AGENCY,
      contactName: 'María López',
      businessName: 'Eventos Aurora',
      email: 'maria.lopez@example.com',
      phone: '+525512345678',
      notes: 'Cuatro bodas por mes.'
    });
    expect(await sideEffectCounts(prisma)).toEqual(before);

    const audits = await prisma.auditLog.findMany({ where: { resourceType: 'COMMERCIAL_LEAD' } });
    expect(audits).toHaveLength(2);
    const audit = audits.find((entry) => entry.resourceId === planner.id)!;
    expect(audit).toMatchObject({
      actorType: 'SYSTEM',
      actorId: null,
      actorFingerprint: null,
      action: 'COMMERCIAL_LEAD_CREATE',
      operationId,
      beforeData: null,
      metadata: { source: 'LANDING' }
    });
    expect(audit.afterData).toEqual({ opportunityType: 'PLANNER_AGENCY', createdAt: planner.createdAt.toISOString() });
    const serializedAudit = JSON.stringify(audit);
    for (const forbidden of [
      'María López',
      'Eventos Aurora',
      'maria.lopez@example.com',
      '+525512345678',
      'Cuatro bodas',
      planner.submissionId
    ])
      expect(serializedAudit).not.toContain(forbidden);
  });

  it('enforces privacy and strict DTO validation while silently discarding the honeypot', async () => {
    await postLead({ ...validLead(), privacyAccepted: false }).expect(400);
    await postLead({ ...validLead(), unknown: 'field' }).expect(400);
    await postLead({ ...validLead(), submissionId: 'not-a-uuid' }).expect(400);
    await postLead({ ...validLead(), website: 'https://spam.example' }).expect(201, { accepted: true });
    expect(await prisma.commercialLead.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { resourceType: 'COMMERCIAL_LEAD' } })).toBe(0);
  });

  it('resolves normalized submission idempotency and rejects a changed payload', async () => {
    const submissionId = randomUUID();
    await postLead(validLead({ submissionId, email: ' ID@example.com ' })).expect(201);
    await postLead(validLead({ submissionId, email: 'id@EXAMPLE.com' })).expect(201);
    expect(await prisma.commercialLead.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceType: 'COMMERCIAL_LEAD' } })).toBe(1);
    await postLead(validLead({ submissionId, email: 'other@example.com' }))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('COMMERCIAL_LEAD_IDEMPOTENCY_CONFLICT'));
  });

  it('deduplicates an exact reload with a new submission id without consuming quota or audit', async () => {
    const lead = validLead({ email: 'reload@example.com' });
    await postLead(lead).expect(201);
    await postLead({ ...lead, submissionId: randomUUID() }).expect(201);
    expect(await prisma.commercialLead.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceType: 'COMMERCIAL_LEAD' } })).toBe(1);
  });

  it('permits three distinct leads per email in one hour and rate-limits the fourth', async () => {
    for (let index = 1; index <= 3; index += 1) {
      await postLead(
        validLead({ email: 'rate@example.com', businessName: `Empresa ${index}`, notes: `Solicitud ${index}` })
      ).expect(201);
    }
    await postLead(validLead({ email: 'rate@example.com', businessName: 'Empresa 4', notes: 'Solicitud 4' }))
      .expect(429)
      .expect(({ body }) => expect(body.code).toBe('COMMERCIAL_LEAD_RATE_LIMITED'));
    expect(await prisma.commercialLead.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { resourceType: 'COMMERCIAL_LEAD' } })).toBe(3);
  });

  it('serializes concurrent exact submissions into one lead and one audit', async () => {
    const lead = validLead({ email: 'concurrent@example.com' });
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postLead({ ...lead, submissionId: randomUUID() }))
    );
    expect(responses.every((response) => response.status === 201 && response.body.accepted === true)).toBe(true);
    expect(await prisma.commercialLead.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { resourceType: 'COMMERCIAL_LEAD' } })).toBe(1);
  });

  it('allows only Platform Admin to list/filter/get and keeps write routes unavailable', async () => {
    const plannerLead = await createLead(validLead({ email: 'admin-planner@example.com' }));
    await createLead(validLead({ opportunityType: CommercialOpportunityType.VENUE, email: 'admin-venue@example.com' }));
    const adminCookie = await createSession(UserRole.PLATFORM_ADMIN);
    const plannerCookie = await createSession(UserRole.INDEPENDENT_PLANNER);

    const page = await request(app.getHttpServer())
      .get('/api/v1/admin/commercial-leads?opportunityType=PLANNER_AGENCY&limit=1')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.items[0]).toMatchObject({ id: plannerLead.id, email: plannerLead.email });
    expect(page.body.items[0]).not.toHaveProperty('submissionId');
    expect(page.body.nextCursor).toBeNull();

    await request(app.getHttpServer())
      .get(`/api/v1/admin/commercial-leads/${plannerLead.id}`)
      .set('Cookie', adminCookie)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(plannerLead.id));
    await request(app.getHttpServer()).get('/api/v1/admin/commercial-leads').set('Cookie', plannerCookie).expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/commercial-leads').expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/commercial-leads/${randomUUID()}`)
      .set('Cookie', adminCookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/commercial-leads/${plannerLead.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .send({ notes: 'forbidden' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/commercial-leads/${plannerLead.id}`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .expect(404);
  });

  function postLead(body: Record<string, unknown>, operationId = randomUUID()) {
    return request(app.getHttpServer())
      .post(endpoint)
      .set('Origin', trustedOrigin)
      .set('x-operation-id', operationId)
      .send(body);
  }

  async function createLead(body: Record<string, unknown>) {
    await postLead(body).expect(201);
    return prisma.commercialLead.findUniqueOrThrow({ where: { submissionId: String(body.submissionId) } });
  }

  async function createSession(role: UserRole) {
    const password = 'correct horse battery staple';
    const email = `${role.toLowerCase()}-${randomUUID()}@land02.test`;
    const client =
      role === UserRole.PLATFORM_ADMIN
        ? null
        : await prisma.client.create({ data: { name: `LAND02 test ${randomUUID()}`, type: ClientType.PLANNER } });
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId: client?.id ?? null }
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email, password })
      .expect(200);
    const setCookie = login.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    return String(cookie).split(';')[0]!;
  }
});

function validLead(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: randomUUID(),
    opportunityType: CommercialOpportunityType.PLANNER_AGENCY,
    contactName: 'María López',
    businessName: 'Eventos Aurora',
    email: `lead-${randomUUID()}@example.com`,
    phone: null,
    estimatedEventsPerMonth: 4,
    notes: 'Seguimiento comercial',
    privacyAccepted: true,
    website: '',
    ...overrides
  };
}

async function sideEffectCounts(prisma: PrismaService) {
  const [clients, users, events, servicePrices, promotions, financeBalances, ledgerEntries, receipts] =
    await Promise.all([
      prisma.client.count(),
      prisma.user.count(),
      prisma.event.count(),
      prisma.servicePrice.count(),
      prisma.promotion.count(),
      prisma.financeBalance.count(),
      prisma.ledgerEntry.count(),
      prisma.receipt.count()
    ]);
  return { clients, users, events, servicePrices, promotions, financeBalances, ledgerEntries, receipts };
}

async function resetDatabase(prisma: PrismaService) {
  await prisma.authSession.deleteMany();
  await prisma.user.deleteMany({ where: { email: { endsWith: '@land02.test' } } });
  await prisma.client.deleteMany({ where: { name: { startsWith: 'LAND02 test ' } } });
  await prisma.$executeRawUnsafe(`
    BEGIN;
    SET LOCAL session_replication_role = replica;
    TRUNCATE TABLE "commercial_lead", "audit_log" RESTART IDENTITY;
    COMMIT;
  `);
}
