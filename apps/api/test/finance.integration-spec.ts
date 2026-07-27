import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientType,
  CreditLineStatus,
  LedgerMovementType,
  PaymentProvider,
  PaymentStatus,
  UserRole
} from '../src/generated/prisma/client';
import { FinanceService } from '../src/finance/finance.service';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Finance core', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let finance: FinanceService;

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
    finance = app.get(FinanceService);
  });

  beforeEach(async () => {
    await resetFinanceDatabase();
  });

  afterAll(async () => {
    await resetFinanceDatabase();
    await app.close();
  });

  it('separates free grants from approved paid purchases and returns idempotent results', async () => {
    const admin = await createPlatformAdmin();
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const adminCookie = await login(admin.email);
    const plannerCookie = await login(planner.email);
    const grantKey = `grant-${randomUUID()}`;
    const grantBody = { credits: 10, reason: 'Commercial courtesy' };

    const firstGrant = await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${planner.clientId}/assign-credits`,
      grantKey,
      grantBody
    );
    const repeatedGrant = await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${planner.clientId}/assign-credits`,
      grantKey,
      grantBody
    );
    expect(repeatedGrant.body).toEqual(firstGrant.body);

    const purchaseKey = `purchase-${randomUUID()}`;
    const purchaseBody = {
      kind: LedgerMovementType.CREDIT_PURCHASE,
      credits: 5,
      creditUnitValueMxnCents: 2000,
      amountMxnCents: 10_000,
      externalReference: 'manual-cash-001',
      metadata: { sourceDesk: 'north', reconciliationBatch: 42 }
    };
    const purchase = await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${planner.clientId}/manual-payment`,
      purchaseKey,
      purchaseBody
    );
    expect(purchase.body.payment).toMatchObject({
      provider: PaymentProvider.MANUAL,
      idempotencyKey: purchaseKey,
      externalReference: 'manual-cash-001',
      metadata: { sourceDesk: 'north', reconciliationBatch: 42 }
    });

    const balance = await request(app.getHttpServer())
      .get('/api/v1/finance/balance')
      .set('Cookie', plannerCookie)
      .expect(200);
    expect(balance.body).toMatchObject({
      purchasedCredits: 15,
      debtCredits: 0,
      debtMxnCents: 0,
      reconciliation: { matchesLedger: true, purchasedCredits: 15 }
    });

    const movements = await request(app.getHttpServer())
      .get('/api/v1/finance/movements')
      .set('Cookie', plannerCookie)
      .expect(200);
    expect(movements.body.map((entry: { movementType: LedgerMovementType }) => entry.movementType)).toEqual([
      LedgerMovementType.CREDIT_PURCHASE,
      LedgerMovementType.MANUAL_CREDIT_GRANT
    ]);
    expect(await prisma.ledgerEntry.count()).toBe(2);
    expect(await prisma.payment.count({ where: { status: PaymentStatus.APPROVED } })).toBe(1);
    expect(await prisma.receipt.count()).toBe(2);
    expect(await prisma.auditLog.count({ where: { resourceType: 'FinanceOperation' } })).toBe(2);
    const persistedPayment = await prisma.payment.findFirstOrThrow();
    expect(persistedPayment).toMatchObject({
      provider: PaymentProvider.MANUAL,
      idempotencyKey: purchaseKey,
      externalReference: 'manual-cash-001',
      metadata: { sourceDesk: 'north', reconciliationBatch: 42 }
    });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/clients/${planner.clientId}/manual-payment`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `duplicate-reference-${randomUUID()}`)
      .send(purchaseBody)
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('FINANCE_DUPLICATE_PAYMENT_REFERENCE');
      });
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.receipt.count()).toBe(2);
    expect(await prisma.ledgerEntry.count()).toBe(2);
    expect(await prisma.auditLog.count({ where: { resourceType: 'FinanceOperation' } })).toBe(2);
    expect((await finance.getBalance(planner.clientId)).purchasedCredits).toBe(15);

    const grantEntry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { movementType: LedgerMovementType.MANUAL_CREDIT_GRANT }
    });
    await expect(
      prisma.ledgerEntry.update({
        where: { id: grantEntry.id },
        data: { purchasedCreditDelta: 999 }
      })
    ).rejects.toThrow();
    await expect(prisma.ledgerEntry.delete({ where: { id: grantEntry.id } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "ledger_entry"')).rejects.toThrow();
    await expect(
      prisma.financeBalance.update({
        where: { clientId: planner.clientId },
        data: { purchasedCredits: 999 }
      })
    ).rejects.toThrow();

    await expect(
      prisma.$transaction(async (transaction) => {
        const receipt = await transaction.receipt.create({
          data: {
            clientId: planner.clientId,
            operationType: 'INVALID_PENDING_PURCHASE',
            operationReference: `invalid-${randomUUID()}`,
            idempotencyKey: `invalid-${randomUUID()}`
          }
        });
        const payment = await transaction.payment.create({
          data: {
            clientId: planner.clientId,
            receiptId: receipt.id,
            actorUserId: admin.userId,
            provider: PaymentProvider.MANUAL,
            status: PaymentStatus.PENDING,
            amountMxnCents: 2000,
            externalReference: 'pending-payment',
            idempotencyKey: `pending-${randomUUID()}`
          }
        });
        await transaction.ledgerEntry.create({
          data: {
            clientId: planner.clientId,
            actorUserId: admin.userId,
            movementType: LedgerMovementType.CREDIT_PURCHASE,
            purchasedCreditDelta: 1,
            creditLineUsedDelta: 0,
            debtDelta: 0,
            cashMxnDelta: 2000,
            creditUnitValueMxnCentsSnapshot: 2000,
            operationReference: `invalid-${randomUUID()}`,
            idempotencyKey: `invalid-${randomUUID()}`,
            paymentId: payment.id,
            receiptId: receipt.id
          }
        });
      })
    ).rejects.toThrow();
  });

  it('rejects a debt allocation appended after a valid payment commit without changing finance state', async () => {
    const admin = await createPlatformAdmin();
    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const adminCookie = await login(admin.email);

    await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${organization.clientId}/credit-line`,
      `line-${randomUUID()}`,
      { limitCredits: 10, status: CreditLineStatus.ACTIVE }
    );
    const paidLot = await createDebtLot(organization.clientId, admin.userId, 2, 2000);
    const untouchedLot = await createDebtLot(organization.clientId, admin.userId, 1, 3000);
    const payment = await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${organization.clientId}/manual-payment`,
      `debt-${randomUUID()}`,
      {
        kind: LedgerMovementType.DEBT_PAYMENT,
        amountMxnCents: 4000,
        externalReference: 'post-commit-allocation-payment',
        allocations: [{ debtLotLedgerEntryId: paidLot.id, credits: 2 }]
      }
    );

    const before = {
      ledger: await prisma.ledgerEntry.count(),
      payments: await prisma.payment.count(),
      receipts: await prisma.receipt.count(),
      allocations: await prisma.debtPaymentAllocation.findMany({ orderBy: { id: 'asc' } }),
      balance: await finance.getBalance(organization.clientId)
    };

    await expect(
      prisma.debtPaymentAllocation.create({
        data: {
          debtLotLedgerEntryId: untouchedLot.id,
          paymentLedgerEntryId: payment.body.movement.id,
          credits: 1,
          amountMxnCents: 3000
        }
      })
    ).rejects.toThrow();

    expect(await prisma.ledgerEntry.count()).toBe(before.ledger);
    expect(await prisma.payment.count()).toBe(before.payments);
    expect(await prisma.receipt.count()).toBe(before.receipts);
    expect(await prisma.debtPaymentAllocation.findMany({ orderBy: { id: 'asc' } })).toEqual(before.allocations);
    expect(await finance.getBalance(organization.clientId)).toEqual(before.balance);
  });

  it('keeps the maximum applied ledger sequence in the balance cache', async () => {
    const admin = await createPlatformAdmin();
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const highSequence = 9_000_000n;
    const lowerSequence = 8_000_000n;

    await createGrantWithSequence(planner.clientId, admin.userId, highSequence);
    await createGrantWithSequence(planner.clientId, admin.userId, lowerSequence);

    const balance = await prisma.financeBalance.findUniqueOrThrow({
      where: { clientId: planner.clientId }
    });
    expect(balance.purchasedCredits).toBe(2);
    expect(balance.lastLedgerSequence).toBe(highSequence);
  });

  it('pays explicit debt lots at their historical unit values without increasing purchased balance', async () => {
    const admin = await createPlatformAdmin();
    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const adminCookie = await login(admin.email);

    await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${organization.clientId}/credit-line`,
      `line-${randomUUID()}`,
      { limitCredits: 20, status: CreditLineStatus.ACTIVE, notes: 'Initial line' }
    );
    const olderLot = await createDebtLot(organization.clientId, admin.userId, 5, 2000);
    const newerLot = await createDebtLot(organization.clientId, admin.userId, 3, 2500);

    const payment = await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${organization.clientId}/manual-payment`,
      `debt-${randomUUID()}`,
      {
        kind: LedgerMovementType.DEBT_PAYMENT,
        amountMxnCents: 6500,
        externalReference: 'manual-debt-001',
        allocations: [
          { debtLotLedgerEntryId: olderLot.id, credits: 2 },
          { debtLotLedgerEntryId: newerLot.id, credits: 1 }
        ]
      }
    );

    expect(payment.body).toMatchObject({
      movement: {
        movementType: LedgerMovementType.DEBT_PAYMENT,
        purchasedCreditDelta: 0,
        creditLineUsedDelta: -3,
        debtDelta: -3,
        cashMxnDelta: 6500
      },
      payment: { status: PaymentStatus.APPROVED, amountMxnCents: 6500 },
      balance: {
        purchasedCredits: 0,
        debtCredits: 5,
        debtMxnCents: 11_000,
        creditLine: { usedCredits: 5, availableCredits: 15 },
        reconciliation: { matchesLedger: true }
      }
    });
    expect(await prisma.debtPaymentAllocation.count()).toBe(2);
    const confirmedPayment = await prisma.payment.findFirstOrThrow({
      where: { status: PaymentStatus.APPROVED }
    });
    const confirmedAllocation = await prisma.debtPaymentAllocation.findFirstOrThrow();
    await expect(
      prisma.payment.update({
        where: { id: confirmedPayment.id },
        data: { externalReference: 'mutated-reference' }
      })
    ).rejects.toThrow();
    await expect(
      prisma.debtPaymentAllocation.update({
        where: { id: confirmedAllocation.id },
        data: { credits: 99 }
      })
    ).rejects.toThrow();

    await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${organization.clientId}/credit-line`,
      `line-update-${randomUUID()}`,
      { limitCredits: 10, status: CreditLineStatus.ACTIVE, notes: 'Updated line' }
    ).then((response) => {
      expect(response.body.balance.creditLine).toMatchObject({
        limitCredits: 10,
        usedCredits: 5,
        availableCredits: 5,
        status: CreditLineStatus.ACTIVE
      });
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/clients/${organization.clientId}/credit-line`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `line-underflow-${randomUUID()}`)
      .send({ limitCredits: 4, status: CreditLineStatus.ACTIVE })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('FINANCE_CREDIT_LINE_EXCEEDED');
      });
    await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${organization.clientId}/credit-line`,
      `line-suspend-${randomUUID()}`,
      { limitCredits: 10, status: CreditLineStatus.SUSPENDED, notes: 'Risk review' }
    ).then((response) => {
      expect(response.body.balance.creditLine).toMatchObject({
        limitCredits: 10,
        usedCredits: 5,
        availableCredits: 0,
        status: CreditLineStatus.SUSPENDED
      });
    });
    await expect(createDebtLot(organization.clientId, admin.userId, 1, 3000)).rejects.toThrow();

    await request(app.getHttpServer())
      .post(`/api/v1/admin/finance/clients/${organization.clientId}/manual-payment`)
      .set('Origin', trustedOrigin)
      .set('Cookie', adminCookie)
      .set('Idempotency-Key', `overpay-${randomUUID()}`)
      .send({
        kind: LedgerMovementType.DEBT_PAYMENT,
        amountMxnCents: 8000,
        externalReference: 'manual-debt-overpay',
        allocations: [{ debtLotLedgerEntryId: olderLot.id, credits: 4 }]
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('FINANCE_PAYMENT_ALLOCATION_INVALID');
      });

    const beforeRebuild = await finance.getBalance(organization.clientId);
    const rebuild = await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${organization.clientId}/rebuild-balance`,
      `rebuild-${randomUUID()}`,
      {}
    );
    const afterRebuild = rebuild.body.balance;
    expect(afterRebuild).toMatchObject({
      purchasedCredits: beforeRebuild.purchasedCredits,
      debtCredits: beforeRebuild.debtCredits,
      debtMxnCents: beforeRebuild.debtMxnCents,
      creditLine: beforeRebuild.creditLine,
      reconciliation: beforeRebuild.reconciliation
    });
    expect(afterRebuild.reconciliation.matchesLedger).toBe(true);
  });

  it('serializes concurrent operations, deduplicates a shared key, and assigns global gapless folios', async () => {
    const admin = await createPlatformAdmin();
    const planner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const adminCookie = await login(admin.email);
    const endpoint = `/api/v1/admin/finance/clients/${planner.clientId}/assign-credits`;
    const sharedKey = `shared-${randomUUID()}`;
    const distinctRequests = Array.from({ length: 8 }, (_, index) =>
      adminPost(adminCookie, endpoint, `parallel-${index}-${randomUUID()}`, {
        credits: 1,
        reason: `Concurrent grant ${index}`
      })
    );
    const sharedRequests = [
      adminPost(adminCookie, endpoint, sharedKey, { credits: 1, reason: 'Same operation' }),
      adminPost(adminCookie, endpoint, sharedKey, { credits: 1, reason: 'Same operation' })
    ];
    const responses = await Promise.all([...distinctRequests, ...sharedRequests]);

    expect(responses.at(8)?.body).toEqual(responses.at(9)?.body);
    expect(await prisma.ledgerEntry.count()).toBe(9);
    const balance = await finance.getBalance(planner.clientId);
    expect(balance.purchasedCredits).toBe(9);
    expect(balance.reconciliation.matchesLedger).toBe(true);

    const receipts = await prisma.receipt.findMany({ orderBy: { folio: 'asc' } });
    expect(receipts.map((receipt) => receipt.folio.toString())).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(new Set(receipts.map((receipt) => receipt.folio.toString())).size).toBe(9);
  });

  it('enforces finance visibility and exposes ledger-derived daily and monthly cuts', async () => {
    const admin = await createPlatformAdmin();
    const independent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organizationPlanner = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_PLANNER);
    const adminCookie = await login(admin.email);
    const independentCookie = await login(independent.email);
    const organizationPlannerCookie = await login(organizationPlanner.email);

    await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${independent.clientId}/assign-credits`,
      `cut-grant-${randomUUID()}`,
      { credits: 4, reason: 'Cut test' }
    );
    await adminPost(
      adminCookie,
      `/api/v1/admin/finance/clients/${independent.clientId}/manual-payment`,
      `cut-purchase-${randomUUID()}`,
      {
        kind: LedgerMovementType.CREDIT_PURCHASE,
        credits: 2,
        creditUnitValueMxnCents: 2000,
        amountMxnCents: 4000,
        externalReference: 'cut-payment'
      }
    );

    await request(app.getHttpServer())
      .get('/api/v1/finance/receipts')
      .set('Cookie', independentCookie)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
      });
    await request(app.getHttpServer())
      .get('/api/v1/finance/balance')
      .set('Cookie', organizationPlannerCookie)
      .expect(403);
    await request(app.getHttpServer()).get('/api/v1/finance/balance').set('Cookie', adminCookie).expect(403);

    for (const path of ['/api/v1/admin/finance/cuts/daily', '/api/v1/admin/finance/cuts/monthly']) {
      await request(app.getHttpServer())
        .get(path)
        .set('Cookie', adminCookie)
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            incomeMxnCents: 4000,
            creditsSold: 2,
            creditsGranted: 4,
            pendingPurchasedCredits: 6
          });
        });
    }
  });

  it('publishes every required CODEX-031 endpoint in OpenAPI', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths).toHaveProperty('/api/v1/finance/balance');
    expect(document.paths).toHaveProperty('/api/v1/finance/movements');
    expect(document.paths).toHaveProperty('/api/v1/finance/receipts');
    expect(document.paths).toHaveProperty('/api/v1/admin/finance/clients/{clientId}/balance');
    expect(document.paths).toHaveProperty('/api/v1/admin/finance/clients/{clientId}/assign-credits');
    expect(document.paths).toHaveProperty('/api/v1/admin/finance/clients/{clientId}/credit-line');
    expect(document.paths).toHaveProperty('/api/v1/admin/finance/clients/{clientId}/manual-payment');
    expect(document.paths).toHaveProperty('/api/v1/admin/finance/clients/{clientId}/rebuild-balance');
    expect(document.paths).toHaveProperty('/api/v1/admin/finance/cuts/daily');
    expect(document.paths).toHaveProperty('/api/v1/admin/finance/cuts/monthly');
  });

  async function createDebtLot(clientId: string, actorUserId: string, credits: number, unitValueMxnCents: number) {
    const key = `test-lot-${randomUUID()}`;
    return prisma.$transaction(async (transaction) => {
      const receipt = await transaction.receipt.create({
        data: {
          clientId,
          operationType: LedgerMovementType.CREDIT_LINE_USAGE,
          operationReference: key,
          idempotencyKey: key
        }
      });
      return transaction.ledgerEntry.create({
        data: {
          clientId,
          eventId: randomUUID(),
          actorUserId,
          movementType: LedgerMovementType.CREDIT_LINE_USAGE,
          purchasedCreditDelta: 0,
          creditLineUsedDelta: credits,
          debtDelta: credits,
          cashMxnDelta: 0,
          creditUnitValueMxnCentsSnapshot: unitValueMxnCents,
          operationReference: key,
          idempotencyKey: key,
          receiptId: receipt.id
        }
      });
    });
  }

  async function createGrantWithSequence(clientId: string, actorUserId: string, sequence: bigint) {
    const key = `sequence-${sequence.toString()}-${randomUUID()}`;
    await prisma.$transaction(async (transaction) => {
      const receipt = await transaction.receipt.create({
        data: {
          clientId,
          operationType: LedgerMovementType.MANUAL_CREDIT_GRANT,
          operationReference: key,
          idempotencyKey: key
        }
      });
      await transaction.ledgerEntry.create({
        data: {
          sequence,
          clientId,
          actorUserId,
          movementType: LedgerMovementType.MANUAL_CREDIT_GRANT,
          purchasedCreditDelta: 1,
          creditLineUsedDelta: 0,
          debtDelta: 0,
          cashMxnDelta: 0,
          operationReference: key,
          idempotencyKey: key,
          receiptId: receipt.id,
          metadata: { reason: 'Sequence trigger integration test' }
        }
      });
    });
  }

  async function createPlatformAdmin() {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: UserRole.PLATFORM_ADMIN
      }
    });
    return { email, userId: user.id };
  }

  async function createClientUser(clientType: ClientType, role: UserRole) {
    const client = await prisma.client.create({
      data: { type: clientType, name: `Finance Client ${randomUUID()}` }
    });
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role,
        clientId: client.id
      }
    });
    return { clientId: client.id, email, userId: user.id };
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

  async function adminPost(cookie: string, path: string, idempotencyKey: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(path)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);
  }

  async function resetFinanceDatabase(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "debt_payment_allocation",
        "ledger_entry",
        "payment",
        "receipt",
        "credit_line",
        "finance_balance",
        "audit_log",
        "auth_session",
        "app_user",
        "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
    await prisma.$executeRaw`
      UPDATE "receipt_folio_counter"
      SET "next_folio" = 1
      WHERE "singleton" = true
    `;
  }
});
