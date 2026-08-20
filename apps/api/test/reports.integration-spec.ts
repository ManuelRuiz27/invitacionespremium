import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import jsQR from 'jsqr';
import { PDFDocument } from 'pdf-lib';
import { Client as PgClient } from 'pg';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { FileStorage } from '../src/file-assets/file-storage';
import {
  ClientStatus,
  ClientType,
  EventSocialType,
  EventStatus,
  FloorplanGeometry,
  FloorplanShapeKind,
  GeneratedReportPrivacyMode,
  GeneratedReportStatus,
  GeneratedReportType,
  HotspotAction,
  HotspotVisualOwnerType,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { reportUploadLockDomain } from '../src/reports/report-upload-lock.service';
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
  let appB: INestApplication;
  let prisma: PrismaService;
  let reports: ReportsService;
  let storage: FileStorage;
  let audit: AuditService;
  let invitationTokens: InvitationTokenService;

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
    appB = await createApp();
    await appB.init();
    prisma = app.get(PrismaService);
    reports = app.get(ReportsService);
    storage = app.get(FileStorage);
    audit = app.get(AuditService);
    invitationTokens = app.get(InvitationTokenService);
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await Promise.all([app.close(), appB.close()]);
    const observer = new PgClient({ connectionString: process.env.DATABASE_URL });
    await observer.connect();
    const sessions = await observer.query<{ count: string }>(`
      SELECT count(*)::text AS "count"
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND application_name = 'invitacionespremium-report-upload-lock'
    `);
    const advisoryLocks = await observer.query<{ count: string }>(`
      SELECT count(*)::text AS "count"
      FROM pg_locks
      WHERE locktype = 'advisory'
    `);
    await observer.end();
    expect(Number(sessions.rows[0]?.count ?? -1)).toBe(0);
    expect(Number(advisoryLocks.rows[0]?.count ?? -1)).toBe(0);
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
    const asset = await prisma.fileAsset.findFirstOrThrow({
      where: { ownerId: reportId, fileType: 'GENERATED_REPORT_PDF' }
    });

    const genericList = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/file-assets`)
      .set('Cookie', cookie)
      .expect(200);
    expect(genericList.body).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/file-assets/${asset.id}`)
      .set('Cookie', cookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/file-assets/${asset.id}/content`)
      .set('Cookie', cookie)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${fixture.eventId}/file-assets/${asset.id}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(404);

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

    const boundary = await forceReportBoundary(reportId, 'detailed');
    const projectedReplay = await authorize(fixture.eventId, cookie, 'reports-attendance-001', 'attendance-pdf').expect(
      200
    );
    expect(projectedReplay.body).toMatchObject({
      status: 'HIDDEN',
      privacyMode: 'AGGREGATE',
      dataset: { rows: [] }
    });
    expect(projectedReplay.body).not.toHaveProperty('fileUploadPath');
    expect(projectedReplay.body.datasetHashSha256).not.toBe(authorized.body.datasetHashSha256);
    expect(JSON.stringify(projectedReplay.body)).not.toContain('Persona Invitada');
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports/${reportId}/download`)
      .set('Cookie', cookie)
      .expect(410);

    await reports.expirePrivacy(boundary);
    const expired = await prisma.generatedReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(expired).toMatchObject({
      status: GeneratedReportStatus.HIDDEN,
      privacyMode: GeneratedReportPrivacyMode.AGGREGATE
    });
    expect((expired.datasetSnapshot as { rows: unknown[] }).rows).toEqual([]);
    expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id: asset.id } })).toMatchObject({ status: 'HIDDEN' });
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_PRIVACY_EXPIRE' } })).toBe(1);
    await reports.expirePrivacy(boundary);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_PRIVACY_EXPIRE' } })).toBe(1);
    const reportAudits = await prisma.auditLog.findMany({
      where: { resourceType: 'GENERATED_REPORT' },
      select: { metadata: true }
    });
    expect(JSON.stringify(reportAudits)).not.toMatch(
      new RegExp(`${authorized.body.datasetHashSha256}|${asset.checksumSha256}|storageKey|originalName`, 'iu')
    );
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports/${reportId}/download`)
      .set('Cookie', cookie)
      .expect(410);
  }, 60_000);

  it('runs the real Attendance HTTP flow from Event creation through RSVP, scanner, close and private PDF', async () => {
    const owner = await createClientUser();
    const cookie = await login(owner.email);
    const providerCookie = await createAdminAndLogin();
    const service = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.PLANNER,
        credits: 0,
        validFrom: new Date('2020-01-01T00:00:00.000Z')
      }
    });
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({
        name: 'Boda reportes E2E',
        serviceId: service.id,
        socialType: EventSocialType.WEDDING,
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City',
        capacity: 10,
        confirmationEnabled: true,
        floorplanEnabled: true,
        locationUrl: 'https://example.com/ubicacion',
        giftRegistryUrl: 'https://example.com/regalos'
      })
      .expect(201);
    const eventId = created.body.id as string;
    const providerBase = `/api/v1/admin/clients/${owner.clientId}/events/${eventId}`;

    for (const [name, phone] of [
      ['Ingreso activo', '+525511223341'],
      ['Ingreso revertido', '+525511223342'],
      ['Invitación cancelada', '+525511223343']
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/contacts`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send({ name, whatsappPhone: phone })
        .expect(201);
    }
    const invitations = await prisma.invitation.findMany({
      where: { eventId },
      include: { assistants: true },
      orderBy: { createdAt: 'asc' }
    });
    expect(invitations).toHaveLength(3);

    const initial = await uploadRealImage(providerBase, providerCookie, 'FLYER', 'FLYER_INITIAL_IMAGE');
    const qr = await uploadRealImage(providerBase, providerCookie, 'FLYER', 'FLYER_QR_IMAGE');
    await request(app.getHttpServer())
      .post(`${providerBase}/design/flyer`)
      .set('Origin', origin)
      .set('Cookie', providerCookie)
      .send({ initialAssetId: initial, qrAssetId: qr })
      .expect(201);
    const floorplanImageId = await uploadFloorplanImage(providerBase, providerCookie);
    await request(app.getHttpServer())
      .post(`${providerBase}/floorplan`)
      .set('Origin', origin)
      .set('Cookie', providerCookie)
      .send({ imageAssetId: floorplanImageId })
      .expect(201);
    const table = await request(app.getHttpServer())
      .post(`${providerBase}/floorplan/shapes`)
      .set('Origin', origin)
      .set('Cookie', providerCookie)
      .send({
        kind: FloorplanShapeKind.TABLE,
        geometry: FloorplanGeometry.CIRCLE,
        name: 'Mesa piloto',
        capacity: 3,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        rotation: 0,
        polygonPoints: null
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${providerBase}/floorplan/lock`)
      .set('Origin', origin)
      .set('Cookie', providerCookie)
      .send({})
      .expect(201);
    for (const action of [
      HotspotAction.RSVP,
      HotspotAction.LOCATION,
      HotspotAction.GIFT_REGISTRY,
      HotspotAction.QR_AREA
    ]) {
      await request(app.getHttpServer())
        .post(`${providerBase}/hotspots`)
        .set('Origin', origin)
        .set('Cookie', providerCookie)
        .send({
          visualOwnerType: HotspotVisualOwnerType.FLYER,
          action,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          priority: 1
        })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/activate`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-attendance-activate')
      .send({})
      .expect(200);

    for (const invitation of invitations) {
      const token = invitationTokens.issue('INVITATION', invitation.id, invitation.invitationTokenNonce);
      await request(app.getHttpServer())
        .post(`/api/v1/public/invitations/${encodeURIComponent(token)}/confirm`)
        .send({ additionalAssistants: [] })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/seating/assign`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-seating')
      .send({
        assistantIds: invitations.map((invitation) => invitation.assistants.find(({ isPrimary }) => isPrimary)!.id),
        tableShapeId: table.body.id
      })
      .expect(201);
    const staff = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ alias: 'Reportes E2E' })
      .expect(201);
    for (const index of [0, 1]) {
      const invitation = invitations[index]!;
      const assistant = invitation.assistants.find(({ isPrimary }) => isPrimary)!;
      const checkedIn = await request(app.getHttpServer())
        .post(`/api/v1/scanner/${encodeURIComponent(staff.body.token as string)}/check-in`)
        .set('Idempotency-Key', `reports-e2e-check-in-${index}`)
        .send({ invitationId: invitation.id, assistantIds: [assistant.id] })
        .expect(200);
      expect(checkedIn.body.checkedIn[0].table).toEqual({ id: table.body.id, name: 'Mesa piloto' });
    }
    const reverted = await prisma.checkIn.findFirstOrThrow({
      where: { assistantId: invitations[1]!.assistants[0]!.id, revertedAt: null }
    });
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/check-ins/${reverted.id}/revert`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-revert')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/invitations/${invitations[2]!.id}/cancel`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-cancel')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/close`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-attendance-close')
      .expect(200);

    const authorized = await authorize(eventId, cookie, 'reports-e2e-attendance', 'attendance-pdf').expect(200);
    expect(authorized.body.dataset).toMatchObject({
      summary: {
        invitations: { total: 3, confirmed: 2, cancelled: 1 },
        assistants: { confirmed: 2, checkedIn: 1, notCheckedIn: 1 },
        checkIns: { active: 1, reverted: 1 }
      },
      incidents: { revertedCheckIns: 1, cancelledInvitations: 1 }
    });
    expect(
      authorized.body.dataset.rows.map((row: { attendanceStatus: string }) => row.attendanceStatus).sort()
    ).toEqual(['CHECKED_IN', 'NO_SHOW']);
    expect(
      authorized.body.dataset.rows.every((row: { tableName: string | null }) => row.tableName === 'Mesa piloto')
    ).toBe(true);
    expect(JSON.stringify(authorized.body.dataset)).not.toMatch(
      /52551122334|contactId|assistantId|invitationId|staffToken|qrToken/iu
    );
    const pdf = await boundPdf(authorized.body.reportId, authorized.body.datasetHashSha256);
    await uploadPdf(eventId, authorized.body.reportId, cookie, pdf, authorized.body.datasetHashSha256).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/reports/${authorized.body.reportId}/download`)
      .set('Cookie', cookie)
      .expect(200)
      .expect('Content-Type', 'application/pdf');
  }, 90_000);

  it('runs the real Physical Passes HTTP flow through generation, QR use, close, report and retention', async () => {
    const owner = await createClientUser();
    const cookie = await login(owner.email);
    const service = await prisma.service.create({ data: { code: ServiceCode.PHYSICAL_QR } });
    await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.PLANNER,
        credits: 0,
        validFrom: new Date('2020-01-01T00:00:00.000Z')
      }
    });
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({
        name: 'Pases reportes E2E',
        serviceId: service.id,
        socialType: EventSocialType.OTHER,
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City',
        capacity: 2
      })
      .expect(201);
    const eventId = created.body.id as string;
    const generated = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/physical-passes/generate`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-physical-generate')
      .send({ quantity: 2 })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/activate`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-physical-activate')
      .send({})
      .expect(200);
    const svg = await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/physical-passes/${generated.body.passes[0].id}/svg`)
      .set('Cookie', cookie)
      .expect(200);
    const staff = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ alias: 'Pases E2E' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(staff.body.token as string)}/physical-passes/scan`)
      .set('Idempotency-Key', 'reports-e2e-physical-use')
      .send({ qrToken: await decodeSvgQr(svg.body as Buffer) })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/close`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'reports-e2e-physical-close')
      .expect(200);

    const authorized = await authorize(eventId, cookie, 'reports-e2e-physical', 'physical-passes-pdf').expect(200);
    expect(authorized.body.dataset).toMatchObject({ summary: { total: 2, used: 1, unused: 1 } });
    const pdf = await boundPdf(authorized.body.reportId, authorized.body.datasetHashSha256);
    await uploadPdf(eventId, authorized.body.reportId, cookie, pdf, authorized.body.datasetHashSha256).expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/reports/${authorized.body.reportId}/download`)
      .set('Cookie', cookie)
      .expect(200);
    await forceReportBoundary(authorized.body.reportId, 'retention');
    await authorize(eventId, cookie, 'reports-e2e-physical', 'physical-passes-pdf').expect(410);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/reports/${authorized.body.reportId}/download`)
      .set('Cookie', cookie)
      .expect(410);
  }, 90_000);

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
    const validPdf = await boundPdf(reportId, authorized.body.datasetHashSha256 as string);
    await uploadPdf(fixture.eventId, reportId, cookie, validPdf, authorized.body.datasetHashSha256).expect(200);
    const readyAsset = await prisma.fileAsset.findFirstOrThrow({ where: { ownerId: reportId, status: 'READY' } });

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
      await expectTransactionFailure(
        client,
        [
          {
            text: `UPDATE generated_report
              SET status = 'HIDDEN', hidden_at = clock_timestamp()
              WHERE id = $1`,
            values: [reportId]
          }
        ],
        /generated_report_private_asset_hidden/iu
      );
      await expectTransactionFailure(
        client,
        [
          {
            text: `UPDATE generated_report
              SET status = 'EXPIRED', expired_at = clock_timestamp()
              WHERE id = $1`,
            values: [reportId]
          }
        ],
        /generated_report_private_asset_hidden/iu
      );
      await expectTransactionFailure(
        client,
        [{ text: `UPDATE file_asset SET status = 'HIDDEN' WHERE id = $1`, values: [readyAsset.id] }],
        /generated_report_file_asset_hidden_match/iu
      );
      await expectTransactionFailure(
        client,
        [
          {
            text: `INSERT INTO file_asset (
                id, client_id, event_id, owner_type, owner_id, file_type, storage_provider, storage_key,
                original_name, mime_type, size_bytes, checksum_sha256, created_by_user_id, status,
                associated_at, created_at, updated_at
              )
              SELECT $2::uuid, client_id, event_id, owner_type, owner_id, file_type, storage_provider,
                repeat('f', 64), 'report.pdf', mime_type, size_bytes, checksum_sha256, created_by_user_id,
                'UPLOADING', clock_timestamp(), clock_timestamp(), clock_timestamp()
              FROM file_asset WHERE id = $1`,
            values: [readyAsset.id, randomUUID()]
          }
        ],
        /file_asset_generated_report_owner_key|duplicate key/iu
      );
      await expectTransactionFailure(
        client,
        [{ text: `UPDATE file_asset SET file_type = 'INVITATION_QR_SVG' WHERE id = $1`, values: [readyAsset.id] }],
        /file asset identity is immutable/iu
      );
    } finally {
      await client.end();
    }
    const residue = await prisma.fileAsset.create({
      data: {
        clientId: fixture.clientId,
        eventId: fixture.eventId,
        ownerType: 'GENERATED_REPORT',
        fileType: 'GENERATED_REPORT_PDF',
        storageKey: 'e'.repeat(64),
        originalName: 'failed-report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 0,
        createdByUserId: fixture.userId,
        status: 'FAILED',
        failureCode: 'REPORT_UPLOAD_FAILED'
      }
    });
    expect(residue).toMatchObject({ ownerId: null, status: 'FAILED' });
    await expect(
      prisma.fileAsset.create({
        data: {
          clientId: fixture.clientId,
          eventId: fixture.eventId,
          ownerType: 'GENERATED_REPORT',
          fileType: 'GENERATED_REPORT_PDF',
          storageKey: 'd'.repeat(64),
          originalName: 'ready-report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          checksumSha256: 'c'.repeat(64),
          createdByUserId: fixture.userId,
          status: 'READY'
        }
      })
    ).rejects.toThrow(/generated_report_file_asset_residue/iu);
    expect(await prisma.generatedReport.count({ where: { id: reportId } })).toBe(1);
    const retentionBoundary = await forceReportBoundary(reportId, 'retention');
    await authorize(fixture.eventId, cookie, 'reports-physical-001', 'physical-passes-pdf')
      .expect(410)
      .expect(({ body }) => expect(body.code).toBe('REPORT_CONTENT_EXPIRED'));
    const clientList = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports`)
      .set('Cookie', cookie)
      .expect(200);
    expect(clientList.body[0]).toMatchObject({ status: 'EXPIRED', privacyMode: 'AGGREGATE' });
    expect(clientList.body[0]).not.toHaveProperty('downloadPath');
    const adminCookie = await createAdminAndLogin();
    const adminList = await request(app.getHttpServer())
      .get(`/api/v1/admin/reports/events/${fixture.eventId}`)
      .set('Cookie', adminCookie)
      .expect(200);
    expect(adminList.body[0]).toMatchObject({ status: 'EXPIRED', privacyMode: 'AGGREGATE' });
    await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/reports/${reportId}/download`)
      .set('Cookie', cookie)
      .expect(410);

    await reports.expirePrivacy(retentionBoundary);
    const retained = await prisma.generatedReport.findUniqueOrThrow({ where: { id: reportId } });
    expect(retained.status).toBe(GeneratedReportStatus.EXPIRED);
    expect((retained.datasetSnapshot as { passes: unknown[] }).passes).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_RETENTION_EXPIRE' } })).toBe(1);
    await reports.expirePrivacy(retentionBoundary);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_RETENTION_EXPIRE' } })).toBe(1);
  }, 60_000);

  it('serializes concurrent authorization and identical PDF attachment into one durable result', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const cookie = await login(fixture.email);
    const authorizations = await startBehindVerifiedEventLock(fixture.eventId, () => [
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

    const distinct = await startBehindVerifiedEventLock(fixture.eventId, () => [
      authorize(fixture.eventId, cookie, 'reports-concurrent-002-a', 'attendance-pdf'),
      authorize(fixture.eventId, cookie, 'reports-concurrent-002-b', 'attendance-pdf')
    ]);
    expect(distinct.map(({ status }) => status)).toEqual([200, 200]);
    expect(distinct[0].body.reportId).not.toBe(distinct[1].body.reportId);
    expect(
      await prisma.generatedReport.count({
        where: { eventId: fixture.eventId, type: GeneratedReportType.ATTENDANCE }
      })
    ).toBe(3);
    expect(
      await prisma.auditLog.count({
        where: { eventId: fixture.eventId, action: 'REPORT_AUTHORIZE' }
      })
    ).toBe(3);
  }, 60_000);

  it('recovers storage and audit failures without leaving an owner that blocks the next upload', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const cookie = await login(fixture.email);
    const authorized = await authorize(fixture.eventId, cookie, 'reports-recovery-001', 'attendance-pdf').expect(200);
    const pdf = await boundPdf(authorized.body.reportId, authorized.body.datasetHashSha256);

    const writeFailure = vi.spyOn(storage, 'write').mockRejectedValueOnce(new Error('storage unavailable'));
    await uploadPdf(fixture.eventId, authorized.body.reportId, cookie, pdf, authorized.body.datasetHashSha256).expect(
      500
    );
    writeFailure.mockRestore();

    const failedAfterStorage = await prisma.fileAsset.findFirstOrThrow({
      where: { fileType: 'GENERATED_REPORT_PDF', status: 'FAILED' }
    });
    expect(failedAfterStorage).toMatchObject({
      ownerId: null,
      associatedAt: null,
      failureCode: 'REPORT_UPLOAD_FAILED'
    });

    const auditFailure = vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit unavailable'));
    await uploadPdf(fixture.eventId, authorized.body.reportId, cookie, pdf, authorized.body.datasetHashSha256).expect(
      500
    );
    auditFailure.mockRestore();

    const failedAssets = await prisma.fileAsset.findMany({
      where: { fileType: 'GENERATED_REPORT_PDF', status: 'FAILED' }
    });
    expect(failedAssets).toHaveLength(2);
    expect(failedAssets.every((asset) => asset.ownerId === null && asset.associatedAt === null)).toBe(true);

    const retry = await uploadPdf(
      fixture.eventId,
      authorized.body.reportId,
      cookie,
      pdf,
      authorized.body.datasetHashSha256
    ).expect(200);
    expect(retry.body).toMatchObject({ status: 'READY' });
    expect(
      await prisma.fileAsset.count({
        where: { ownerId: authorized.body.reportId, status: 'READY', fileType: 'GENERATED_REPORT_PDF' }
      })
    ).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'REPORT_FILE_ATTACH' } })).toBe(1);
  }, 60_000);

  it('serializes equal and different concurrent uploads with a deterministic storage barrier', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const cookie = await login(fixture.email);
    const first = await authorize(fixture.eventId, cookie, 'reports-upload-barrier-1', 'attendance-pdf').expect(200);
    const firstPdf = await boundPdf(first.body.reportId, first.body.datasetHashSha256);
    const originalWrite = storage.write.bind(storage);
    const entered = deferred();
    const release = deferred();
    const write = vi.spyOn(storage, 'write').mockImplementationOnce(async (input) => {
      entered.resolve();
      await release.promise;
      await originalWrite(input);
    });

    const equalA = uploadPdf(fixture.eventId, first.body.reportId, cookie, firstPdf, first.body.datasetHashSha256);
    const equalAPromise = equalA.then((response) => response);
    await entered.promise;
    const equalBPromise = uploadPdf(
      fixture.eventId,
      first.body.reportId,
      cookie,
      firstPdf,
      first.body.datasetHashSha256,
      appB
    ).then((response) => response);
    await waitForAdvisoryLockWaiters(1);
    release.resolve();
    const equal = await Promise.all([equalAPromise, equalBPromise]);
    expect(equal.map(({ status }) => status)).toEqual([200, 200]);
    expect(equal[0].body).toEqual(equal[1].body);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
    expect(await prisma.generatedReport.count({ where: { id: first.body.reportId } })).toBe(1);
    expect(await prisma.fileAsset.count({ where: { ownerId: first.body.reportId, status: 'READY' } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: first.body.reportId, action: 'REPORT_FILE_ATTACH' }
      })
    ).toBe(1);

    const second = await authorize(fixture.eventId, cookie, 'reports-upload-barrier-2', 'attendance-pdf').expect(200);
    const winningPdf = await boundPdf(second.body.reportId, second.body.datasetHashSha256, 'winner');
    const losingPdf = await boundPdf(second.body.reportId, second.body.datasetHashSha256, 'loser');
    const enteredDifferent = deferred();
    const releaseDifferent = deferred();
    const differentWrite = vi.spyOn(storage, 'write').mockImplementationOnce(async (input) => {
      enteredDifferent.resolve();
      await releaseDifferent.promise;
      await originalWrite(input);
    });
    const winnerPromise = uploadPdf(
      fixture.eventId,
      second.body.reportId,
      cookie,
      winningPdf,
      second.body.datasetHashSha256
    ).then((response) => response);
    await enteredDifferent.promise;
    const loserPromise = uploadPdf(
      fixture.eventId,
      second.body.reportId,
      cookie,
      losingPdf,
      second.body.datasetHashSha256,
      appB
    ).then((response) => response);
    await waitForAdvisoryLockWaiters(1);
    releaseDifferent.resolve();
    const [winner, loser] = await Promise.all([winnerPromise, loserPromise]);
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(409);
    expect(loser.body.code).toBe('REPORT_FILE_ALREADY_ATTACHED');
    expect(differentWrite).toHaveBeenCalledTimes(1);
    differentWrite.mockRestore();
    expect(
      await prisma.fileAsset.count({
        where: { ownerId: second.body.reportId, status: 'READY', fileType: 'GENERATED_REPORT_PDF' }
      })
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: second.body.reportId, action: 'REPORT_FILE_ATTACH' }
      })
    ).toBe(1);
    expect(
      await prisma.fileAsset.count({
        where: { ownerId: second.body.reportId, status: 'UPLOADING' }
      })
    ).toBe(0);
  }, 60_000);

  it('recovers an UPLOADING reservation after the PostgreSQL session holding the advisory lock disappears', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const cookie = await login(fixture.email);
    const authorized = await authorize(fixture.eventId, cookie, 'reports-crashed-instance', 'attendance-pdf').expect(
      200
    );
    const pdf = await boundPdf(authorized.body.reportId, authorized.body.datasetHashSha256);
    const crashed = new PgClient({ connectionString: process.env.DATABASE_URL });
    await crashed.connect();
    let connected = true;
    try {
      await crashed.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
        reportUploadLockDomain(authorized.body.reportId)
      ]);
      const stale = await prisma.fileAsset.create({
        data: {
          clientId: fixture.clientId,
          eventId: fixture.eventId,
          ownerType: 'GENERATED_REPORT',
          ownerId: authorized.body.reportId,
          fileType: 'GENERATED_REPORT_PDF',
          storageProvider: 'LOCAL',
          storageKey: storage.generateKey(),
          originalName: 'attendance-report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: pdf.length,
          checksumSha256: '0'.repeat(64),
          createdByUserId: fixture.userId,
          associatedAt: new Date(),
          status: 'UPLOADING'
        }
      });

      const uploadPromise = uploadPdf(
        fixture.eventId,
        authorized.body.reportId,
        cookie,
        pdf,
        authorized.body.datasetHashSha256,
        appB
      ).then((response) => response);
      await waitForAdvisoryLockWaiters(1);
      await crashed.end();
      connected = false;

      const uploaded = await uploadPromise;
      expect(uploaded.status).toBe(200);
      expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id: stale.id } })).toMatchObject({
        status: 'FAILED',
        ownerId: null,
        associatedAt: null,
        failureCode: 'REPORT_UPLOAD_REPLACED'
      });
      expect(
        await prisma.fileAsset.count({
          where: { ownerId: authorized.body.reportId, status: 'READY', fileType: 'GENERATED_REPORT_PDF' }
        })
      ).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { resourceId: authorized.body.reportId, action: 'REPORT_FILE_ATTACH' }
        })
      ).toBe(1);
    } finally {
      if (connected) await crashed.end().catch(() => undefined);
    }
  }, 60_000);

  it('recomputes privacy after waiting for another instance advisory lock without creating a reservation', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const cookie = await login(fixture.email);
    const authorized = await authorize(fixture.eventId, cookie, 'reports-lock-privacy', 'attendance-pdf').expect(200);
    const pdf = await boundPdf(authorized.body.reportId, authorized.body.datasetHashSha256);
    const blocker = new PgClient({ connectionString: process.env.DATABASE_URL });
    await blocker.connect();
    let connected = true;
    try {
      await blocker.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
        reportUploadLockDomain(authorized.body.reportId)
      ]);
      const uploadPromise = uploadPdf(
        fixture.eventId,
        authorized.body.reportId,
        cookie,
        pdf,
        authorized.body.datasetHashSha256,
        appB
      ).then((response) => response);
      await waitForAdvisoryLockWaiters(1);
      await forceReportBoundary(authorized.body.reportId, 'detailed');
      await blocker.end();
      connected = false;

      const response = await uploadPromise;
      expect(response.status).toBe(410);
      expect(response.body.code).toBe('REPORT_CONTENT_EXPIRED');
      expect(
        await prisma.fileAsset.count({
          where: { ownerType: 'GENERATED_REPORT', ownerId: authorized.body.reportId }
        })
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { resourceId: authorized.body.reportId, action: 'REPORT_FILE_ATTACH' }
        })
      ).toBe(0);
    } finally {
      if (connected) await blocker.end().catch(() => undefined);
    }
  }, 60_000);

  it('cleans a reserved upload when privacy expires while storage is in flight', async () => {
    const fixture = await createFixture(ServiceCode.FLYER);
    const cookie = await login(fixture.email);
    const authorized = await authorize(fixture.eventId, cookie, 'reports-privacy-race', 'attendance-pdf').expect(200);
    const pdf = await boundPdf(authorized.body.reportId, authorized.body.datasetHashSha256);
    const originalWrite = storage.write.bind(storage);
    const entered = deferred();
    const release = deferred();
    const write = vi.spyOn(storage, 'write').mockImplementationOnce(async (input) => {
      entered.resolve();
      await release.promise;
      await originalWrite(input);
    });
    const uploadPromise = uploadPdf(
      fixture.eventId,
      authorized.body.reportId,
      cookie,
      pdf,
      authorized.body.datasetHashSha256
    ).then((response) => response);
    await entered.promise;
    await forceReportBoundary(authorized.body.reportId, 'detailed');
    release.resolve();
    const response = await uploadPromise;
    write.mockRestore();
    expect(response.status).toBe(410);
    expect(await prisma.fileAsset.findFirstOrThrow({ where: { fileType: 'GENERATED_REPORT_PDF' } })).toMatchObject({
      status: 'FAILED',
      ownerId: null,
      associatedAt: null
    });
    expect(await prisma.generatedReport.findUniqueOrThrow({ where: { id: authorized.body.reportId } })).toMatchObject({
      status: 'AUTHORIZED',
      fileAssetId: null
    });
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

  function uploadPdf(
    eventId: string,
    reportId: string,
    cookie: string[],
    pdf: Buffer,
    hash: string,
    targetApp: INestApplication = app
  ) {
    return request(targetApp.getHttpServer())
      .post(`/api/v1/events/${eventId}/reports/${reportId}/file`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .field('templateVersion', '1')
      .field('datasetHashSha256', hash)
      .attach('file', pdf, { filename: 'rendered.pdf', contentType: 'application/pdf' });
  }

  async function uploadRealImage(
    providerBase: string,
    providerCookie: string[],
    ownerType: string,
    fileType: string
  ): Promise<string> {
    const image = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#334155' }
    })
      .png()
      .toBuffer();
    const response = await request(app.getHttpServer())
      .post(`${providerBase}/design/file-assets`)
      .set('Origin', origin)
      .set('Cookie', providerCookie)
      .field('ownerType', ownerType)
      .field('fileType', fileType)
      .attach('file', image, { filename: 'visual.png', contentType: 'image/png' })
      .expect(201);
    return response.body.id as string;
  }

  async function uploadFloorplanImage(providerBase: string, providerCookie: string[]): Promise<string> {
    const image = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#e2e8f0' }
    })
      .png()
      .toBuffer();
    const response = await request(app.getHttpServer())
      .post(`${providerBase}/floorplan/file-assets`)
      .set('Origin', origin)
      .set('Cookie', providerCookie)
      .attach('file', image, { filename: 'floorplan.png', contentType: 'image/png' })
      .expect(201);
    return response.body.id as string;
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "generated_report", "album_photo", "album", "physical_pass_generation_operation", "physical_pass",
        "staff_token", "check_in", "hotspot", "flipbook_page", "invitation_design", "seating_operation",
        "floorplan_shape", "floorplan", "file_asset", "assistant",
        "invitation", "contact_import_preview", "contact", "contact_group", "event_state_operation", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }

  async function forceReportBoundary(reportId: string, boundary: 'detailed' | 'retention'): Promise<Date> {
    const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT clock_timestamp() - interval '1 millisecond' AS "now"
    `;
    const at = clock!.now;
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      if (boundary === 'detailed') {
        await transaction.generatedReport.update({
          where: { id: reportId },
          data: { detailedUntil: at }
        });
      } else {
        await transaction.generatedReport.update({
          where: { id: reportId },
          data: { detailedUntil: new Date(at.getTime() - 1), retentionUntil: at }
        });
      }
    });
    return at;
  }
});

async function startBehindVerifiedEventLock<A, B>(
  eventId: string,
  start: () => [PromiseLike<A>, PromiseLike<B>]
): Promise<[Awaited<A>, Awaited<B>]> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const blocker = new PgClient({ connectionString: databaseUrl });
  const observer = new PgClient({ connectionString: databaseUrl });
  await Promise.all([blocker.connect(), observer.connect()]);
  let committed = false;
  let first: Promise<Awaited<A>> | undefined;
  let second: Promise<Awaited<B>> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT "id" FROM "event" WHERE "id" = $1::uuid FOR UPDATE', [eventId]);
    const pending = start();
    first = Promise.resolve(pending[0]);
    await waitForLockWaiters(observer, 1);
    second = Promise.resolve(pending[1]);
    await waitForLockWaiters(observer, 2);
    await blocker.query('COMMIT');
    committed = true;
    return await Promise.all([first, second]);
  } finally {
    if (!committed) await blocker.query('ROLLBACK').catch(() => undefined);
    if (!committed) {
      await Promise.allSettled([first, second].filter((operation) => operation !== undefined));
    }
    await Promise.all([blocker.end(), observer.end()]);
  }
}

async function waitForLockWaiters(observer: PgClient, expected: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ count: string }>(`
      SELECT count(*)::text AS "count"
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `);
    if (Number(result.rows[0]?.count ?? 0) >= expected) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Expected ${expected} PostgreSQL lock waiters before releasing the race barrier.`);
}

async function waitForAdvisoryLockWaiters(expected: number): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const observer = new PgClient({ connectionString: databaseUrl });
  await observer.connect();
  try {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const result = await observer.query<{ count: string }>(`
        SELECT count(*)::text AS "count"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND application_name = 'invitacionespremium-report-upload-lock'
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
          AND query LIKE 'SELECT pg_advisory_lock(%'
      `);
      if (Number(result.rows[0]?.count ?? 0) >= expected) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    await observer.end();
  }
  throw new Error(`Expected ${expected} PostgreSQL advisory lock waiters before releasing the barrier.`);
}

async function boundPdf(reportId: string, hash: string, title?: string): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([595, 842]);
  document.setSubject(`InvitacionesPremium Report ${reportId}`);
  document.setKeywords(['template:1', `dataset:${hash}`]);
  if (title) document.setTitle(title);
  return Buffer.from(await document.save());
}

async function decodeSvgQr(svg: Buffer): Promise<string> {
  const raster = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height);
  if (!decoded?.data) throw new Error('Could not decode generated physical pass QR.');
  return decoded.data;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function expectTransactionFailure(
  client: PgClient,
  statements: Array<{ text: string; values?: unknown[] }>,
  pattern: RegExp
): Promise<void> {
  let failure: unknown;
  await client.query('BEGIN');
  try {
    for (const statement of statements) {
      await client.query(statement.text, statement.values);
    }
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    await client.query('COMMIT');
  } catch (error) {
    failure = error;
    await client.query('ROLLBACK');
  }
  expect(String(failure)).toMatch(pattern);
}
