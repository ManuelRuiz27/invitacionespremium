import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { cpus, totalmem } from 'node:os';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../src/common/database/transaction-policy';
import { recomputeAccessControlPreparationStatus } from '../src/events/access-control-readiness.service';
import { NominalAccessTokenService } from '../src/nominal-access/nominal-access-token.service';
import { PhysicalPassTokenService } from '../src/physical-passes/physical-pass-token.service';
import { Prisma } from '../src/generated/prisma/client';
import type {
  AccessOperationsDto,
  AccessOperationalSummaryDto,
  NominalAccessOperationsDto,
  AnonymousAccessOperationsDto
} from '../src/access-control-operations/access-control-operations.dto';

const origin = 'http://localhost:5173',
  password = 'correct horse battery staple';
type Mode = 'NOMINAL' | 'ANONYMOUS';

describe('DT08 authoritative access operations, privacy and MVCC', () => {
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  type Material = Awaited<ReturnType<typeof prepare>>;
  let app: INestApplication, db: PrismaService;
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('An isolated DATABASE_URL is required');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      SWAGGER_ENABLED: 'true',
      CORS_ORIGINS: origin,
      AUTH_COOKIE_SECURE: 'false',
      AUTH_COOKIE_SAME_SITE: 'lax',
      AUTH_COOKIE_PATH: '/',
      INVITATION_TOKEN_SIGNING_SECRET: 'dt08-integration-signing-secret-at-least-32-bytes'
    });
    app = await createApp();
    // Supertest must not create/close a fresh ephemeral listener per request
    // while the load case has other requests in flight.
    await app.listen(0, '127.0.0.1');
    db = app.get(PrismaService);
  }, 60_000);
  beforeEach(reset, 60_000);
  afterAll(async () => {
    if (db) await reset();
    if (app) await app.close();
  }, 60_000);

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'DT09 measures 150 %s rights with two concurrent readers, history and dashboard traffic',
    async (mode) => {
      const f = await fixture(mode);
      await patch(f, { capacity: 150, floorplanEnabled: true }).expect(200);
      const first = await tableFixture(f);
      const tables = [first.id];
      for (let index = 1; index < 5; index++)
        tables.push((await secondTable(f, first.floorplanId, 'TABLE', `Mesa ${index}`)).id);
      await db.floorplanShape.updateMany({ where: { eventId: f.id }, data: { capacity: 30 } });
      let materials: Material[];
      if (mode === 'NOMINAL') {
        const csv =
          'name,whatsapp_phone,group\n' +
          Array.from({ length: 150 }, (_, i) => `Persona ${i},,Grupo ${i % 5}`).join('\n');
        const preview = await request(app.getHttpServer())
          .post(`/api/v1/events/${f.id}/contacts/import/preview`)
          .set('Cookie', f.cookie)
          .set('Origin', origin)
          .attach('file', Buffer.from(csv), 'pilot.csv')
          .expect(201);
        await post(
          `/api/v1/events/${f.id}/contacts/import/commit`,
          f.cookie,
          { previewId: preview.body.previewId },
          randomUUID()
        ).expect(200);
        const people = await db.assistant.findMany({ where: { eventId: f.id }, orderBy: { id: 'asc' } });
        for (let index = 0; index < people.length; index++) {
          await issue(f, people[index]!.id).expect(201);
          await assign(f, people[index]!.id, tables[Math.floor(index / 30)]!);
        }
        materials = (await db.assistantAccessCredential.findMany({ where: { eventId: f.id } })).map((c) => ({
          ...c,
          passNumber: null
        }));
        for (let index = 0; index < 3; index++) {
          const previous = materials[index]!;
          await revokeNominal(f, previous.id).expect(200);
          const replacement = await issue(f, previous.assistantId!).expect(201);
          materials[index] = {
            ...(await db.assistantAccessCredential.findUniqueOrThrow({ where: { id: replacement.body.id as string } })),
            passNumber: null
          };
        }
      } else {
        for (const tableShapeId of tables)
          await post(
            `/api/v1/admin/clients/${f.client.id}/events/${f.id}/physical-passes/generate`,
            f.providerCookie,
            { quantity: 30, tableShapeId },
            randomUUID()
          ).expect(200);
        const original = await db.physicalPass.findFirstOrThrow({ where: { eventId: f.id } });
        await revokePhysical(f, original.id).expect(200);
        await generate(f, original.floorplanShapeId!).expect(200);
        materials = (await db.physicalPass.findMany({ where: { eventId: f.id, revokedAt: null } })).map((p) => ({
          ...p,
          assistantId: null
        }));
      }
      expect(materials).toHaveLength(150);
      await activate(f).expect(200);
      const tokens = [await staff(f), await staff(f)];
      const before = await db.$queryRaw<Array<{ deadlocks: number; rollbacks: bigint }>>`
        SELECT deadlocks, xact_rollback AS rollbacks FROM pg_stat_database WHERE datname=current_database()`;
      const latencies: number[] = [],
        dashboardLatencies: number[] = [];
      const failedResponses: Record<string, number> = {};
      let completed = 0,
        errors = 0,
        lockSamples = 0,
        maxLockWaiters = 0,
        readersRunning = 2,
        serializationConflicts = 0,
        deadlockConflicts = 0;
      const transactionFailureCodes: Record<string, number> = {};
      type Run = <T>(
        work: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number }
      ) => Promise<T>;
      const runTransaction = db.$transaction.bind(db) as Run;
      const observed: Run = async (work, options) => {
        try {
          return await runTransaction(work, options);
        } catch (error) {
          const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
          transactionFailureCodes[code] = (transactionFailureCodes[code] ?? 0) + 1;
          if (String(error).includes('40P01')) deadlockConflicts++;
          else if (code === 'P2034' || String(error).includes('40001')) serializationConflicts++;
          throw error;
        }
      };
      // Observe actual failed PostgreSQL transactions; never substitute results or skip locks/retries.
      const transactionObserver = vi.spyOn(db, '$transaction').mockImplementation(observed as typeof db.$transaction);
      const cpu = process.cpuUsage(),
        memoryBefore = process.memoryUsage().rss,
        started = performance.now();
      const recordScan = async (material: Material, token: string) => {
        const start = performance.now();
        const response = await scan(f, material, token);
        latencies.push(performance.now() - start);
        if (response.status !== 200) {
          errors++;
          const code =
            typeof response.body?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/u.test(response.body.code)
              ? response.body.code
              : 'UNCLASSIFIED';
          const failure = `${response.status}:${code}`;
          failedResponses[failure] = (failedResponses[failure] ?? 0) + 1;
        }
        completed++;
      };
      const outcomes = await Promise.allSettled([
        ...tokens.map(async (token, reader) => {
          try {
            for (let index = reader; index < materials.length; index += 2) await recordScan(materials[index]!, token);
          } finally {
            readersRunning--;
          }
        }),
        (async () => {
          do {
            const start = performance.now();
            const response = await operations(f).expect(200);
            dashboardLatencies.push(performance.now() - start);
            assertArithmetic(response.body as AccessOperationsDto);
            expect(response.body.entered).toBeLessThanOrEqual(150);
            const [sample] = await db.$queryRaw<Array<{ count: bigint }>>`
              SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
            lockSamples++;
            maxLockWaiters = Math.max(maxLockWaiters, Number(sample!.count));
          } while (readersRunning > 0);
        })()
      ]);
      transactionObserver.mockRestore();
      for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
      expect(completed).toBe(150);
      const elapsedMs = performance.now() - started,
        cpuUsed = process.cpuUsage(cpu);
      const result = (await operations(f).expect(200)).body as AccessOperationsDto;
      const action = mode === 'NOMINAL' ? 'CHECK_IN_CREATE' : 'PHYSICAL_PASS_USE';
      const auditCount = await db.auditLog.count({ where: { eventId: f.id, action } });
      if (mode === 'ANONYMOUS') {
        expect(await db.contact.count({ where: { eventId: f.id } })).toBe(0);
      }
      await noFinance();
      const after = await db.$queryRaw<Array<{ deadlocks: number; rollbacks: bigint }>>`
        SELECT deadlocks, xact_rollback AS rollbacks FROM pg_stat_database WHERE datname=current_database()`;
      const percentile = (samples: number[], percentile: number) =>
        [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * percentile) - 1]!;
      // Local pilot gates, chosen before measurement: two gates / 150 rights, human-paced reception.
      // These bound server latency only and are not a contractual production SLA.
      const measurement = {
        mode,
        rights: 150,
        readers: 2,
        tables: 5,
        errors,
        failedResponses,
        elapsedMs,
        scanner: {
          samples: latencies.length,
          p50Ms: percentile(latencies, 0.5),
          p95Ms: percentile(latencies, 0.95),
          maxMs: Math.max(...latencies)
        },
        dashboard: {
          samples: dashboardLatencies.length,
          p50Ms: percentile(dashboardLatencies, 0.5),
          p95Ms: percentile(dashboardLatencies, 0.95),
          maxMs: Math.max(...dashboardLatencies)
        },
        database: {
          deadlocksDelta: Number(after[0]!.deadlocks - before[0]!.deadlocks),
          rollbackDelta: Number(after[0]!.rollbacks - before[0]!.rollbacks),
          lockSamples,
          maxLockWaiters,
          serializationConflicts,
          deadlockConflicts,
          transactionFailureCodes,
          retryObservation: 'failed real transactions observed before bounded service retries; rollback stats may lag'
        },
        process: {
          cpuUserMs: cpuUsed.user / 1000,
          cpuSystemMs: cpuUsed.system / 1000,
          rssBeforeBytes: memoryBefore,
          rssAfterBytes: process.memoryUsage().rss
        },
        environment: {
          node: process.version,
          platform: process.platform,
          cpu: cpus()[0]?.model,
          logicalCpus: cpus().length,
          ramBytes: totalmem(),
          postgres: (await db.$queryRaw<Array<{ version: string }>>`SHOW server_version`)[0]
        },
        gates: { scannerP95Ms: 2000, dashboardP95Ms: 1500, unexpectedErrors: 0, deadlocks: 0 },
        generatedAt: new Date().toISOString()
      };
      const path = process.env.DT09_PERF_DIR
        ? join(process.env.DT09_PERF_DIR, `${mode.toLowerCase()}.json`)
        : undefined;
      if (path) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(measurement, null, 2));
      }
      console.info('[DT09 aggregate performance]', JSON.stringify(measurement));
      expect(result).toMatchObject({ activeRights: 150, entered: 150, pending: 0, availableCapacity: 0 });
      expect(result.tables).toHaveLength(5);
      expect(auditCount).toBe(150);
      expect(await db.checkIn.count({ where: { eventId: f.id, revertedAt: null } })).toBe(mode === 'NOMINAL' ? 150 : 0);
      if (mode === 'ANONYMOUS')
        expect(await db.physicalPass.count({ where: { eventId: f.id, usedAt: { not: null } } })).toBe(150);
      expect(errors).toBe(0);
      expect(measurement.database.deadlocksDelta).toBe(0);
      expect(measurement.scanner.p95Ms).toBeLessThanOrEqual(2000);
      expect(measurement.dashboard.p95Ms).toBeLessThanOrEqual(1500);
    },
    300_000
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'reads empty %s preparation with PostgreSQL time and no side effects',
    async (mode) => {
      const f = await fixture(mode),
        event = await db.event.findUniqueOrThrow({ where: { id: f.id } });
      const audits = await db.auditLog.count(),
        reports = await db.generatedReport.count();
      const [before] = await db.$queryRaw<Array<{ at: Date }>>`SELECT clock_timestamp() AS at`;
      const r = await operations(f).expect(200),
        body = r.body as AccessOperationsDto;
      const [after] = await db.$queryRaw<Array<{ at: Date }>>`SELECT clock_timestamp() AS at`;
      expect(body).toMatchObject({
        eventId: f.id,
        accessMode: mode,
        eventStatus: 'CONFIGURED',
        capacity: 3,
        issuedHistorical: 0,
        revokedHistorical: 0,
        activeRights: 0,
        entered: 0,
        pending: 0,
        availableCapacity: 3,
        tables: [],
        details: [],
        detailPage: 1,
        detailPageSize: 150,
        detailTotal: 0
      });
      expect(Date.parse(body.asOf)).toBeGreaterThanOrEqual(before!.at.getTime());
      expect(Date.parse(body.asOf)).toBeLessThanOrEqual(after!.at.getTime());
      expect(r.headers['cache-control']).toBe('private, no-store');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      await operations(f, true).expect(200);
      expect(await db.event.findUniqueOrThrow({ where: { id: f.id } })).toEqual(event);
      expect(await db.auditLog.count()).toBe(audits);
      expect(await db.generatedReport.count()).toBe(reports);
      await noFinance();
      await corrupt(async (tx) => {
        await tx.event.update({ where: { id: f.id }, data: { capacity: null, status: 'DRAFT' } });
      });
      expect((await operations(f).expect(200)).body).toMatchObject({
        capacity: null,
        availableCapacity: null,
        activeRights: 0,
        eventStatus: 'DRAFT'
      });
    }
  );

  it('counts duplicate nominal UUIDs, historical reissue, partial/full ingress and reversal without RSVP', async () => {
    const f = await fixture('NOMINAL'),
      first = await prepare(f),
      second = await prepare(f);
    const group = await db.group.create({ data: { eventId: f.id, name: 'Familia', normalizedName: 'familia' } });
    const assistant = await db.assistant.findUniqueOrThrow({
      where: { id: first.assistantId! },
      include: { invitation: true }
    });
    await db.contact.update({ where: { id: assistant.invitation.contactId }, data: { groupId: group.id } });
    await revokeNominal(f, first.id).expect(200);
    const issued = await issue(f, first.assistantId!).expect(201);
    const replacement = await db.assistantAccessCredential.findUniqueOrThrow({
      where: { id: issued.body.id as string }
    });
    const material = { ...replacement, passNumber: null };
    const before = (await operations(f).expect(200)).body as NominalAccessOperationsDto;
    expect(before).toMatchObject({
      issuedHistorical: 3,
      revokedHistorical: 1,
      activeRights: 2,
      entered: 0,
      pending: 2,
      availableCapacity: 1
    });
    expect(before.details.map((d) => d.assistantId)).toEqual([first.assistantId!, second.assistantId!].sort());
    expect(before.details.map((d) => d.name)).toEqual(['Duplicado', 'Duplicado']);
    expect(before.details.find((d) => d.assistantId === first.assistantId)?.group).toBe('Familia');
    await activate(f).expect(200);
    const token = await staff(f),
      ingress = await scan(f, material, token).expect(200);
    expect((await operations(f).expect(200)).body).toMatchObject({ activeRights: 2, entered: 1, pending: 1 });
    await revert(f, ingress.body.checkInId as string).expect(200);
    expect((await operations(f).expect(200)).body).toMatchObject({ entered: 0, pending: 2 });
    await scan(f, material, token).expect(200);
    await scan(f, second, token).expect(200);
    const all = (await operations(f).expect(200)).body as NominalAccessOperationsDto;
    expect(all).toMatchObject({ entered: 2, pending: 0, activeRights: 2 });
    expect(all.details.every((d) => d.status === 'ENTERED' && d.enteredAt !== null)).toBe(true);
    expect(await db.checkIn.count({ where: { eventId: f.id } })).toBe(3);
    expect(await db.assistant.count({ where: { eventId: f.id, responseStatus: 'PENDING' } })).toBe(2);
    expect(await db.invitation.count({ where: { eventId: f.id, responseStatus: 'PENDING' } })).toBe(2);
    assertArithmetic(all);
    await noFinance();
  });

  it('counts anonymous revoked intermediate folios historically and never invents nominal identities', async () => {
    const f = await fixture('ANONYMOUS'),
      first = await prepare(f),
      middle = await prepare(f),
      third = await prepare(f);
    await revokePhysical(f, middle.id).expect(200);
    const fourth = await prepare(f);
    const before = (await operations(f).expect(200)).body as AnonymousAccessOperationsDto;
    expect(before).toMatchObject({
      issuedHistorical: 4,
      revokedHistorical: 1,
      activeRights: 3,
      entered: 0,
      pending: 3,
      availableCapacity: 0
    });
    expect(before.details.map((d) => [d.passNumber, d.status])).toEqual([
      [1, 'UNUSED'],
      [2, 'REVOKED'],
      [3, 'UNUSED'],
      [4, 'UNUSED']
    ]);
    await activate(f).expect(200);
    const token = await staff(f);
    await scan(f, first, token).expect(200);
    expect((await operations(f).expect(200)).body).toMatchObject({ entered: 1, pending: 2 });
    await scan(f, third, token).expect(200);
    await scan(f, fourth, token).expect(200);
    const all = (await operations(f).expect(200)).body as AnonymousAccessOperationsDto;
    expect(all).toMatchObject({ entered: 3, pending: 0, activeRights: 3 });
    expect(Object.keys(all.details[0]!).sort()).toEqual(['passNumber', 'status', 'table', 'usedAt']);
    expect(await db.contact.count()).toBe(0);
    expect(await db.invitation.count()).toBe(0);
    expect(await db.assistant.count()).toBe(0);
    expect(await db.checkIn.count()).toBe(0);
    assertArithmetic(all);
    await noFinance();
  });

  it.each(['TABLE', 'SEAT'] as const)(
    'reconciles current nominal %s tables, exact places and post-ingress reassignment',
    async (mode) => {
      const f = await fixture('NOMINAL');
      await patch(f, { floorplanEnabled: true }).expect(200);
      const table = await tableFixture(f, mode),
        next = await secondTable(f, table.floorplanId, mode);
      const first = await prepare(f),
        second = await prepare(f);
      await assign(f, first.assistantId!, table.id, mode === 'SEAT' ? table.seatId : undefined);
      await assign(f, second.assistantId!, next.id, mode === 'SEAT' ? next.seatIds[0] : undefined);
      const before = (await operations(f).expect(200)).body as NominalAccessOperationsDto;
      expect(before.tables.find((t) => t.tableId === next.id)).toMatchObject({
        capacity: 2,
        activeRights: 1,
        entered: 0,
        pending: 1,
        availableCapacity: 1
      });
      if (mode === 'SEAT')
        expect(before.details.find((d) => d.assistantId === first.assistantId)?.seat).toEqual({
          id: table.seatId,
          label: '1'
        });
      await activate(f).expect(200);
      await scan(f, first, await staff(f)).expect(200);
      const partial = (await operations(f).expect(200)).body as NominalAccessOperationsDto;
      expect(partial.tables.find((t) => t.tableId === table.id)).toMatchObject({
        activeRights: 1,
        entered: 1,
        pending: 0
      });
      await assign(f, first.assistantId!, next.id, mode === 'SEAT' ? next.seatIds[1] : undefined);
      const moved = (await operations(f).expect(200)).body as NominalAccessOperationsDto;
      expect(moved).toMatchObject({ activeRights: 2, entered: 1, pending: 1 });
      expect(moved.tables.find((t) => t.tableId === table.id)).toMatchObject({
        activeRights: 0,
        entered: 0,
        pending: 0
      });
      expect(moved.tables.find((t) => t.tableId === next.id)).toMatchObject({
        capacity: 2,
        activeRights: 2,
        entered: 1,
        pending: 1,
        availableCapacity: 0
      });
      expect(moved.details.find((d) => d.assistantId === first.assistantId)?.table).toEqual({
        id: next.id,
        name: 'Mesa B'
      });
      assertArithmetic(moved);
    }
  );

  it('reconciles anonymous TABLE reservations separately from actual entries including an empty table', async () => {
    const f = await fixture('ANONYMOUS');
    await patch(f, { floorplanEnabled: true }).expect(200);
    const table = await tableFixture(f),
      next = await secondTable(f, table.floorplanId, 'TABLE');
    const p = await prepare(f, table.id),
      revoked = await prepare(f, table.id);
    await revokePhysical(f, revoked.id).expect(200);
    await activate(f).expect(200);
    const before = (await operations(f).expect(200)).body as AccessOperationsDto;
    expect(before.tables.find((t) => t.tableId === table.id)).toMatchObject({
      activeRights: 1,
      entered: 0,
      pending: 1,
      availableCapacity: 2
    });
    expect(before.tables.find((t) => t.tableId === next.id)).toMatchObject({
      activeRights: 0,
      entered: 0,
      pending: 0,
      availableCapacity: 2
    });
    await scan(f, p, await staff(f)).expect(200);
    const after = (await operations(f).expect(200)).body as AccessOperationsDto;
    expect(after.tables.find((t) => t.tableId === table.id)).toMatchObject({ activeRights: 1, entered: 1, pending: 0 });
    assertArithmetic(after);
  });

  it('excludes deleted or anonymized nominal identities without rebuilding names from historical material', async () => {
    const f = await fixture('NOMINAL'),
      material = await prepare(f);
    const contact = await db.contact.findFirstOrThrow({ where: { eventId: f.id } });
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${f.id}/contacts/${contact.id}`)
      .set('Cookie', f.cookie)
      .set('Origin', origin)
      .expect(204);
    const deleted = (await operations(f).expect(200)).body;
    expect(deleted).toMatchObject({ issuedHistorical: 1, activeRights: 0, entered: 0, details: [] });
    expect(await db.assistantAccessCredential.findUnique({ where: { id: material.id } })).not.toBeNull();
    const other = await fixture('NOMINAL');
    await prepare(other);
    await corrupt(async (tx) => {
      await tx.contact.updateMany({
        where: { eventId: other.id },
        data: { name: null, whatsappPhoneNormalized: null, anonymizedAt: new Date() }
      });
      await tx.assistant.updateMany({ where: { eventId: other.id }, data: { name: null, anonymizedAt: new Date() } });
    });
    const anonymous = (await operations(other).expect(200)).body;
    expect(anonymous).toMatchObject({ issuedHistorical: 1, activeRights: 0, details: [] });
    expect(JSON.stringify(anonymous)).not.toContain('Duplicado');
  });

  it.each(['orphan-entry', 'missing-table', 'over-capacity'] as const)(
    'fails explicitly and safely for %s corruption',
    async (kind) => {
      const f = await fixture('NOMINAL'),
        first = await prepare(f);
      await prepare(f);
      await activate(f).expect(200);
      if (kind === 'orphan-entry') await scan(f, first, await staff(f)).expect(200);
      await corrupt(async (tx) => {
        if (kind === 'orphan-entry')
          await tx.assistant.update({
            where: { id: first.assistantId! },
            data: { name: null, anonymizedAt: new Date() }
          });
        else
          await tx.event.update({
            where: { id: f.id },
            data: kind === 'missing-table' ? { floorplanEnabled: true } : { capacity: 1 }
          });
      });
      for (const provider of [false, true]) {
        const r = await operations(f, provider).expect(409);
        expect(r.body.code).toBe('ACCESS_OPERATIONS_INCONSISTENT');
        expect(JSON.stringify(r.body)).not.toMatch(/Duplicado|nonce|credentialId|qrToken|SELECT/u);
      }
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'enforces %s roles, ownership, assignment, headers and provider aggregate privacy',
    async (mode) => {
      const f = await fixture(mode),
        foreign = await fixture(mode);
      await prepare(f);
      const provider = await operations(f, true).expect(200),
        client = await operations(f).expect(200);
      expect({ ...provider.body, asOf: '' }).toEqual({ ...summary(client.body as AccessOperationsDto), asOf: '' });
      expect(provider.body).not.toHaveProperty('details');
      expect(provider.body).not.toHaveProperty('detailTotal');
      expect(JSON.stringify(provider.body)).not.toMatch(
        /Duplicado|assistantId|phone|nonce|signature|qrToken|staffToken|ledger|receipt|finance/iu
      );
      expect(JSON.stringify(client.body)).not.toMatch(
        /phone|whatsapp|nonce|signature|qrToken|staffToken|invitationId|ledger|receipt|finance/iu
      );
      await get(`/api/v1/events/${f.id}/access-operations`, f.adminCookie).expect(200);
      await get(`/api/v1/events/${f.id}/access-operations`, f.providerCookie).expect(403);
      for (const cookie of [foreign.cookie, foreign.adminCookie])
        await get(`/api/v1/events/${f.id}/access-operations`, cookie).expect(404);
      await get(`/api/v1/admin/clients/${foreign.client.id}/events/${f.id}/access-operations`, f.providerCookie).expect(
        404
      );
      await get(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/access-operations`, f.cookie).expect(403);
      const replacement = await staffPlanner(f),
        newCookie = await login(replacement.email);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/assignment`)
        .set('Cookie', f.providerCookie)
        .set('Origin', origin)
        .send({ assignedPlannerUserId: replacement.id })
        .expect(200);
      await operations(f).expect(404);
      await get(`/api/v1/events/${f.id}/access-operations`, newCookie).expect(200);
      await activate({ ...f, cookie: newCookie }).expect(200);
      const staffToken = await staff({ ...f, cookie: newCookie });
      await request(app.getHttpServer())
        .get(`/api/v1/events/${f.id}/access-operations`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(401);
      const plannerClient = await db.client.create({
        data: { type: 'PLANNER', operatingProfile: 'SELF_SERVICE', name: 'Independent' }
      });
      const planner = await db.user.create({
        data: {
          role: 'INDEPENDENT_PLANNER',
          clientId: plannerClient.id,
          email: `${randomUUID()}@example.com`,
          passwordHash: f.planner.passwordHash
        }
      });
      await get(`/api/v1/events/${f.id}/access-operations`, await login(planner.email)).expect(403);
    }
  );

  it('rejects legacy services and malformed paging without expanding capabilities', async () => {
    const f = await fixture('NOMINAL');
    for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1&page=2', 'page=10000000', 'pageSize=151'])
      expect((await get(`/api/v1/events/${f.id}/access-operations?${query}`, f.cookie).expect(400)).body.code).toBe(
        'ACCESS_OPERATIONS_INVALID_QUERY'
      );
    const legacy = await db.service.create({ data: { code: 'PHYSICAL_QR' } });
    await corrupt(async (tx) => {
      await tx.event.update({ where: { id: f.id }, data: { serviceId: legacy.id, accessMode: null } });
    });
    expect((await operations(f).expect(409)).body.code).toBe('ACCESS_OPERATIONS_EVENT_NOT_ELIGIBLE');
    expect((await operations(f, true).expect(409)).body.code).toBe('ACCESS_OPERATIONS_EVENT_NOT_ELIGIBLE');
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'preserves historical %s reads after CLOSED, ARCHIVED and CANCELLED',
    async (mode) => {
      const f = await fixture(mode),
        material = await prepare(f);
      await activate(f).expect(200);
      await scan(f, material, await staff(f)).expect(200);
      for (const [action, status] of [
        ['close', 'CLOSED'],
        ['archive', 'ARCHIVED']
      ] as const) {
        await post(`/api/v1/events/${f.id}/${action}`, f.cookie, {}, randomUUID()).expect(200);
        const r = (await operations(f).expect(200)).body as AccessOperationsDto;
        expect(r).toMatchObject({ eventStatus: status, activeRights: 1, entered: 1, pending: 0 });
        assertArithmetic(r);
      }
      const cancelled = await fixture(mode);
      await prepare(cancelled);
      await activate(cancelled).expect(200);
      await post(`/api/v1/events/${cancelled.id}/cancel`, cancelled.cookie, {}, randomUUID()).expect(200);
      expect((await operations(cancelled).expect(200)).body).toMatchObject({
        eventStatus: 'CANCELLED',
        activeRights: 1,
        entered: 0,
        pending: 1
      });
    }
  );

  it('enforces nominal privacy after 30 days even if the anonymization job has not run', async () => {
    const f = await fixture('NOMINAL');
    await prepare(f);
    await corrupt(async (tx) => {
      await tx.$executeRaw`UPDATE event SET event_date_time=clock_timestamp()-interval '30 days'+interval '1 minute' WHERE id=${f.id}::uuid`;
    });
    expect((await operations(f).expect(200)).body.details[0]).toMatchObject({ name: 'Duplicado' });
    await corrupt(async (tx) => {
      await tx.$executeRaw`UPDATE event SET event_date_time=clock_timestamp()-interval '30 days'-interval '1 minute' WHERE id=${f.id}::uuid`;
    });
    const expired = await operations(f).expect(410);
    expect(expired.body.code).toBe('ACCESS_OPERATIONS_DETAIL_EXPIRED');
    expect(JSON.stringify(expired.body)).not.toContain('Duplicado');
    const provider = await operations(f, true).expect(200);
    expect(provider.body).toMatchObject({ activeRights: 1, entered: 0, pending: 1 });
    expect(provider.body).not.toHaveProperty('details');
  });

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'enforces six-month %s content retention on both surfaces',
    async (mode) => {
      const f = await fixture(mode);
      await prepare(f);
      await corrupt(async (tx) => {
        await tx.$executeRaw`UPDATE event SET event_date_time=clock_timestamp()-interval '6 months'+interval '1 minute' WHERE id=${f.id}::uuid`;
      });
      await operations(f, true).expect(200);
      await corrupt(async (tx) => {
        await tx.$executeRaw`UPDATE event SET event_date_time=clock_timestamp()-interval '6 months'-interval '1 minute' WHERE id=${f.id}::uuid`;
      });
      for (const provider of [false, true]) {
        const r = await operations(f, provider).expect(410);
        expect(r.body.code).toBe('ACCESS_OPERATIONS_CONTENT_EXPIRED');
        expect(JSON.stringify(r.body)).not.toMatch(/Duplicado|details|assistantId|passNumber/u);
      }
    }
  );

  it('pages anonymous history beyond 150 while keeping all global counters authoritative', async () => {
    const f = await fixture('ANONYMOUS');
    await patch(f, { capacity: 150 }).expect(200);
    const batch = await post(
      `/api/v1/admin/clients/${f.client.id}/events/${f.id}/physical-passes/generate`,
      f.providerCookie,
      { quantity: 150 },
      randomUUID()
    ).expect(200);
    await revokePhysical(f, batch.body.passes[74].id as string).expect(200);
    await prepare(f);
    const first = (await operations(f).expect(200)).body as AnonymousAccessOperationsDto;
    const second = (await get(`/api/v1/events/${f.id}/access-operations?page=2`, f.cookie).expect(200))
      .body as AnonymousAccessOperationsDto;
    expect(first).toMatchObject({
      issuedHistorical: 151,
      revokedHistorical: 1,
      activeRights: 150,
      entered: 0,
      pending: 150,
      availableCapacity: 0,
      detailTotal: 151,
      detailPage: 1,
      detailPageSize: 150
    });
    expect(first.details).toHaveLength(150);
    expect(first.details[74]).toMatchObject({ passNumber: 75, status: 'REVOKED' });
    expect(second.details).toEqual([{ passNumber: 151, status: 'UNUSED', table: null, usedAt: null }]);
    expect({ ...summary(first), asOf: '' }).toEqual({ ...summary(second), asOf: '' });
    assertArithmetic(first);
    assertArithmetic(second);
  }, 60_000);

  it.each([
    ['NOMINAL', 'scan'],
    ['ANONYMOUS', 'scan'],
    ['NOMINAL', 'revoke'],
    ['ANONYMOUS', 'revoke'],
    ['NOMINAL', 'revert'],
    ['NOMINAL', 'reseat'],
    ['NOMINAL', 'close'],
    ['ANONYMOUS', 'close']
  ] as const)(
    'returns a coherent nonblocking %s snapshot while %s holds an uncommitted write',
    async (mode, action) => {
      const f = await fixture(mode);
      let target: Awaited<ReturnType<typeof secondTable>> | undefined;
      let material: Material;
      if (action === 'reseat') {
        await patch(f, { floorplanEnabled: true }).expect(200);
        const table = await tableFixture(f);
        target = await secondTable(f, table.floorplanId, 'TABLE');
        material = await prepare(f);
        await assign(f, material.assistantId!, table.id);
      } else material = await prepare(f);
      await activate(f).expect(200);
      const token = await staff(f);
      const entry = action === 'revert' ? await scan(f, material, token).expect(200) : null;
      const before = (await operations(f).expect(200)).body as AccessOperationsDto;
      const event = await db.event.findUniqueOrThrow({ where: { id: f.id } });
      const actionName =
        action === 'scan'
          ? mode === 'NOMINAL'
            ? 'CHECK_IN_CREATE'
            : 'PHYSICAL_PASS_USE'
          : action === 'revoke'
            ? mode === 'NOMINAL'
              ? 'NOMINAL_ACCESS_REVOKE'
              : 'PHYSICAL_PASS_REVOKE'
            : action === 'revert'
              ? 'CHECK_IN_REVERT'
              : action === 'reseat'
                ? 'SEATING_UPDATE'
                : 'EVENT_CLOSE';
      const gate = auditGate(actionName);
      const mutation =
        action === 'scan'
          ? scan(f, material, token).then((r) => r)
          : action === 'revoke'
            ? (mode === 'NOMINAL' ? revokeNominal(f, material.id) : revokePhysical(f, material.id)).then((r) => r)
            : action === 'revert'
              ? revert(f, entry!.body.checkInId as string).then((r) => r)
              : action === 'reseat'
                ? reseat(f, material.assistantId!, target!.id).then((r) => r)
                : post(`/api/v1/events/${f.id}/close`, f.cookie, {}, randomUUID()).then((r) => r);
      try {
        await withDeadline(gate.entered, 'Mutation did not reach its in-transaction audit');
        const during = (await withDeadline(operations(f).expect(200), 'Read waited on Scanner/Event write locks'))
          .body as AccessOperationsDto;
        expect({ ...during, asOf: '' }).toEqual({ ...before, asOf: '' });
        assertArithmetic(during);
      } finally {
        gate.release();
        gate.restore();
      }
      expect((await mutation).status).toBe(200);
      const after = (await operations(f).expect(200)).body as AccessOperationsDto;
      assertArithmetic(after);
      if (action === 'scan') expect(after.entered).toBe(1);
      else if (action === 'revert') expect(after.entered).toBe(0);
      else if (action === 'revoke') expect(after).toMatchObject({ activeRights: 0, revokedHistorical: 1 });
      else if (action === 'close') expect(after.eventStatus).toBe('CLOSED');
      else expect((after as NominalAccessOperationsDto).details[0]?.table?.id).toBe(target!.id);
      if (action !== 'close')
        expect((await db.event.findUniqueOrThrow({ where: { id: f.id } })).status).toBe(event.status);
    }
  );

  it.each(['NOMINAL', 'ANONYMOUS'] as const)(
    'keeps %s summary and details on one snapshot when a scan commits between read queries',
    async (mode) => {
      const f = await fixture(mode),
        material = await prepare(f);
      await activate(f).expect(200);
      const token = await staff(f);
      const gate = snapshotGate();
      const reading = operations(f)
        .expect(200)
        .then((r) => r);
      try {
        await withDeadline(gate.entered, 'Read did not establish its event snapshot');
        await scan(f, material, token).expect(200);
      } finally {
        gate.release();
        gate.restore();
      }
      const old = (await reading).body as AccessOperationsDto;
      expect(old).toMatchObject({ activeRights: 1, entered: 0, pending: 1 });
      expect(old.details[0]?.status).toBe(mode === 'NOMINAL' ? 'PENDING' : 'UNUSED');
      assertArithmetic(old);
      expect((await operations(f).expect(200)).body).toMatchObject({ entered: 1, pending: 0 });
    }
  );

  it.each([
    ['NOMINAL', true],
    ['NOMINAL', false],
    ['ANONYMOUS', true],
    ['ANONYMOUS', false]
  ] as const)('reconciles two %s Scanners with same QR=%s under real lock contention', async (mode, same) => {
    const f = await fixture(mode),
      first = await prepare(f),
      second = same ? first : await prepare(f);
    await activate(f).expect(200);
    const one = await staff(f),
      two = await staff(f),
      gate = auditGate(mode === 'NOMINAL' ? 'CHECK_IN_CREATE' : 'PHYSICAL_PASS_USE');
    const winner = scan(f, first, one).then((r) => r);
    let contender: Promise<request.Response> | undefined;
    try {
      await withDeadline(gate.entered, 'First scan did not reach its audit');
      contender = scan(f, second, two).then((r) => r);
      await waitForLock();
    } finally {
      gate.release();
      gate.restore();
    }
    const results = await Promise.all([winner, contender!]);
    expect(results.map((r) => r.status)).toEqual(same ? [200, 409] : [200, 200]);
    const current = (await operations(f).expect(200)).body as AccessOperationsDto;
    expect(current).toMatchObject({ activeRights: same ? 1 : 2, entered: same ? 1 : 2, pending: 0 });
    assertArithmetic(current);
    expect(
      await db.auditLog.count({
        where: { eventId: f.id, action: mode === 'NOMINAL' ? 'CHECK_IN_CREATE' : 'PHYSICAL_PASS_USE' }
      })
    ).toBe(same ? 1 : 2);
  });

  function get(path: string, cookie: string) {
    return request(app.getHttpServer()).get(path).set('Cookie', cookie);
  }
  function operations(f: Fixture, provider = false) {
    return get(
      provider
        ? `/api/v1/admin/clients/${f.client.id}/events/${f.id}/access-operations`
        : `/api/v1/events/${f.id}/access-operations`,
      provider ? f.providerCookie : f.cookie
    );
  }
  async function staff(f: Fixture) {
    return (await post(`/api/v1/events/${f.id}/staff-tokens`, f.cookie, { alias: 'DT08 door' }).expect(201)).body
      .token as string;
  }
  function scan(f: Fixture, material: Material, token: string) {
    const qrToken =
      f.mode === 'NOMINAL'
        ? app.get(NominalAccessTokenService).issue(material.id, material.qrTokenNonce)
        : app.get(PhysicalPassTokenService).issue(material.id, material.qrTokenNonce, material.qrTokenVersion);
    return post(
      `/api/v1/scanner/${token}/${f.mode === 'NOMINAL' ? 'nominal-access' : 'physical-passes'}/scan`,
      null,
      { qrToken },
      randomUUID()
    );
  }
  function revert(f: Fixture, id: string) {
    return post(`/api/v1/events/${f.id}/check-ins/${id}/revert`, f.cookie, {}, randomUUID());
  }
  function reseat(f: Fixture, assistantId: string, tableShapeId: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/events/${f.id}/seating/${assistantId}`)
      .set('Cookie', f.cookie)
      .set('Origin', origin)
      .set('Idempotency-Key', randomUUID())
      .send({ tableShapeId });
  }
  async function assign(f: Fixture, assistantId: string, tableShapeId: string, seatId?: string) {
    if (seatId)
      await post(
        `/api/v1/events/${f.id}/seating/assign-seats`,
        f.cookie,
        { assignments: [{ assistantId, seatId }] },
        randomUUID()
      ).expect(201);
    else
      await post(
        `/api/v1/events/${f.id}/seating/assign`,
        f.cookie,
        { assistantIds: [assistantId], tableShapeId },
        randomUUID()
      ).expect(201);
  }
  async function secondTable(f: Fixture, floorplanId: string, mode: 'TABLE' | 'SEAT', name = 'Mesa B') {
    const table = await db.floorplanShape.create({
      data: {
        eventId: f.id,
        floorplanId,
        kind: 'TABLE',
        geometry: 'RECTANGLE',
        name,
        normalizedName: name.toLowerCase(),
        capacity: mode === 'TABLE' ? 2 : 0,
        x: 0.4,
        y: 0.4,
        width: 0.2,
        height: 0.2,
        rotation: 0
      }
    });
    const seatIds: string[] = [];
    if (mode === 'SEAT')
      for (const label of ['1', '2'])
        seatIds.push(
          (
            await db.floorplanSeat.create({
              data: {
                eventId: f.id,
                floorplanId,
                floorplanShapeId: table.id,
                label,
                normalizedLabel: label,
                x: 0.4,
                y: 0.4
              }
            })
          ).id
        );
    return { ...table, seatIds };
  }
  function summary(body: AccessOperationsDto): AccessOperationalSummaryDto {
    const { detailPage: _page, detailPageSize: _size, detailTotal: _total, details: _details, ...rest } = body;
    return rest;
  }
  function assertArithmetic(body: AccessOperationalSummaryDto) {
    expect(body.activeRights).toBe(body.entered + body.pending);
    expect(body.entered).toBeGreaterThanOrEqual(0);
    expect(body.availableCapacity).toBe(body.capacity === null ? null : body.capacity - body.activeRights);
    for (const table of body.tables) {
      expect(table.activeRights).toBe(table.entered + table.pending);
      expect(table.availableCapacity).toBe(table.capacity - table.activeRights);
      expect(table.availableCapacity).toBeGreaterThanOrEqual(0);
    }
    if (body.tables.length) expect(body.tables.reduce((n, t) => n + t.activeRights, 0)).toBe(body.activeRights);
  }
  async function withDeadline<T>(operation: PromiseLike<T>, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(operation),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(message)), 5000);
        })
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  function snapshotGate() {
    let enter!: () => void,
      release!: () => void,
      armed = true;
    const entered = new Promise<void>((r) => {
        enter = r;
      }),
      held = new Promise<void>((r) => {
        release = r;
      });
    type Run = <T>(
      work: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number }
    ) => Promise<T>;
    const original = db.$transaction.bind(db) as Run;
    const intercepted: Run = (work, options) =>
      original(async (tx) => {
        if (!armed || options?.isolationLevel !== Prisma.TransactionIsolationLevel.RepeatableRead) return work(tx);
        const event = new Proxy(tx.event, {
          get(target, property, receiver) {
            if (property !== 'findFirst') return Reflect.get(target, property, receiver);
            return async (...args: Parameters<typeof tx.event.findFirst>) => {
              const result = await tx.event.findFirst(...args);
              if (armed) {
                armed = false;
                enter();
                await held;
              }
              return result;
            };
          }
        });
        return work(
          new Proxy(tx, {
            get(target, property, receiver) {
              return property === 'event' ? event : Reflect.get(target, property, receiver);
            }
          })
        );
      }, options);
    const spy = vi.spyOn(db, '$transaction').mockImplementation(intercepted as typeof db.$transaction);
    return { entered, release, restore: () => spy.mockRestore() };
  }
  async function fixture(mode: Mode) {
    const passwordHash = await hashPassword(password);
    const client = await db.client.create({
      data: { type: 'ORGANIZATION', operatingProfile: 'MANAGED', name: 'DT08' }
    });
    const provider = await db.user.create({
      data: { role: 'PLATFORM_ADMIN', email: `${randomUUID()}@example.com`, passwordHash }
    });
    const planner = await db.user.create({
      data: { role: 'ORGANIZATION_PLANNER', clientId: client.id, email: `${randomUUID()}@example.com`, passwordHash }
    });
    const service = await db.service.upsert({
      where: { code: 'ACCESS_CONTROL' },
      create: { code: 'ACCESS_CONTROL' },
      update: { isActive: true }
    });
    const admin = await db.user.create({
      data: { role: 'ORGANIZATION_ADMIN', clientId: client.id, email: `${randomUUID()}@example.com`, passwordHash }
    });
    const adminCookie = await login(admin.email);
    const cookie = await login(planner.email),
      providerCookie = await login(provider.email);
    const created = await post(`/api/v1/admin/clients/${client.id}/events/managed`, providerCookie, {
      name: 'DT08',
      serviceCode: 'ACCESS_CONTROL',
      accessMode: mode,
      capacity: 3,
      assignedPlannerUserId: planner.id
    }).expect(201);
    const id = created.body.id as string;
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${client.id}/events/${id}`)
      .set('Cookie', providerCookie)
      .set('Origin', origin)
      .send({ socialType: 'OTHER', eventDateTime: '2035-01-01T18:00:00Z', timeZone: 'America/Mexico_City' })
      .expect(200);
    return { id, mode, client, provider, planner, service, cookie, providerCookie, adminCookie };
  }
  function staffPlanner(f: Fixture) {
    return db.user.create({
      data: {
        role: 'ORGANIZATION_PLANNER',
        clientId: f.client.id,
        email: `${randomUUID()}@example.com`,
        passwordHash: f.planner.passwordHash
      }
    });
  }
  async function login(email: string) {
    const r = await post('/api/v1/auth/login', null, { email, password }).expect(200);
    const raw = r.headers['set-cookie'];
    return (Array.isArray(raw) ? raw[0] : raw)!.split(';')[0]!;
  }
  function post(path: string, cookie: string | null, body: object, key?: string) {
    const r = request(app.getHttpServer()).post(path).set('Origin', origin);
    if (cookie) r.set('Cookie', cookie);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body);
  }
  function activate(f: Fixture, key: string = randomUUID()) {
    return post(`/api/v1/admin/clients/${f.client.id}/events/${f.id}/activate`, f.providerCookie, {}, key);
  }
  function patch(f: Fixture, body: object) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${f.client.id}/events/${f.id}`)
      .set('Cookie', f.providerCookie)
      .set('Origin', origin)
      .send(body);
  }
  function addPerson(f: Fixture) {
    return post(`/api/v1/events/${f.id}/contacts`, f.cookie, { name: 'Duplicado' });
  }
  function issue(f: Fixture, assistantId: string) {
    return post(
      `/api/v1/events/${f.id}/nominal-access-credentials/assistants/${assistantId}/issue`,
      f.cookie,
      {},
      randomUUID()
    );
  }
  function generate(f: Fixture, tableShapeId?: string) {
    return post(
      `/api/v1/admin/clients/${f.client.id}/events/${f.id}/physical-passes/generate`,
      f.providerCookie,
      { quantity: 1, ...(tableShapeId ? { tableShapeId } : {}) },
      randomUUID()
    );
  }
  function revokeNominal(f: Fixture, id: string) {
    return post(
      `/api/v1/events/${f.id}/nominal-access-credentials/${id}/revoke`,
      f.cookie,
      { revocationReasonCode: 'OPERATOR_REQUEST' },
      randomUUID()
    );
  }
  function revokePhysical(f: Fixture, id: string) {
    return post(
      `/api/v1/events/${f.id}/physical-passes/${id}/revoke`,
      f.cookie,
      { revocationReasonCode: 'OPERATOR_REQUEST' },
      randomUUID()
    );
  }
  async function prepare(f: Fixture, tableShapeId?: string) {
    if (f.mode === 'ANONYMOUS') {
      const r = await generate(f, tableShapeId).expect(200);
      const p = await db.physicalPass.findUniqueOrThrow({ where: { id: r.body.passes[0].id as string } });
      return { ...p, assistantId: null };
    }
    const c = await addPerson(f).expect(201);
    const a = await db.assistant.findFirstOrThrow({ where: { invitation: { contactId: c.body.id as string } } });
    const r = await issue(f, a.id).expect(201);
    const credential = await db.assistantAccessCredential.findUniqueOrThrow({ where: { id: r.body.id as string } });
    return { ...credential, passNumber: null };
  }
  async function tableFixture(f: Fixture, mode: 'TABLE' | 'SEAT' = 'TABLE') {
    const floorplanId = randomUUID();
    const result = await db.$transaction(async (tx) => {
      const asset = await tx.fileAsset.create({
        data: {
          clientId: f.client.id,
          eventId: f.id,
          ownerType: 'FLOORPLAN',
          ownerId: floorplanId,
          fileType: 'FLOORPLAN_IMAGE',
          storageProvider: 'LOCAL',
          storageKey: `dt08/${randomUUID()}.png`,
          originalName: 'floorplan.png',
          mimeType: 'image/png',
          sizeBytes: 100,
          checksumSha256: 'a'.repeat(64),
          width: 100,
          height: 100,
          createdByUserId: f.provider.id,
          status: 'READY',
          associatedAt: new Date()
        }
      });
      await tx.floorplan.create({
        data: { id: floorplanId, eventId: f.id, imageAssetId: asset.id, seatingMode: mode }
      });
      const t = await tx.floorplanShape.create({
        data: {
          floorplanId,
          eventId: f.id,
          kind: 'TABLE',
          geometry: 'RECTANGLE',
          name: 'Mesa',
          normalizedName: 'mesa',
          capacity: mode === 'SEAT' ? 0 : 3,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          rotation: 0
        }
      });
      const seat =
        mode === 'SEAT'
          ? await tx.floorplanSeat.create({
              data: {
                eventId: f.id,
                floorplanId,
                floorplanShapeId: t.id,
                label: '1',
                normalizedLabel: '1',
                x: 0.2,
                y: 0.2
              }
            })
          : null;
      return { ...t, seatId: seat?.id, imageAssetId: asset.id };
    });
    await db.$transaction((tx) => recomputeAccessControlPreparationStatus(tx, f.id), CRITICAL_TRANSACTION_OPTIONS);
    return result;
  }
  function corrupt(work: (tx: import('../src/generated/prisma/client').Prisma.TransactionClient) => Promise<void>) {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await work(tx);
    });
  }
  async function noFinance() {
    expect(await db.ledgerEntry.count()).toBe(0);
    expect(await db.receipt.count()).toBe(0);
    expect(await db.servicePrice.count()).toBe(0);
  }
  function auditGate(action: string) {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((r) => {
        enter = r;
      }),
      held = new Promise<void>((r) => {
        release = r;
      });
    const audit = app.get(AuditService),
      original = audit.record.bind(audit);
    const spy = vi.spyOn(audit, 'record').mockImplementation(async (entry, tx) => {
      const result = await original(entry, tx);
      if (entry.action === action) {
        enter();
        await held;
      }
      return result;
    });
    return { entered, release, restore: () => spy.mockRestore() };
  }
  async function waitForLock() {
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      const [r] = await db.$queryRaw<
        { present: boolean }[]
      >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock') AS present`;
      if (r?.present) return;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw new Error('Competing request did not wait on PostgreSQL');
  }
  async function reset() {
    await db.$executeRawUnsafe(
      'BEGIN; SET LOCAL session_replication_role = replica; TRUNCATE client, app_user, service, event, audit_log, auth_session, receipt, ledger_entry, service_price, finance_balance RESTART IDENTITY CASCADE; COMMIT;'
    );
  }
});
