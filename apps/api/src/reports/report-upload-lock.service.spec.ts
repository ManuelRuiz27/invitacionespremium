import { describe, expect, it } from 'vitest';
import { reportUploadLockDomain } from './report-upload-lock.service';

describe('ReportUploadLockService', () => {
  it('derives a stable, purpose-separated advisory lock domain', () => {
    expect(reportUploadLockDomain('report-id')).toBe('InvitacionesPremium:GENERATED_REPORT_UPLOAD:report-id');
  });
});
