import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { Client as PgClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientStatus,
  ClientType,
  EventSocialType,
  EventStatus,
  GeneratedReportPrivacyMode,
  GeneratedReportStatus,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { ReportsService } from '../src/reports/reports.service';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const isolatedStorage = (() => {
  const systemTemp =
    process.env.RUNNER_TEMP ??
    process.env.TMPDIR ??
    process.env.TEMP ??
    process.env.TMP ??
    (process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp');
  return {
    systemTemp,
    root: path.join(systemTemp, `reports-vitest-${process.pid}-${Math.random().toString(16).slice(2)}`)
  };
})();

describe('Generated reports', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reports: ReportsService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    await rm(isolatedStorage.root, { recursive: true, force: true });
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.FILE_STORAGE_LOCAL_ROOT = isolatedStorage.root;
    process.env.FILE_UPLOAD_MAX_BYTES = '10485760';
    process.env.FILE_IMAGE_MAX_PIXELS = '40000000';
    process.env.FILE_ORPHAN_RETENTION_SECONDS = '60';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'reports-integration-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    reports = app.get(ReportsService);
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    const resolved = path.resolve(isolatedStorage.root);
    const relative = path.relative(path.resolve(isolatedStorage.systemTemp), resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Refusing to remove a non-temporary Reports test directory.');
    }
    await rm(resolved, { recursive: true, force: true });
  }, 60_000);

  it('authorizes a bound attendance PDF, replays safely, downloads privately and expires nominal data', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    await createAttendanceData(fixture.eventId, fixture.userId);
    const cookie = await login(fixture.email);

    const authorized = await authorize(fixture.eventId, cookie, 'reports-attendance-001', 'attendance-pdf').expect(200);
    expect(authorized.body).toMatchObject({
      reportType: 'ATTENDANCE',
      status: 'AUTHORIZED',
      privacyMode: 'DETAILED',
      templateVersion: 1,
      parameters: { locale: 'es-MX', pageSize: 'A4', timeZone: 'America/Mexico_City' }
    });
    expect(authorized.body.dataset.rows).toHaveLength(1);
    expect(JSON.stringify(authorized.body)).not.toMatch(/phone|storageKey|staffToken|contactId|assistantId/iu);

    const replay = await authorize(fixture.eventId, cookie, 'reports-attendance-001', 'attendance-pdf').expect(200);
    expect(replay.body).toEqual(authorized.body);
    expect(await prisma.generatedReport.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_AUTHORIZE' } })).toBe(1);

    const reportId = authorized.body.reportId as string;
    const pdf = await boundPdf(reportId, authorized.body.datasetHashSha256 as string);
    const uploaded = await uploadPdf(fixture.eventId, reportId, cookie, pdf, authorized.body.datasetHashSha256).expect(
      200
    );
    expect(uploaded.body).toMatchObject({ id: reportId, status: 'READY' });
    const same = await uploadPdf(fixture.eventId, reportId, cookie, pdf, authorized.body.datasetHashSha256).expect(200);
    expect(same.body).toEqual(uploaded.body);
    expect(await prisma.fileAsset.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_FILE_ATTACH' } })).toBe(1);

    const download = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports/${reportId}/download`)
      .set('Cookie', cookie)
      .expect(200);
    expect(download.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': 'attachment; filename="reporte-asistencia.pdf"',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    expect(download.headers.etag).toMatch(/^"sha256-[0-9a-f]{32}"$/u);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports`)
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body[0].downloadPath).toContain(`/reports/${reportId}/download`);
    expect(JSON.stringify(list.body)).not.toMatch(/dataset|storage|assistantName/iu);

    const admin = await createAdminAndLogin();
    const adminList = await request(app.getHttpServer()).get('/api/v1/admin/reports').set('Cookie', admin).expect(200);
    expect(adminList.body[0]).toMatchObject({
      id: reportId,
      clientId: fixture.clientId,
      eventId: fixture.eventId,
      requestedByUserId: fixture.userId
    });
    expect(JSON.stringify(adminList.body)).not.toMatch(/dataset|downloadPath|storage|assistantName/iu);

    const stored = await prisma.generatedReport.findUniqueOrThrow({ where: { id: reportId } });
    await reports.expirePrivacy(stored.detailedUntil);
    const expired = await prisma.generatedReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(expired).toMatchObject({
      status: GeneratedReportStatus.HIDDEN,
      privacyMode: GeneratedReportPrivacyMode.AGGREGATE
    });
    expect((expired.datasetSnapshot as { rows: unknown[] }).rows).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports/${reportId}/download`)
      .set('Cookie', cookie)
      .expect(410);
  }, 60_000);

  it('enforces service, ownership, idempotency, PDF binding and PostgreSQL immutability', async () => {
    const fixture = await createFixture(ServiceCode.PHYSICAL_QR);
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await transaction.physicalPass.create({
        data: {
          eventId: fixture.eventId,
          passNumber: 1,
          qrTokenNonce: 'c'.repeat(64),
          createdByUserId: fixture.userId
        }
      });
    });
    const cookie = await login(fixture.email);

    await authorize(fixture.eventId, cookie, 'reports-service-mismatch', 'attendance-pdf')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('REPORT_SERVICE_MISMATCH'));
    const authorized = await authorize(fixture.eventId, cookie, 'reports-physical-001', 'physical-passes-pdf').expect(
      200
    );
    expect(authorized.body.dataset).toMatchObject({
      summary: { total: 1, used: 0, unused: 1 },
      passes: [{ passNumber: 1, status: 'UNUSED' }]
    });
    expect(authorized.body.privacyMode).toBe('AGGREGATE');

    await authorize(fixture.eventId, cookie, 'reports-physical-001', 'attendance-pdf')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('REPORT_IDEMPOTENCY_CONFLICT'));

    const outsider = await createClientUser();
    const outsiderCookie = await login(outsider.email);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports`)
      .set('Cookie', outsiderCookie)
      .expect(404);

    const reportId = authorized.body.reportId as string;
    const wrongPdf = await boundPdf(randomUUID(), authorized.body.datasetHashSha256 as string);
    await uploadPdf(fixture.eventId, reportId, cookie, wrongPdf, authorized.body.datasetHashSha256)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('REPORT_FILE_BINDING_INVALID'));

    const databaseUrl = process.env.DATABASE_URL!;
    const client = new PgClient({ connectionString: databaseUrl });
    await client.connect();
    try {
      await expect(
        client.query('UPDATE generated_report SET id = $2 WHERE id = $1', [reportId, randomUUID()])
      ).rejects.toThrow(/generated_report_identity_immutable/iu);
      await expect(client.query('DELETE FROM generated_report WHERE id = $1', [reportId])).rejects.toThrow(
        /generated_report_immutable_delete/iu
      );
      await expect(client.query('TRUNCATE generated_report')).rejects.toThrow(/generated_report_immutable_truncate/iu);
    } finally {
      await client.end();
    }
    expect(await prisma.generatedReport.count({ where: { id: reportId } })).toBe(1);
    const stored = await prisma.generatedReport.findUniqueOrThrow({ where: { id: reportId } });
    await reports.expirePrivacy(stored.retentionUntil);
    const retained = await prisma.generatedReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(retained.status).toBe(GeneratedReportStatus.EXPIRED);
    expect((retained.datasetSnapshot as { passes: unknown[] }).passes).toEqual([]);
  }, 60_000);

  it('serializes concurrent authorization and identical PDF attachment into one durable result', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const cookie = await login(fixture.email);
    const authorizations = await Promise.all([
      authorize(fixture.eventId, cookie, 'reports-concurrent-001', 'attendance-pdf'),
      authorize(fixture.eventId, cookie, 'reports-concurrent-001', 'attendance-pdf')
    ]);
    expect(authorizations.map(({ status }) => status)).toEqual([200, 200]);
    expect(authorizations[0].body).toEqual(authorizations[1].body);
    expect(await prisma.generatedReport.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_AUTHORIZE' } })).toBe(1);

    const authorized = authorizations[0].body;
    const pdf = await boundPdf(authorized.reportId as string, authorized.datasetHashSha256 as string);
    const uploads = await Promise.all([
      uploadPdf(fixture.eventId, authorized.reportId, cookie, pdf, authorized.datasetHashSha256),
      uploadPdf(fixture.eventId, authorized.reportId, cookie, pdf, authorized.datasetHashSha256)
    ]);
    expect(uploads.map(({ status }) => status)).toEqual([200, 200]);
    expect(uploads[0].body).toEqual(uploads[1].body);
    expect(await prisma.fileAsset.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_FILE_ATTACH' } })).toBe(1);
  }, 60_000);

  async function createFixture(code: ServiceCode) {
    const owner = await createClientUser();
    const service = await prisma.service.create({ data: { code } });
    const price = await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.PLANNER,
        credits: 0,
        validFrom: new Date('2020-01-01T00:00:00.000Z')
      }
    });
    const receipt = await prisma.receipt.create({
      data: {
        clientId: owner.clientId,
        operationType: 'EVENT_ACTIVATION',
        operationReference: `report-fixture:${randomUUID()}`,
        idempotencyKey: `report-fixture:${randomUUID()}`,
        resultSnapshot: {}
      }
    });
    const [clock] = await prisma.$queryRaw<Array<{ eventDateTime: Date }>>`
      SELECT clock_timestamp() - interval '1 day' AS "eventDateTime"
    `;
    const event = await prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        serviceId: service.id,
        name: code === ServiceCode.PHYSICAL_QR ? 'Evento físico' : 'Evento digital',
        socialType: EventSocialType.WEDDING,
        status: EventStatus.DRAFT,
        eventDateTime: clock!.eventDateTime,
        timeZone: 'America/Mexico_City',
        capacity: 20
      }
    });
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await transaction.event.update({
        where: { id: event.id },
        data: {
          status: EventStatus.CLOSED,
          activatedAt: new Date(),
          activatedByUserId: owner.userId,
          activatedServiceId: service.id,
          activatedServicePriceId: price.id,
          baseCostCredits: 0,
          promotionDiscountCredits: 0,
          finalCostCredits: 0,
          purchasedCreditsUsed: 0,
          creditLineCreditsUsed: 0,
          activationReceiptId: receipt.id,
          activationIdempotencyKey: `report-activation:${event.id}`
        }
      });
    });
    return { ...owner, eventId: event.id };
  }

  async function createAttendanceData(eventId: string, userId: string) {
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const contact = await transaction.contact.create({
        data: { eventId, name: 'Invitación Familia', whatsappPhoneNormalized: '+525511223344' }
      });
      const invitation = await transaction.invitation.create({
        data: {
          eventId,
          contactId: contact.id,
          responseStatus: 'CONFIRMED',
          invitationTokenNonce: 'a'.repeat(64),
          qrTokenNonce: 'b'.repeat(64)
        }
      });
      await transaction.assistant.create({
        data: {
          eventId,
          invitationId: invitation.id,
          name: 'Persona Invitada',
          isPrimary: true,
          responseStatus: 'CONFIRMED'
        }
      });
    });
    expect(userId).toBeTruthy();
  }

  async function createClientUser() {
    const client = await prisma.client.create({
      data: { type: ClientType.PLANNER, name: randomUUID(), status: ClientStatus.ACTIVE }
    });
    const email = `${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: UserRole.INDEPENDENT_PLANNER,
        clientId: client.id
      }
    });
    return { clientId: client.id, userId: user.id, email };
  }

  async function createAdminAndLogin() {
    const email = `${randomUUID()}@example.test`;
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role: UserRole.PLATFORM_ADMIN }
    });
    return login(email);
  }

  async function login(email: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    return response.headers['set-cookie'] as unknown as string[];
  }

  function authorize(eventId: string, cookie: string[], key: string, endpoint: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/reports/${endpoint}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key);
  }

  function uploadPdf(eventId: string, reportId: string, cookie: string[], pdf: Buffer, hash: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/reports/${reportId}/file`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .field('templateVersion', '1')
      .field('datasetHashSha256', hash)
      .attach('file', pdf, { filename: 'rendered.pdf', contentType: 'application/pdf' });
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "generated_report", "album_photo", "album", "physical_pass_generation_operation", "physical_pass",
        "staff_token", "check_in", "hotspot", "flipbook_page", "invitation_design", "file_asset", "assistant",
        "invitation", "contact_import_preview", "contact", "contact_group", "event_state_operation", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});

async function boundPdf(reportId: string, hash: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  document.setSubject(`InvitacionesPremium Report ${reportId}`);
  document.setKeywords(['template:1', `dataset:${hash}`]);
  return Buffer.from(await document.save());
}
