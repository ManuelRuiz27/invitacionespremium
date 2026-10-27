import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { addContractMonths } from '../src/managed-plans/managed-contract-dates';
import type { ManagedPlanVersion } from '../src/generated/prisma/client';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('PR02 Managed contracts and authoritative consumption', () => {
  let app: INestApplication, db: PrismaService, passwordHash: string;
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('An isolated DATABASE_URL is required.');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: origin,
      AUTH_COOKIE_SECURE: 'false',
      AUTH_COOKIE_SAME_SITE: 'lax',
      AUTH_COOKIE_PATH: '/'
    });
    app = await createApp();
    await app.init();
    db = app.get(PrismaService);
    passwordHash = await hashPassword(password);
  });
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await app.close();
  });

  it('assigns immutable MXN terms with real Provider audit and leaves permissions and Finance untouched', async () => {
    const f = await fixture();
    const beforeClient = await db.client.findUniqueOrThrow({ where: { id: f.client.id } });
    const beforePrices = await db.servicePrice.findMany();
    const assigned = await assign(f).expect(201);
    expect(assigned.body).toMatchObject({
      clientId: f.client.id,
      planVersionId: f.version.id,
      startsOn: f.today,
      endsOn: addContractMonths(f.today, 12),
      status: 'CURRENT',
      createdByUserId: f.provider.id,
      terms: {
        modality: 'STANDARD',
        tier: 'ESSENTIAL',
        monthlyAmountMxnCents: 790000,
        initialFeeMxnCents: 490000,
        extraEventAmountMxnCents: 125000,
        contractMonths: 12,
        currency: 'MXN',
        beforeTax: true,
        eventCapacity: 150,
        includedEventsPerMonth: 4
      }
    });
    const history = await get(`/admin/clients/${f.client.id}/managed-contracts`, f.providerCookie).expect(200);
    expect(history.body).toEqual([assigned.body]);
    expect(await db.client.findUniqueOrThrow({ where: { id: f.client.id } })).toEqual(beforeClient);
    expect(await db.servicePrice.findMany()).toEqual(beforePrices);
    expect(await db.event.count()).toBe(0);
    await expectNoFinance();
    const audit = await db.auditLog.findMany({ where: { action: 'MANAGED_CONTRACT_ASSIGN' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'USER',
      actorId: f.provider.id,
      clientId: f.client.id,
      resourceId: assigned.body.id,
      afterData: { terms: { monthlyAmountMxnCents: 790000 } }
    });
    await expect(
      db.managedPlanContract.update({ where: { id: assigned.body.id as string }, data: { terms: {} } })
    ).rejects.toThrow();
    await expect(db.managedPlanContract.delete({ where: { id: assigned.body.id as string } })).rejects.toThrow();
  });

  it('replays identical keys without duplicate contracts/audits and rejects a changed intent', async () => {
    const f = await fixture(),
      key = randomUUID();
    const results = await Promise.all([assign(f, key), assign(f, key)]);
    expect(results.map(({ status }) => status)).toEqual([201, 201]);
    expect(results[1]!.body).toEqual(results[0]!.body);
    expect(await db.managedPlanContract.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'MANAGED_CONTRACT_ASSIGN' } })).toBe(1);
    await post(
      `/admin/clients/${f.client.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: f.version.id, startsOn: addContractMonths(f.today, 12) },
      key
    )
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('MANAGED_PLAN_IDEMPOTENCY_CONFLICT'));
  });

  it('prevents concurrent overlapping contracts and preserves adjacent renewals as separate history', async () => {
    const f = await fixture();
    const results = await Promise.all([assign(f), assign(f)]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await db.managedPlanContract.count()).toBe(1);
    const current = results.find(({ status }) => status === 201)!;
    await post(
      `/admin/clients/${f.client.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: f.version.id, startsOn: current.body.endsOn },
      randomUUID()
    ).expect(201);
    const history = await get(`/admin/clients/${f.client.id}/managed-contracts`, f.providerCookie).expect(200);
    expect(history.body.map((row: { status: string }) => row.status)).toEqual(['FUTURE', 'CURRENT']);
  });

  it('keeps accepted terms after a price replacement while new contracts use the current accepted version', async () => {
    const f = await fixture();
    const old = await assign(f).expect(201);
    const replacement = await post(
      `/admin/managed-plans/${f.version.planId}/versions`,
      f.providerCookie,
      { ...versionInput(f.version), monthlyAmountMxnCents: 790001 },
      randomUUID()
    ).expect(201);
    const nextClient = await organization();
    await post(
      `/admin/clients/${nextClient.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: f.version.id, startsOn: f.today },
      randomUUID()
    ).expect(409);
    const accepted = await post(
      `/admin/clients/${nextClient.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: replacement.body.id, startsOn: f.today },
      randomUUID()
    ).expect(201);
    expect(accepted.body.terms.monthlyAmountMxnCents).toBe(790001);
    const oldAgain = await get(`/admin/clients/${f.client.id}/managed-contracts`, f.providerCookie).expect(200);
    expect(oldAgain.body[0].terms).toEqual(old.body.terms);
    await expectNoFinance();
  });

  it('requires a currently available version at acceptance rather than the future contract start', async () => {
    const f = await fixture();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const futureVersion = await post(
      `/admin/managed-plans/${f.version.planId}/versions`,
      f.providerCookie,
      { ...versionInput(f.version), validFrom: future, monthlyAmountMxnCents: 810000 },
      randomUUID()
    ).expect(201);
    const futureStart = addContractMonths(f.today, 1);
    await post(
      `/admin/clients/${f.client.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: futureVersion.body.id, startsOn: futureStart },
      randomUUID()
    ).expect(409);
    await post(
      `/admin/clients/${f.client.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: f.version.id, startsOn: futureStart },
      randomUUID()
    ).expect(201);
    const other = await organization();
    await post(
      `/admin/managed-plans/${f.version.planId}/availability`,
      f.providerCookie,
      { isAvailable: false },
      randomUUID()
    ).expect(201);
    await post(
      `/admin/clients/${other.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: f.version.id, startsOn: f.today },
      randomUUID()
    ).expect(409);
  });

  it('does not assign to Self-Service, Planner, suspended or missing Clients, and rejects non-Provider actors', async () => {
    const f = await fixture();
    const self = await db.client.create({
      data: { type: 'ORGANIZATION', operatingProfile: 'SELF_SERVICE', name: 'Self Service' }
    });
    const independent = await db.client.create({
      data: { type: 'PLANNER', operatingProfile: 'MANAGED', name: 'Independent' }
    });
    const suspended = await organization();
    await db.client.update({
      where: { id: suspended.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspensionReason: 'QA' }
    });
    for (const client of [self, independent, suspended]) {
      await post(
        `/admin/clients/${client.id}/managed-contracts`,
        f.providerCookie,
        { planVersionId: f.version.id, startsOn: f.today },
        randomUUID()
      ).expect(409);
    }
    await post(
      `/admin/clients/${randomUUID()}/managed-contracts`,
      f.providerCookie,
      { planVersionId: f.version.id, startsOn: f.today },
      randomUUID()
    ).expect(404);
    const admin = await db.user.create({
      data: { role: 'ORGANIZATION_ADMIN', clientId: f.client.id, email: `${randomUUID()}@example.com`, passwordHash }
    });
    const independentUser = await db.user.create({
      data: {
        role: 'INDEPENDENT_PLANNER',
        clientId: independent.id,
        email: `${randomUUID()}@example.com`,
        passwordHash
      }
    });
    for (const cookie of [f.plannerCookie, await login(admin.email), await login(independentUser.email)]) {
      await get(`/admin/clients/${f.client.id}/managed-contracts`, cookie).expect(403);
      await post(
        `/admin/clients/${f.client.id}/managed-contracts`,
        cookie,
        { planVersionId: f.version.id, startsOn: f.today },
        randomUUID()
      ).expect(403);
    }
    await post(
      `/admin/clients/${f.client.id}/managed-contracts`,
      null,
      { planVersionId: f.version.id, startsOn: f.today },
      randomUUID()
    ).expect(401);
    expect(await db.managedPlanContract.count()).toBe(0);
  });

  it('counts real unique activations, preserves cancellations and excludes unactivated/foreign events without read side effects', async () => {
    const f = await fixture(),
      foreign = await fixture();
    const contract = await assign(f).expect(201);
    const first = await activateRealEvent(f);
    await activateRealEvent(f);
    await activateRealEvent(foreign);
    await createEvent(f); // Preparation alone does not consume a contracted event.
    await post(`/events/${first.id}/cancel`, f.plannerCookie, {}, randomUUID()).expect(200);
    const beforeAudit = await db.auditLog.count();
    const path = `/admin/clients/${f.client.id}/managed-contracts/${contract.body.id}/consumption`;
    const firstRead = await get(path, f.providerCookie).expect(200);
    const secondRead = await get(path, f.providerCookie).expect(200);
    expect(firstRead.body).toMatchObject({
      contractId: contract.body.id,
      usedEvents: 2,
      includedUsedEvents: 2,
      extraordinaryEvents: 0,
      cancelledEvents: 1,
      currentPeriodIndex: 1,
      availableEvents: 2,
      annualAvailableEvents: null
    });
    expect(secondRead.body.events).toEqual(firstRead.body.events);
    expect(firstRead.body.events.filter((row: { cancelled: boolean }) => row.cancelled)).toHaveLength(1);
    expect(await db.auditLog.count()).toBe(beforeAudit);
    await get(
      `/admin/clients/${foreign.client.id}/managed-contracts/${contract.body.id}/consumption`,
      f.providerCookie
    ).expect(404);
    await get(path, f.plannerCookie).expect(403);
    await expectNoFinance();
  });

  async function fixture() {
    const client = await organization();
    const provider = await db.user.create({
      data: { role: 'PLATFORM_ADMIN', email: `${randomUUID()}@example.com`, passwordHash }
    });
    const planner = await db.user.create({
      data: { role: 'ORGANIZATION_PLANNER', clientId: client.id, email: `${randomUUID()}@example.com`, passwordHash }
    });
    const version = await db.managedPlanVersion.findFirstOrThrow({
      where: { plan: { modality: 'STANDARD', tier: 'ESSENTIAL' }, createdByUserId: null }
    });
    const today = (
      await db.$queryRaw<{ today: string }[]>`
      SELECT (transaction_timestamp() AT TIME ZONE 'America/Mexico_City')::date::text AS today
    `
    )[0]!.today;
    return {
      client,
      provider,
      planner,
      version,
      today,
      providerCookie: await login(provider.email),
      plannerCookie: await login(planner.email)
    };
  }
  function organization() {
    return db.client.create({ data: { type: 'ORGANIZATION', operatingProfile: 'MANAGED', name: 'PR02 Salon' } });
  }
  function assign(f: Awaited<ReturnType<typeof fixture>>, key = randomUUID()) {
    return post(
      `/admin/clients/${f.client.id}/managed-contracts`,
      f.providerCookie,
      { planVersionId: f.version.id, startsOn: f.today },
      key
    );
  }
  async function createEvent(f: Awaited<ReturnType<typeof fixture>>) {
    await db.service.upsert({
      where: { code: 'ACCESS_CONTROL' },
      create: { code: 'ACCESS_CONTROL' },
      update: { isActive: true }
    });
    const created = await post(`/admin/clients/${f.client.id}/events/managed`, f.providerCookie, {
      name: 'PR02 operational fact',
      serviceCode: 'ACCESS_CONTROL',
      accessMode: 'ANONYMOUS',
      capacity: 1,
      assignedPlannerUserId: f.planner.id
    }).expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${f.client.id}/events/${id}`)
      .set('Origin', origin)
      .set('Cookie', f.providerCookie)
      .send({ socialType: 'OTHER', eventDateTime: '2035-01-01T18:00:00Z', timeZone: 'America/Mexico_City' })
      .expect(200);
    return { id };
  }
  async function activateRealEvent(f: Awaited<ReturnType<typeof fixture>>) {
    const event = await createEvent(f);
    await post(
      `/admin/clients/${f.client.id}/events/${event.id}/physical-passes/generate`,
      f.providerCookie,
      { quantity: 1 },
      randomUUID()
    ).expect(200);
    await post(`/admin/clients/${f.client.id}/events/${event.id}/activate`, f.providerCookie, {}, randomUUID()).expect(
      200
    );
    return event;
  }
  function get(path: string, cookie: string) {
    return request(app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', cookie);
  }
  function post(path: string, cookie: string | null, body: object, key = randomUUID()) {
    const response = request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('Origin', origin)
      .set('Idempotency-Key', key);
    if (cookie) response.set('Cookie', cookie);
    return response.send(body);
  }
  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const header = response.headers['set-cookie'];
    return (Array.isArray(header) ? header[0] : header)!.split(';')[0]!;
  }
  async function expectNoFinance() {
    expect(await db.ledgerEntry.count()).toBe(0);
    expect(await db.receipt.count()).toBe(0);
    expect(await db.payment.count()).toBe(0);
    expect(await db.financeBalance.count()).toBe(0);
    expect(await db.creditLine.count()).toBe(0);
  }
  async function reset() {
    await db.$executeRawUnsafe(`BEGIN; SET LOCAL session_replication_role=replica;
      TRUNCATE managed_plan_contract,managed_plan_operation,client,app_user,service,event,audit_log,auth_session,
        receipt,ledger_entry,service_price,finance_balance RESTART IDENTITY CASCADE;
      DELETE FROM managed_plan_version WHERE created_by_user_id IS NOT NULL;
      UPDATE managed_plan_version SET valid_until=NULL;
      UPDATE managed_plan SET is_available=true;
      COMMIT;`);
  }
});

function versionInput(version: ManagedPlanVersion) {
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
