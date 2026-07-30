import { createHash } from 'node:crypto';
import { GeneratedReportPrivacyMode, GeneratedReportStatus, GeneratedReportType } from '../generated/prisma/client';

export interface GeneratedReportProjectionInput {
  type: GeneratedReportType;
  status: GeneratedReportStatus;
  privacyMode: GeneratedReportPrivacyMode;
  datasetSnapshot: unknown;
  datasetHashSha256: string;
  detailedUntil: Date;
  retentionUntil: Date;
  uploadExpiresAt: Date;
  fileAssetId: string | null;
}

export interface GeneratedReportProjection {
  status: GeneratedReportStatus;
  privacyMode: GeneratedReportPrivacyMode;
  dataset: Record<string, unknown>;
  datasetHashSha256: string;
  detailExpired: boolean;
  retentionExpired: boolean;
  contentAvailable: boolean;
  uploadAvailable: boolean;
}

export function projectGeneratedReportAt(report: GeneratedReportProjectionInput, now: Date): GeneratedReportProjection {
  const retentionExpired = now >= report.retentionUntil;
  const detailExpired =
    report.type === GeneratedReportType.ATTENDANCE &&
    report.privacyMode === GeneratedReportPrivacyMode.DETAILED &&
    now >= report.detailedUntil;
  const dataset =
    retentionExpired || detailExpired
      ? aggregateReportDataset(report.datasetSnapshot as Record<string, unknown>)
      : (report.datasetSnapshot as Record<string, unknown>);
  const status = retentionExpired
    ? GeneratedReportStatus.EXPIRED
    : detailExpired && report.status === GeneratedReportStatus.READY
      ? GeneratedReportStatus.HIDDEN
      : report.status;
  const privacyMode = retentionExpired || detailExpired ? GeneratedReportPrivacyMode.AGGREGATE : report.privacyMode;

  return {
    status,
    privacyMode,
    dataset,
    datasetHashSha256: retentionExpired || detailExpired ? sha256(stableStringify(dataset)) : report.datasetHashSha256,
    detailExpired,
    retentionExpired,
    contentAvailable: status === GeneratedReportStatus.READY && !detailExpired && !retentionExpired,
    uploadAvailable:
      status === GeneratedReportStatus.AUTHORIZED &&
      report.fileAssetId === null &&
      now < report.uploadExpiresAt &&
      !detailExpired &&
      !retentionExpired
  };
}

export function aggregateReportDataset(dataset: Record<string, unknown>): Record<string, unknown> {
  return {
    ...dataset,
    ...('rows' in dataset ? { rows: [] } : {}),
    ...('passes' in dataset ? { passes: [] } : {})
  };
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
