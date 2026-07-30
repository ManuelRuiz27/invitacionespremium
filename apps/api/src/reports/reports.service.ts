import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import {
  AuditActorType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  GeneratedReportPrivacyMode,
  GeneratedReportStatus,
  GeneratedReportType,
  Prisma,
  ServiceCode,
  StorageProvider
} from '../generated/prisma/client';
import { FileStorage } from '../file-assets/file-storage';
import { ReportsDatasetService } from './reports-dataset.service';
import type {
  AdminReportListItem,
  ReportAuthorizationResponse,
  ReportFileUploadInput,
  ReportListItem,
  ReportParameters
} from './reports.dto';
import type { UploadedPdf } from './reports-pdf.service';
import { ReportsPdfService } from './reports-pdf.service';
import { aggregateReportDataset, projectGeneratedReportAt, sha256, stableStringify } from './reports-projection';
import { reportError, reportNotFound } from './report-errors';

export { stableStringify } from './reports-projection';

const TEMPLATE_VERSION = 1;
const REPORT_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.CLOSED,
  EventStatus.ALBUM_PUBLISHED,
  EventStatus.ARCHIVED
]);
const MAX_ATTEMPTS = 20;

type ReportRecord =
  Awaited<ReturnType<PrismaService['generatedReport']['findUnique']>> extends infer T ? Exclude<T, null> : never;

@Injectable()
export class ReportsService {
  private readonly uploadFlights = new Map<
    string,
    {
      checksum: string;
      promise: Promise<void>;
      resolve: () => void;
      reject: (error: unknown) => void;
    }
  >();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly access: EventAccessPolicy,
    @Inject(ReportsDatasetService) private readonly datasets: ReportsDatasetService,
    @Inject(ReportsPdfService) private readonly pdf: ReportsPdfService,
    @Inject(FileStorage) private readonly storage: FileStorage
  ) {}

  authorizeAttendance(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ReportAuthorizationResponse> {
    return this.authorize(eventId, GeneratedReportType.ATTENDANCE, idempotencyKey, principal, operationId);
  }

  authorizePhysicalPasses(
    eventId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ReportAuthorizationResponse> {
    return this.authorize(eventId, GeneratedReportType.PHYSICAL_PASSES, idempotencyKey, principal, operationId);
  }

  async list(eventId: string, principal: AuthPrincipal): Promise<ReportListItem[]> {
    await this.requireOwnedEvent(this.prisma, eventId, principal);
    const now = await databaseClock(this.prisma);
    const reports = await this.prisma.generatedReport.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });
    return reports.map((report) => toListItem(report, projectGeneratedReportAt(report, now)));
  }

  async listAdmin(eventId?: string): Promise<AdminReportListItem[]> {
    const now = await databaseClock(this.prisma);
    const reports = await this.prisma.generatedReport.findMany({
      where: eventId ? { eventId } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });
    return reports.map((report) => ({
      ...toListItem(report, projectGeneratedReportAt(report, now), false),
      clientId: report.clientId,
      eventId: report.eventId,
      requestedByUserId: report.requestedByUserId
    }));
  }

  async attach(
    eventId: string,
    reportId: string,
    input: ReportFileUploadInput,
    file: UploadedPdf | undefined,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ReportListItem> {
    const initial = await this.requireOwnedReport(this.prisma, eventId, reportId, principal);
    const initialNow = await databaseClock(this.prisma);
    const initialProjection = projectGeneratedReportAt(initial, initialNow);
    assertUploadWindow(initial, initialProjection, initialNow);
    if (
      input.templateVersion !== initial.templateVersion ||
      input.datasetHashSha256 !== initialProjection.datasetHashSha256
    ) {
      throw reportError('REPORT_FILE_BINDING_INVALID', 'PDF binding does not match the authorized report.');
    }
    await this.pdf.validate(file, reportId, input.templateVersion, input.datasetHashSha256);
    const bytes = file!.buffer;
    const checksum = sha256(bytes);

    const existing = await this.findAttachedResult(eventId, reportId, checksum, principal);
    if (existing) return existing;
    assertUploadable(initial, initialProjection);

    const flight = this.acquireUploadFlight(reportId, checksum);
    if (!flight.leader) {
      await flight.promise;
      const result = await this.findAttachedResult(eventId, reportId, checksum, principal);
      if (result) return result;
      throw reportError('REPORT_FILE_ALREADY_ATTACHED', 'A different PDF is already attached to this report.');
    }

    const storageKey = this.storage.generateKey();
    let stagedId: string | undefined;
    try {
      const reservation = await this.reserveUpload(eventId, reportId, checksum, bytes.length, storageKey, principal);
      stagedId = reservation.assetId;
      await this.storage.write({ storageKey, bytes });
      const result = await this.finalizeUpload(eventId, reportId, stagedId, checksum, principal, operationId);
      flight.resolve();
      return result;
    } catch (error) {
      if (stagedId) {
        await this.storage.delete(storageKey).catch(() => undefined);
        await this.failUpload(eventId, reportId, stagedId).catch(() => undefined);
      }
      const mapped = mapDatabaseError(error);
      flight.reject(mapped);
      throw mapped;
    } finally {
      if (this.uploadFlights.get(reportId) === flight.entry) {
        this.uploadFlights.delete(reportId);
      }
    }
  }

  async download(eventId: string, reportId: string, principal: AuthPrincipal) {
    const report = await this.requireOwnedReport(this.prisma, eventId, reportId, principal, true);
    const now = await databaseClock(this.prisma);
    const projection = projectGeneratedReportAt(report, now);
    if (!projection.contentAvailable) {
      if (
        projection.retentionExpired ||
        projection.detailExpired ||
        projection.status === GeneratedReportStatus.HIDDEN ||
        projection.status === GeneratedReportStatus.EXPIRED
      ) {
        throw reportError('REPORT_CONTENT_EXPIRED', 'Report content is no longer available.', HttpStatus.GONE);
      }
    }
    if (projection.status !== GeneratedReportStatus.READY || !report.fileAssetId) {
      throw reportError('REPORT_FILE_NOT_READY', 'Report file is not ready.');
    }
    const asset = await this.prisma.fileAsset.findFirst({
      where: {
        id: report.fileAssetId,
        eventId,
        ownerType: FileAssetOwnerType.GENERATED_REPORT,
        ownerId: reportId,
        fileType: FileAssetType.GENERATED_REPORT_PDF,
        status: FileAssetStatus.READY,
        deletedAt: null
      }
    });
    if (!asset?.checksumSha256) throw reportError('REPORT_FILE_NOT_READY', 'Report file is not ready.');
    try {
      return {
        bytes: await this.storage.read(asset.storageKey),
        sizeBytes: asset.sizeBytes,
        etag: `"sha256-${asset.checksumSha256.slice(0, 32)}"`,
        filename:
          report.type === GeneratedReportType.ATTENDANCE ? 'reporte-asistencia.pdf' : 'reporte-pases-fisicos.pdf'
      };
    } catch {
      throw reportError(
        'FILE_STORAGE_FAILURE',
        'Report storage is temporarily unavailable.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async expirePrivacy(now?: Date): Promise<{ detailed: number; retained: number }> {
    const at = now ?? (await databaseClock(this.prisma));
    const candidates = await this.prisma.generatedReport.findMany({
      where: {
        status: { not: GeneratedReportStatus.EXPIRED },
        OR: [
          { retentionUntil: { lte: at } },
          {
            type: GeneratedReportType.ATTENDANCE,
            privacyMode: GeneratedReportPrivacyMode.DETAILED,
            detailedUntil: { lte: at }
          }
        ]
      },
      select: { id: true, eventId: true },
      orderBy: [{ eventId: 'asc' }, { id: 'asc' }]
    });
    let detailed = 0;
    let retained = 0;
    for (const candidate of candidates) {
      const outcome = await this.expireOne(candidate.eventId, candidate.id, at);
      if (outcome === 'detailed') detailed += 1;
      if (outcome === 'retained') retained += 1;
    }
    return { detailed, retained };
  }

  private async authorize(
    eventId: string,
    type: GeneratedReportType,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ReportAuthorizationResponse> {
    return this.serializable(async (transaction) => {
      await lockEvent(transaction, eventId);
      const event = await this.requireOwnedEvent(transaction, eventId, principal);
      const signature = sha256(`${eventId}:${type}:${TEMPLATE_VERSION}`);
      const replay = await transaction.generatedReport.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.eventId !== eventId || replay.type !== type || replay.requestSignature !== signature) {
          throw reportError('REPORT_IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to another report request.');
        }
        const now = await databaseClock(transaction);
        const projection = projectGeneratedReportAt(replay, now);
        if (projection.retentionExpired) {
          throw reportError('REPORT_CONTENT_EXPIRED', 'The report retention window has ended.', HttpStatus.GONE);
        }
        return toAuthorization(replay, projection);
      }
      if (!REPORT_EVENT_STATUSES.has(event.status)) {
        throw reportError('REPORT_EVENT_STATE_INVALID', 'Reports require a closed or archived Event.');
      }
      assertService(type, event.activatedService?.code ?? event.service?.code);
      if (!event.eventDateTime || !event.timeZone || !event.name) {
        throw reportError('REPORT_EVENT_STATE_INVALID', 'Event report data is incomplete.');
      }
      const [clock] = await transaction.$queryRaw<
        Array<{ now: Date; detailedUntil: Date; retentionUntil: Date; uploadExpiresAt: Date }>
      >`
        SELECT clock_timestamp() AS "now",
          ${event.eventDateTime}::timestamptz + interval '30 days' AS "detailedUntil",
          ${event.eventDateTime}::timestamptz + interval '6 months' AS "retentionUntil",
          clock_timestamp() + interval '15 minutes' AS "uploadExpiresAt"
      `;
      if (!clock || clock.now >= clock.retentionUntil) {
        throw reportError('REPORT_CONTENT_EXPIRED', 'The report retention window has ended.', HttpStatus.GONE);
      }
      const privacy =
        type === GeneratedReportType.ATTENDANCE && clock.now < clock.detailedUntil
          ? GeneratedReportPrivacyMode.DETAILED
          : GeneratedReportPrivacyMode.AGGREGATE;
      await lockDataset(transaction, eventId, type);
      const dataset = await this.datasets.build(transaction, event, type, privacy);
      const hash = sha256(stableStringify(dataset));
      const parameters: ReportParameters = { locale: 'es-MX', pageSize: 'A4', timeZone: event.timeZone };
      const report = await transaction.generatedReport.create({
        data: {
          clientId: event.clientId,
          eventId,
          type,
          privacyMode: privacy,
          templateVersion: TEMPLATE_VERSION,
          generatedAtSnapshot: clock.now,
          detailedUntil: clock.detailedUntil,
          retentionUntil: clock.retentionUntil,
          datasetSnapshot: dataset as Prisma.InputJsonObject,
          datasetHashSha256: hash,
          parameters: parameters as unknown as Prisma.InputJsonObject,
          uploadExpiresAt: clock.uploadExpiresAt,
          requestedByUserId: principal.userId,
          idempotencyKey,
          requestSignature: signature
        }
      });
      await this.audit.record(
        reportAudit(
          principal.userId,
          event.clientId,
          eventId,
          report.id,
          'REPORT_AUTHORIZE',
          {
            reportType: type,
            privacyMode: privacy,
            templateVersion: TEMPLATE_VERSION,
            status: GeneratedReportStatus.AUTHORIZED,
            generatedAtSnapshot: clock.now.toISOString(),
            detailedUntil: clock.detailedUntil.toISOString(),
            retentionUntil: clock.retentionUntil.toISOString(),
            fileAttached: false,
            aggregateCounts: dataset.summary as Prisma.InputJsonValue
          },
          operationId
        ),
        transaction
      );
      return toAuthorization(report, projectGeneratedReportAt(report, clock.now));
    });
  }

  private async reserveUpload(
    eventId: string,
    reportId: string,
    checksum: string,
    sizeBytes: number,
    storageKey: string,
    principal: AuthPrincipal
  ): Promise<{ assetId: string }> {
    return this.serializable(async (transaction) => {
      await lockEvent(transaction, eventId);
      await lockReport(transaction, reportId);
      const report = await this.requireOwnedReport(transaction, eventId, reportId, principal);
      const now = await databaseClock(transaction);
      const existing = await transaction.fileAsset.findFirst({
        where: { ownerType: FileAssetOwnerType.GENERATED_REPORT, ownerId: reportId }
      });
      if (existing) {
        if (existing.status === FileAssetStatus.UPLOADING) {
          await transaction.fileAsset.update({
            where: { id: existing.id },
            data: {
              status: FileAssetStatus.FAILED,
              failureCode: 'REPORT_UPLOAD_REPLACED',
              ownerId: null,
              associatedAt: null
            }
          });
        } else {
          throw reportError('REPORT_FILE_ALREADY_ATTACHED', 'A PDF is already attached to this report.');
        }
      }
      const projection = projectGeneratedReportAt(report, now);
      assertUploadWindow(report, projection, now);
      assertUploadable(report, projection);
      const staged = await transaction.fileAsset.create({
        data: {
          id: randomUUID(),
          clientId: report.clientId,
          eventId,
          ownerType: FileAssetOwnerType.GENERATED_REPORT,
          ownerId: reportId,
          fileType: FileAssetType.GENERATED_REPORT_PDF,
          storageProvider: StorageProvider.LOCAL,
          storageKey,
          originalName: report.type === GeneratedReportType.ATTENDANCE ? 'attendance-report.pdf' : 'passes-report.pdf',
          mimeType: 'application/pdf',
          sizeBytes,
          checksumSha256: checksum,
          createdByUserId: principal.userId,
          associatedAt: now,
          status: FileAssetStatus.UPLOADING
        }
      });
      return { assetId: staged.id };
    });
  }

  private async finalizeUpload(
    eventId: string,
    reportId: string,
    assetId: string,
    checksum: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ReportListItem> {
    return this.serializable(async (transaction) => {
      await lockEvent(transaction, eventId);
      await lockReport(transaction, reportId);
      await lockFileAsset(transaction, assetId);
      const report = await this.requireOwnedReport(transaction, eventId, reportId, principal);
      const now = await databaseClock(transaction);
      if (report.status === GeneratedReportStatus.READY && report.fileAssetId === assetId) {
        return toListItem(report, projectGeneratedReportAt(report, now));
      }
      const projection = projectGeneratedReportAt(report, now);
      assertUploadWindow(report, projection, now);
      assertUploadable(report, projection);
      const asset = await transaction.fileAsset.findUnique({ where: { id: assetId } });
      if (
        !asset ||
        asset.ownerId !== reportId ||
        asset.checksumSha256 !== checksum ||
        asset.status !== FileAssetStatus.UPLOADING
      ) {
        throw reportError('REPORT_FILE_ALREADY_ATTACHED', 'A PDF is already attached to this report.');
      }
      await transaction.fileAsset.update({ where: { id: assetId }, data: { status: FileAssetStatus.READY } });
      const ready = await transaction.generatedReport.update({
        where: { id: reportId },
        data: { status: GeneratedReportStatus.READY, fileAssetId: assetId, readyAt: now }
      });
      await this.audit.record(
        reportAudit(
          principal.userId,
          report.clientId,
          eventId,
          reportId,
          'REPORT_FILE_ATTACH',
          {
            reportType: report.type,
            privacyMode: report.privacyMode,
            templateVersion: report.templateVersion,
            status: GeneratedReportStatus.READY,
            generatedAtSnapshot: report.generatedAtSnapshot.toISOString(),
            detailedUntil: report.detailedUntil.toISOString(),
            retentionUntil: report.retentionUntil.toISOString(),
            fileAttached: true,
            sizeBytes: asset.sizeBytes,
            aggregateCounts: (report.datasetSnapshot as Record<string, unknown>).summary as Prisma.InputJsonValue
          },
          operationId
        ),
        transaction
      );
      return toListItem(ready, projectGeneratedReportAt(ready, now));
    });
  }

  private async findAttachedResult(
    eventId: string,
    reportId: string,
    checksum: string,
    principal: AuthPrincipal
  ): Promise<ReportListItem | null> {
    const report = await this.requireOwnedReport(this.prisma, eventId, reportId, principal, true);
    if (!report.fileAssetId) return null;
    const asset = await this.prisma.fileAsset.findUnique({ where: { id: report.fileAssetId } });
    if (asset?.checksumSha256 !== checksum) {
      throw reportError('REPORT_FILE_ALREADY_ATTACHED', 'A different PDF is already attached to this report.');
    }
    const now = await databaseClock(this.prisma);
    return toListItem(report, projectGeneratedReportAt(report, now));
  }

  private acquireUploadFlight(reportId: string, checksum: string) {
    const current = this.uploadFlights.get(reportId);
    if (current) {
      return { leader: false as const, promise: current.promise };
    }
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    void promise.catch(() => undefined);
    const entry = { checksum, promise, resolve, reject };
    this.uploadFlights.set(reportId, entry);
    return { leader: true as const, promise, resolve, reject, entry };
  }

  private async failUpload(eventId: string, reportId: string, assetId: string): Promise<void> {
    await this.serializable(async (transaction) => {
      await lockEvent(transaction, eventId);
      await lockReport(transaction, reportId);
      await lockFileAsset(transaction, assetId);
      const report = await transaction.generatedReport.findUnique({ where: { id: reportId } });
      const asset = await transaction.fileAsset.findUnique({ where: { id: assetId } });
      if (
        !report ||
        !asset ||
        report.fileAssetId === assetId ||
        asset.status !== FileAssetStatus.UPLOADING ||
        asset.ownerType !== FileAssetOwnerType.GENERATED_REPORT ||
        asset.ownerId !== reportId
      ) {
        return;
      }
      await transaction.fileAsset.update({
        where: { id: assetId },
        data: {
          status: FileAssetStatus.FAILED,
          failureCode: 'REPORT_UPLOAD_FAILED',
          ownerId: null,
          associatedAt: null
        }
      });
    });
  }

  private async expireOne(eventId: string, reportId: string, at: Date): Promise<'detailed' | 'retained' | null> {
    return this.serializable(async (transaction) => {
      await lockEvent(transaction, eventId);
      await lockReport(transaction, reportId);
      const report = await transaction.generatedReport.findUnique({ where: { id: reportId } });
      if (!report || report.status === GeneratedReportStatus.EXPIRED) return null;
      if (report.fileAssetId) await lockFileAsset(transaction, report.fileAssetId);
      const projection = projectGeneratedReportAt(report, at);
      if (projection.retentionExpired) {
        if (report.fileAssetId) {
          await transaction.fileAsset.updateMany({
            where: { id: report.fileAssetId, status: FileAssetStatus.READY },
            data: { status: FileAssetStatus.HIDDEN }
          });
        }
        await transaction.generatedReport.update({
          where: { id: reportId },
          data: {
            status: GeneratedReportStatus.EXPIRED,
            privacyMode: GeneratedReportPrivacyMode.AGGREGATE,
            datasetSnapshot: projection.dataset as Prisma.InputJsonObject,
            datasetHashSha256: projection.datasetHashSha256,
            expiredAt: at,
            ...(report.hiddenAt ? {} : { hiddenAt: report.fileAssetId ? at : null })
          }
        });
        await this.audit.record(systemReportAudit(report, 'REPORT_RETENTION_EXPIRE', at), transaction);
        return 'retained';
      }
      if (projection.detailExpired) {
        if (report.fileAssetId) {
          await transaction.fileAsset.updateMany({
            where: { id: report.fileAssetId, status: FileAssetStatus.READY },
            data: { status: FileAssetStatus.HIDDEN }
          });
        }
        await transaction.generatedReport.update({
          where: { id: reportId },
          data: {
            privacyMode: GeneratedReportPrivacyMode.AGGREGATE,
            datasetSnapshot: projection.dataset as Prisma.InputJsonObject,
            datasetHashSha256: projection.datasetHashSha256,
            ...(report.fileAssetId ? { status: GeneratedReportStatus.HIDDEN, hiddenAt: at } : {})
          }
        });
        await this.audit.record(systemReportAudit(report, 'REPORT_PRIVACY_EXPIRE', at), transaction);
        return 'detailed';
      }
      return null;
    });
  }

  private async requireOwnedEvent(
    client: Prisma.TransactionClient | PrismaService,
    eventId: string,
    principal: AuthPrincipal
  ) {
    const event = await client.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.access.ownedWhere(principal) },
      include: { service: true, activatedService: true }
    });
    if (!event) throw eventNotFound();
    return event;
  }

  private async requireOwnedReport(
    client: Prisma.TransactionClient | PrismaService,
    eventId: string,
    reportId: string,
    principal: AuthPrincipal,
    includeFile = false
  ) {
    await this.requireOwnedEvent(client, eventId, principal);
    const report = await client.generatedReport.findFirst({
      where: { id: reportId, eventId },
      ...(includeFile ? { include: { fileAsset: true } } : {})
    });
    if (!report) throw reportNotFound();
    return report;
  }

  private async serializable<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) throw mapDatabaseError(error);
      }
    }
    throw new Error('Serializable report transaction retry limit exceeded.');
  }
}

function assertService(type: GeneratedReportType, code: ServiceCode | undefined): void {
  const compatible =
    type === GeneratedReportType.ATTENDANCE
      ? code === ServiceCode.FLYER || code === ServiceCode.FLIPBOOK
      : code === ServiceCode.PHYSICAL_QR;
  if (!compatible) throw reportError('REPORT_SERVICE_MISMATCH', 'Report type is incompatible with the Event service.');
}

function assertUploadable(report: ReportRecord, projection: ReturnType<typeof projectGeneratedReportAt>): void {
  if (projection.retentionExpired || projection.detailExpired) {
    throw reportError('REPORT_CONTENT_EXPIRED', 'Report content has expired.', HttpStatus.GONE);
  }
  if (report.status !== GeneratedReportStatus.AUTHORIZED || report.fileAssetId !== null) {
    throw reportError('REPORT_FILE_ALREADY_ATTACHED', 'A PDF is already attached to this report.');
  }
}

function assertUploadWindow(
  report: ReportRecord,
  projection: ReturnType<typeof projectGeneratedReportAt>,
  now: Date
): void {
  if (projection.retentionExpired || projection.detailExpired || now >= report.uploadExpiresAt) {
    throw reportError('REPORT_CONTENT_EXPIRED', 'Report upload authorization has expired.', HttpStatus.GONE);
  }
}

function toAuthorization(
  report: ReportRecord,
  projection: ReturnType<typeof projectGeneratedReportAt>
): ReportAuthorizationResponse {
  return {
    reportId: report.id,
    reportType: report.type,
    status: projection.status,
    privacyMode: projection.privacyMode,
    templateVersion: report.templateVersion,
    generatedAtSnapshot: report.generatedAtSnapshot.toISOString(),
    detailedUntil: report.detailedUntil.toISOString(),
    retentionUntil: report.retentionUntil.toISOString(),
    uploadExpiresAt: report.uploadExpiresAt.toISOString(),
    datasetHashSha256: projection.datasetHashSha256,
    dataset: projection.dataset,
    parameters: report.parameters as unknown as ReportParameters,
    ...(projection.uploadAvailable
      ? { fileUploadPath: `/api/v1/events/${report.eventId}/reports/${report.id}/file` }
      : {})
  };
}

function toListItem(
  report: ReportRecord,
  projection: ReturnType<typeof projectGeneratedReportAt>,
  download = true
): ReportListItem {
  const available = download && projection.contentAvailable;
  return {
    id: report.id,
    type: report.type,
    status: projection.status,
    privacyMode: projection.privacyMode,
    templateVersion: report.templateVersion,
    generatedAtSnapshot: report.generatedAtSnapshot.toISOString(),
    detailedUntil: report.detailedUntil.toISOString(),
    retentionUntil: report.retentionUntil.toISOString(),
    readyAt: report.readyAt?.toISOString() ?? null,
    hiddenAt: report.hiddenAt?.toISOString() ?? null,
    expiredAt: report.expiredAt?.toISOString() ?? null,
    ...(available ? { downloadPath: `/api/v1/events/${report.eventId}/reports/${report.id}/download` } : {})
  };
}

async function databaseClock(client: Prisma.TransactionClient | PrismaService): Promise<Date> {
  const [clock] = await client.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS "now"`;
  if (!clock) throw new Error('PostgreSQL did not return a clock.');
  return clock.now;
}

async function lockEvent(transaction: Prisma.TransactionClient, eventId: string): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
}
async function lockReport(transaction: Prisma.TransactionClient, reportId: string): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "generated_report" WHERE "id" = ${reportId}::uuid FOR UPDATE`;
}
async function lockFileAsset(transaction: Prisma.TransactionClient, assetId: string): Promise<void> {
  await transaction.$queryRaw`SELECT "id" FROM "file_asset" WHERE "id" = ${assetId}::uuid FOR UPDATE`;
}
async function lockDataset(
  transaction: Prisma.TransactionClient,
  eventId: string,
  type: GeneratedReportType
): Promise<void> {
  if (type === GeneratedReportType.PHYSICAL_PASSES) {
    await transaction.$queryRaw`
      SELECT "id" FROM "physical_pass" WHERE "event_id" = ${eventId}::uuid ORDER BY "id" FOR SHARE
    `;
    return;
  }
  await transaction.$queryRaw`
    SELECT "id" FROM "invitation" WHERE "event_id" = ${eventId}::uuid ORDER BY "id" FOR SHARE
  `;
  await transaction.$queryRaw`
    SELECT "id" FROM "contact" WHERE "event_id" = ${eventId}::uuid ORDER BY "id" FOR SHARE
  `;
  await transaction.$queryRaw`
    SELECT "id" FROM "assistant" WHERE "event_id" = ${eventId}::uuid ORDER BY "id" FOR SHARE
  `;
  await transaction.$queryRaw`
    SELECT "id" FROM "check_in" WHERE "event_id" = ${eventId}::uuid ORDER BY "id" FOR SHARE
  `;
}

function reportAudit(
  userId: string,
  clientId: string,
  eventId: string,
  reportId: string,
  action: string,
  metadata: Prisma.InputJsonObject,
  operationId?: string
) {
  return {
    actor: { type: AuditActorType.USER, id: userId },
    clientId,
    eventId,
    resourceType: 'GENERATED_REPORT',
    resourceId: reportId,
    action,
    metadata,
    ...(operationId ? { operationId } : {})
  };
}

function systemReportAudit(report: ReportRecord, action: string, at: Date) {
  const dataset = aggregateReportDataset(report.datasetSnapshot as Record<string, unknown>);
  return {
    actor: { type: AuditActorType.SYSTEM },
    clientId: report.clientId,
    eventId: report.eventId,
    resourceType: 'GENERATED_REPORT',
    resourceId: report.id,
    action,
    metadata: {
      reportType: report.type,
      templateVersion: report.templateVersion,
      privacyMode: GeneratedReportPrivacyMode.AGGREGATE,
      status: action === 'REPORT_RETENTION_EXPIRE' ? GeneratedReportStatus.EXPIRED : GeneratedReportStatus.HIDDEN,
      generatedAtSnapshot: report.generatedAtSnapshot.toISOString(),
      detailedUntil: report.detailedUntil.toISOString(),
      retentionUntil: report.retentionUntil.toISOString(),
      fileAttached: report.fileAssetId !== null,
      aggregateCounts: dataset.summary as Prisma.InputJsonValue,
      transitionedAt: at.toISOString()
    }
  };
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
  );
}
function isRetryable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && (error as { code?: unknown }).code === 'P2034') return true;
  const message = JSON.stringify(error);
  return message.includes('40001') || message.includes('40P01') || message.includes('TransactionWriteConflict');
}
function mapDatabaseError(error: unknown): unknown {
  const message = JSON.stringify(error).toLowerCase();
  if (message.includes('generated_report_service_compatible')) {
    return reportError('REPORT_SERVICE_MISMATCH', 'Report type is incompatible with the Event service.');
  }
  if (isUniqueConflict(error)) {
    return reportError('REPORT_IDEMPOTENCY_CONFLICT', 'Report operation conflicts with existing data.');
  }
  return error;
}
