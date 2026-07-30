import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GeneratedReportPrivacyMode, GeneratedReportStatus, GeneratedReportType } from '../generated/prisma/client';
import { projectGeneratedReportAt } from './reports-projection';
import { stableStringify } from './reports.service';

describe('report canonical datasets', () => {
  it('produces the same canonical hash independently of object insertion order', () => {
    const left = { summary: { used: 1, total: 2 }, rows: [{ status: 'USED', passNumber: 1 }] };
    const right = { rows: [{ passNumber: 1, status: 'USED' }], summary: { total: 2, used: 1 } };
    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(createHash('sha256').update(stableStringify(left)).digest('hex')).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('keeps array order authoritative', () => {
    expect(stableStringify({ rows: [1, 2] })).not.toBe(stableStringify({ rows: [2, 1] }));
  });

  it('projects the exact privacy and retention boundaries without leaking nominal rows', () => {
    const detailedUntil = new Date('2026-02-01T00:00:00.000Z');
    const retentionUntil = new Date('2026-07-01T00:00:00.000Z');
    const report = {
      type: GeneratedReportType.ATTENDANCE,
      status: GeneratedReportStatus.READY,
      privacyMode: GeneratedReportPrivacyMode.DETAILED,
      datasetSnapshot: { summary: { total: 1 }, rows: [{ assistantName: 'Nombre privado' }] },
      datasetHashSha256: 'a'.repeat(64),
      detailedUntil,
      retentionUntil,
      uploadExpiresAt: new Date('2026-01-01T00:15:00.000Z'),
      fileAssetId: 'asset-id'
    };

    const before = projectGeneratedReportAt(report, new Date(detailedUntil.getTime() - 1));
    expect(before).toMatchObject({
      status: GeneratedReportStatus.READY,
      privacyMode: GeneratedReportPrivacyMode.DETAILED,
      detailExpired: false,
      contentAvailable: true
    });
    expect(before.dataset).toEqual(report.datasetSnapshot);

    const detailed = projectGeneratedReportAt(report, detailedUntil);
    expect(detailed).toMatchObject({
      status: GeneratedReportStatus.HIDDEN,
      privacyMode: GeneratedReportPrivacyMode.AGGREGATE,
      detailExpired: true,
      contentAvailable: false,
      uploadAvailable: false
    });
    expect(detailed.dataset).toEqual({ summary: { total: 1 }, rows: [] });
    expect(detailed.datasetHashSha256).not.toBe(report.datasetHashSha256);

    const retained = projectGeneratedReportAt(report, retentionUntil);
    expect(retained).toMatchObject({
      status: GeneratedReportStatus.EXPIRED,
      privacyMode: GeneratedReportPrivacyMode.AGGREGATE,
      retentionExpired: true,
      contentAvailable: false,
      uploadAvailable: false
    });
  });

  it('removes physical pass rows only at the retention boundary', () => {
    const retentionUntil = new Date('2026-07-01T00:00:00.000Z');
    const projection = projectGeneratedReportAt(
      {
        type: GeneratedReportType.PHYSICAL_PASSES,
        status: GeneratedReportStatus.READY,
        privacyMode: GeneratedReportPrivacyMode.AGGREGATE,
        datasetSnapshot: { summary: { total: 1 }, passes: [{ passNumber: 1 }] },
        datasetHashSha256: 'b'.repeat(64),
        detailedUntil: new Date('2026-02-01T00:00:00.000Z'),
        retentionUntil,
        uploadExpiresAt: new Date('2026-01-01T00:15:00.000Z'),
        fileAssetId: 'asset-id'
      },
      retentionUntil
    );
    expect(projection.dataset).toEqual({ summary: { total: 1 }, passes: [] });
  });

  it('uses PostgreSQL coordination without a process-local upload mutex', () => {
    const source = readFileSync(__filename.replace(/\.spec\.ts$/u, '.ts'), 'utf8');
    expect(source).toContain('ReportUploadLockService');
    expect(source).not.toMatch(/uploadFlights|new Map\s*</u);
  });
});
