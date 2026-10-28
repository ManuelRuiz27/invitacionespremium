import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { addContractMonths } from '../src/managed-plans/managed-contract-dates';
import type { ManagedPlanVersion } from '../src/generated/prisma/client';

import { AuditService } from '../src/audit/audit.service';
import { ManagedCollectionsService } from '../src/managed-plans/managed-collections.service';
import type { ManagedCollectionsResponseDto } from '../src/managed-plans/managed-collections.dto';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('PR03 Managed commercial collections', () => {
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

  function providerPrincipal(f: Awaited<ReturnType<typeof fixture>>) {
    return {
      userId: f.provider.id,
      sessionId: randomUUID(),
      email: f.provider.email,
      role: 'PLATFORM_ADMIN' as const,
      clientId: null,
      clientType: null,
      clientOperatingProfile: null,
      clientStatus: null
    };
  }
  async function contracted() {
    const f = await fixture();
    const result = await assign(f).expect(201);
    const contractId = result.body.id as string;
    return { ...f, contractId, path: `/admin/clients/${f.client.id}/managed-contracts/${contractId}/collections` };
  }
  function paymentInput(today: string, amountMxnCents = 100000) {
    return {
      concept: 'MONTHLY',
      installmentNumber: 1,
      extraordinaryChargeId: null,
      amountMxnCents,
      effectiveOn: today,
      method: 'TRANSFER',
      reference: 'PR03 referencia',
      notes: 'Registro manual'
    };
  }

  it('derives thirteen obligations without persisting schedule rows and registers partial/full payments without Finance or operational effects', async () => {
    const f = await contracted();
    const beforeClient = await db.client.findUniqueOrThrow({ where: { id: f.client.id } });
    const beforePrices = await db.servicePrice.findMany();
    const initial = await get(f.path, f.providerCookie).expect(200);
    expect(initial.body.obligations).toHaveLength(13);
    expect(initial.body).toMatchObject({
      currency: 'MXN',
      beforeTax: true,
      summary: { totalMxnCents: 9970000, paidMxnCents: 0, dueMxnCents: 1280000 }
    });
    expect(await db.managedCollectionPayment.count()).toBe(0);
    const partial = await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today)).expect(201);
    expect(partial.body.obligations[1]).toMatchObject({
      status: 'PARTIAL',
      paidMxnCents: 100000,
      balanceMxnCents: 690000,
      overdue: false
    });
    const complete = await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today, 690000)).expect(201);
    expect(complete.body.obligations[1]).toMatchObject({ status: 'PAID', balanceMxnCents: 0 });
    await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today, 1)).expect(409);
    expect(await db.client.findUniqueOrThrow({ where: { id: f.client.id } })).toEqual(beforeClient);
    expect(await db.servicePrice.findMany()).toEqual(beforePrices);
    expect(await db.event.count()).toBe(0);
    await expectNoFinance();
    const history = await get(`${f.path}/history`, f.providerCookie).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body[0]).toMatchObject({
      kind: 'PAYMENT',
      actorUserId: f.provider.id,
      actorLabel: f.provider.email,
      reference: 'PR03 referencia',
      notes: 'Registro manual',
      effectiveOn: f.today,
      method: 'TRANSFER'
    });
    expect(history.body[0].occurredAt <= history.body[1].occurredAt).toBe(true);
    const audit = await db.auditLog.findMany({ where: { action: 'MANAGED_COLLECTION_PAYMENT_REGISTER' } });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      actorId: f.provider.id,
      clientId: f.client.id,
      resourceType: 'MANAGED_COLLECTION_PAYMENT'
    });
  });

  it('replays concurrent identical payment keys once and rejects reuse for a different intent', async () => {
    const f = await contracted(),
      key = randomUUID(),
      body = paymentInput(f.today);
    const results = await Promise.all([
      post(`${f.path}/payments`, f.providerCookie, body, key),
      post(`${f.path}/payments`, f.providerCookie, body, key)
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0]!.body).toEqual(results[1]!.body);
    expect(await db.managedCollectionPayment.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'MANAGED_COLLECTION_PAYMENT_REGISTER' } })).toBe(1);
    await post(`${f.path}/payments`, f.providerCookie, { ...body, amountMxnCents: 1 }, key).expect(409);
    await expectNoFinance();
  });

  it('serializes different payment keys to reject concurrent overpayment', async () => {
    const f = await contracted();
    const results = await Promise.all([
      post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today, 500000)),
      post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today, 500000))
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await db.managedCollectionPayment.count()).toBe(1);
    const state = await get(f.path, f.providerCookie).expect(200);
    expect(state.body.obligations[1]).toMatchObject({ paidMxnCents: 500000, balanceMxnCents: 290000 });
  });

  it('fully reverses once, restores the balance and preserves every original field and chronological audit', async () => {
    const f = await contracted();
    await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today, 790000)).expect(201);
    const original = await db.managedCollectionPayment.findFirstOrThrow();
    const key = randomUUID(),
      path = `${f.path}/payments/${original.id}/reverse`,
      body = { reason: 'Transferencia registrada por error' };
    const results = await Promise.all([
      post(path, f.providerCookie, body, key),
      post(path, f.providerCookie, body, key)
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0]!.body).toEqual(results[1]!.body);
    expect(results[0]!.body.obligations[1]).toMatchObject({
      status: 'PENDING',
      paidMxnCents: 0,
      balanceMxnCents: 790000
    });
    const reversed = await db.managedCollectionPayment.findUniqueOrThrow({ where: { id: original.id } });
    expect({ ...reversed, reversedAt: null, reversedByUserId: null, reversalReason: null }).toEqual(original);
    expect(reversed).toMatchObject({ reversedByUserId: f.provider.id, reversalReason: body.reason });
    await post(path, f.providerCookie, body).expect(409);
    const history = await get(`${f.path}/history`, f.providerCookie).expect(200);
    expect(history.body.map((entry: { kind: string }) => entry.kind)).toEqual(['PAYMENT', 'REVERSAL']);
    expect(history.body[0]).toMatchObject({ reversed: true, reference: original.reference, effectiveOn: f.today });
    expect(history.body[1]).toMatchObject({ reversalReason: body.reason, actorUserId: f.provider.id });
    expect(await db.auditLog.count({ where: { action: 'MANAGED_COLLECTION_PAYMENT_REVERSE' } })).toBe(1);
    await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today, 790000)).expect(201);
    await expectNoFinance();
  });

  it('rejects zero/negative/fractional amounts, invalid concepts, future dates and missing reversal reasons without writes', async () => {
    const f = await contracted(),
      base = paymentInput(f.today);
    for (const patch of [
      { amountMxnCents: 0 },
      { amountMxnCents: -1 },
      { amountMxnCents: 1.5 },
      { installmentNumber: 13 },
      { concept: 'IMPLEMENTATION' },
      { notes: 'x'.repeat(1001) }
    ]) {
      await post(`${f.path}/payments`, f.providerCookie, { ...base, ...patch }).expect(400);
    }
    await post(`${f.path}/payments`, f.providerCookie, { ...base, effectiveOn: addContractMonths(f.today, 1) }).expect(
      409
    );
    await post(`${f.path}/payments/${randomUUID()}/reverse`, f.providerCookie, { reason: ' ' }).expect(400);
    expect(await db.managedCollectionPayment.count()).toBe(0);
    expect(await db.managedPlanOperation.count({ where: { kind: 'COLLECTION_PAYMENT' } })).toBe(0);
  });

  it('enforces client → contract → concept → payment ownership and live Provider authorization for every route', async () => {
    const f = await contracted(),
      foreign = await contracted();
    const body = paymentInput(f.today);
    await post(`${f.path}/payments`, f.providerCookie, body).expect(201);
    const payment = await db.managedCollectionPayment.findFirstOrThrow();
    const mismatched = `/admin/clients/${foreign.client.id}/managed-contracts/${f.contractId}/collections`;
    await get(mismatched, f.providerCookie).expect(404);
    await post(`${mismatched}/payments`, f.providerCookie, body).expect(404);
    await post(`${foreign.path}/payments/${payment.id}/reverse`, f.providerCookie, { reason: 'Foreign' }).expect(404);
    await post(`${foreign.path}/payments`, f.providerCookie, {
      ...body,
      concept: 'EXTRAORDINARY',
      installmentNumber: null,
      extraordinaryChargeId: randomUUID()
    }).expect(409);
    for (const route of [f.path, `${f.path}/history`]) await get(route, f.plannerCookie).expect(403);
    for (const [route, input] of [
      [`${f.path}/payments`, body],
      [`${f.path}/payments/${payment.id}/reverse`, { reason: 'Unauthorized' }],
      [`${f.path}/extraordinary-charges`, { eventId: randomUUID() }]
    ] as const) {
      await post(route, f.plannerCookie, input).expect(403);
      await post(route, null, input).expect(401);
    }
    await expect(
      app
        .get(ManagedCollectionsService)
        .list(f.client.id, f.contractId, { ...providerPrincipal(f), userId: f.planner.id })
    ).rejects.toThrow();
    await db.user.update({ where: { id: f.provider.id }, data: { deletedAt: new Date() } });
    await expect(
      app.get(ManagedCollectionsService).list(f.client.id, f.contractId, providerPrincipal(f))
    ).rejects.toThrow();
    expect(await db.managedCollectionPayment.count()).toBe(1);
  });

  it('keeps historical prices for payments after catalog replacement and records implementation separately', async () => {
    const f = await contracted();
    await post(`/admin/managed-plans/${f.version.planId}/versions`, f.providerCookie, {
      ...versionInput(f.version),
      monthlyAmountMxnCents: 900000,
      initialFeeMxnCents: 600000,
      extraEventAmountMxnCents: 200000
    }).expect(201);
    const result = await post(`${f.path}/payments`, f.providerCookie, {
      ...paymentInput(f.today, 490000),
      concept: 'IMPLEMENTATION',
      installmentNumber: null
    }).expect(201);
    expect(result.body.obligations[0]).toMatchObject({ amountMxnCents: 490000, paidMxnCents: 490000, status: 'PAID' });
    expect(result.body.obligations[1].amountMxnCents).toBe(790000);
    expect(result.body.summary.totalMxnCents).toBe(9970000);
    await expectNoFinance();
  });

  it('rolls back the payment and idempotency record when audit fails, then permits the same attempt', async () => {
    const f = await contracted(),
      key = randomUUID();
    const audit = vi.spyOn(app.get(AuditService), 'record').mockRejectedValueOnce(new Error('Injected audit failure'));
    try {
      await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today), key).expect(500);
    } finally {
      audit.mockRestore();
    }
    expect(await db.managedCollectionPayment.count()).toBe(0);
    expect(await db.managedPlanOperation.findUnique({ where: { idempotencyKey: key } })).toBeNull();
    await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today), key).expect(201);
  });

  it('protects persisted ownership, original payment fields and physical deletion at the database boundary', async () => {
    const f = await contracted(),
      foreign = await contracted();
    await post(`${f.path}/payments`, f.providerCookie, paymentInput(f.today)).expect(201);
    const row = await db.managedCollectionPayment.findFirstOrThrow();
    await expect(
      db.managedCollectionPayment.update({ where: { id: row.id }, data: { amountMxnCents: 2 } })
    ).rejects.toThrow();
    await expect(db.managedCollectionPayment.delete({ where: { id: row.id } })).rejects.toThrow();
    const data = {
      ...paymentInput(f.today),
      contractId: f.contractId,
      clientId: f.client.id,
      effectiveOn: new Date(`${f.today}T00:00:00Z`),
      registeredByUserId: f.provider.id
    };
    await expect(
      db.managedCollectionPayment.create({ data: { ...data, id: randomUUID(), clientId: foreign.client.id } })
    ).rejects.toThrow();
    await expect(
      db.managedCollectionPayment.create({ data: { ...data, id: randomUUID(), amountMxnCents: 790000 } })
    ).rejects.toThrow();
    expect(await db.managedCollectionPayment.count()).toBe(1);
  });

  it('confirms only a PR02 extraordinary event, once, at the historical price; cancellation remains reviewable and activation still works', async () => {
    const f = await contracted();
    const included = await activateRealEvent(f);
    for (let index = 0; index < 3; index++) await activateRealEvent(f);
    const extra = await activateRealEvent(f);
    await post(`/events/${extra.id}/cancel`, f.plannerCookie, {}).expect(200);
    const beforeEvent = await db.event.findUniqueOrThrow({ where: { id: extra.id } });
    const candidates = await get(f.path, f.providerCookie).expect(200);
    expect(candidates.body.extraordinaryCandidates).toEqual([
      expect.objectContaining({
        eventId: extra.id,
        cancelled: true,
        amountMxnCents: 125000,
        confirmedChargeId: null,
        eventDateTime: '2035-01-01T18:00:00.000Z'
      })
    ]);
    expect(await db.managedExtraordinaryCharge.count()).toBe(0);
    for (const eventId of [included.id, randomUUID(), (await createEvent(f)).id])
      await post(`${f.path}/extraordinary-charges`, f.providerCookie, { eventId }).expect(409);
    const foreign = await contracted();
    await post(`${foreign.path}/extraordinary-charges`, f.providerCookie, { eventId: extra.id }).expect(409);
    await post(`/admin/managed-plans/${f.version.planId}/versions`, f.providerCookie, {
      ...versionInput(f.version),
      extraEventAmountMxnCents: 200000
    }).expect(201);
    const key = randomUUID();
    const results = await Promise.all([
      post(`${f.path}/extraordinary-charges`, f.providerCookie, { eventId: extra.id }, key),
      post(`${f.path}/extraordinary-charges`, f.providerCookie, { eventId: extra.id }, key)
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0]!.body).toEqual(results[1]!.body);
    const state = results[0]!.body as ManagedCollectionsResponseDto;
    expect(state.obligations).toHaveLength(14);
    expect(state.obligations.at(-1)).toMatchObject({
      concept: 'EXTRAORDINARY',
      eventId: extra.id,
      amountMxnCents: 125000,
      dueOn: f.today
    });
    const charge = await db.managedExtraordinaryCharge.findFirstOrThrow();
    await post(`${f.path}/extraordinary-charges`, f.providerCookie, { eventId: extra.id }).expect(409);
    expect(await db.managedExtraordinaryCharge.count()).toBe(1);
    expect(await db.auditLog.count({ where: { action: 'MANAGED_EXTRAORDINARY_CHARGE_CONFIRM' } })).toBe(1);
    await expect(
      db.managedExtraordinaryCharge.update({ where: { id: charge.id }, data: { amountMxnCents: 1 } })
    ).rejects.toThrow();
    await expect(db.managedExtraordinaryCharge.delete({ where: { id: charge.id } })).rejects.toThrow();
    await post(`${foreign.path}/payments`, f.providerCookie, {
      ...paymentInput(f.today, 1),
      concept: 'EXTRAORDINARY',
      installmentNumber: null,
      extraordinaryChargeId: charge.id
    }).expect(409);
    const paid = await post(`${f.path}/payments`, f.providerCookie, {
      ...paymentInput(f.today, 125000),
      concept: 'EXTRAORDINARY',
      installmentNumber: null,
      extraordinaryChargeId: charge.id
    }).expect(201);
    expect(paid.body.obligations.at(-1)).toMatchObject({ status: 'PAID', balanceMxnCents: 0 });
    expect(await db.event.findUniqueOrThrow({ where: { id: extra.id } })).toEqual(beforeEvent);
    await activateRealEvent(f); // Unpaid contractual months never gate operations.
    await expectNoFinance();
  }, 15000);

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
    return db.client.create({ data: { type: 'ORGANIZATION', operatingProfile: 'MANAGED', name: 'PR03 Salon' } });
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
      name: 'PR03 operational fact',
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
