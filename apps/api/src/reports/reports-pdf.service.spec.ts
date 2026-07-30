import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { ReportsPdfService } from './reports-pdf.service';

const reportId = '4e86f2a4-a5d0-4c71-bf64-90eb5de444a0';
const hash = 'a'.repeat(64);
const service = new ReportsPdfService({ fileUploadMaxBytes: 10_000_000 } as AppConfigService);

describe('ReportsPdfService', () => {
  it('accepts exact binding tokens', async () => {
    await expect(service.validate(await pdf(['template:1', `dataset:${hash}`]), reportId, 1, hash)).resolves.toBe(
      undefined
    );
  });

  it.each([
    ['partial template', ['template:10', `dataset:${hash}`]],
    ['partial dataset', ['template:1', `dataset:${hash}-altered`]],
    ['invalid document', undefined]
  ])('rejects %s', async (_label, keywords) => {
    const file =
      keywords === undefined
        ? { buffer: Buffer.from('%PDF-invalid'), originalname: 'report.pdf', mimetype: 'application/pdf', size: 12 }
        : await pdf(keywords);
    await expect(service.validate(file, reportId, 1, hash)).rejects.toMatchObject({
      response: { code: 'REPORT_FILE_BINDING_INVALID' }
    });
  });

  it('rejects an encrypted PDF marker and a document with 201 pages', async () => {
    const encrypted = await pdf(['template:1', `dataset:${hash}`]);
    const encryptedMarker = Buffer.concat([encrypted.buffer, Buffer.from('\n/Encrypt true')]);
    await expect(
      service.validate(
        {
          buffer: encryptedMarker,
          originalname: 'report.pdf',
          mimetype: 'application/pdf',
          size: encryptedMarker.length
        },
        reportId,
        1,
        hash
      )
    ).rejects.toMatchObject({ response: { code: 'REPORT_FILE_INVALID' } });

    const document = await PDFDocument.create();
    for (let page = 0; page < 201; page += 1) document.addPage();
    document.setSubject(`InvitacionesPremium Report ${reportId}`);
    document.setKeywords(['template:1', `dataset:${hash}`]);
    const bytes = Buffer.from(await document.save());
    await expect(
      service.validate(
        { buffer: bytes, originalname: 'report.pdf', mimetype: 'application/pdf', size: bytes.length },
        reportId,
        1,
        hash
      )
    ).rejects.toMatchObject({ response: { code: 'REPORT_FILE_BINDING_INVALID' } });
  });

  it('rejects a zero-page PDF', async () => {
    const valid = await pdf(['template:1', `dataset:${hash}`]);
    const load = vi.spyOn(PDFDocument, 'load').mockResolvedValueOnce({
      getPageCount: () => 0,
      getSubject: () => `InvitacionesPremium Report ${reportId}`,
      getKeywords: () => `template:1 dataset:${hash}`
    } as unknown as PDFDocument);
    try {
      await expect(service.validate(valid, reportId, 1, hash)).rejects.toMatchObject({
        response: { code: 'REPORT_FILE_BINDING_INVALID' }
      });
    } finally {
      load.mockRestore();
    }
  });
});

async function pdf(keywords: string[]) {
  const document = await PDFDocument.create();
  document.addPage();
  document.setSubject(`InvitacionesPremium Report ${reportId}`);
  document.setKeywords(keywords);
  const buffer = Buffer.from(await document.save());
  return { buffer, originalname: 'report.pdf', mimetype: 'application/pdf', size: buffer.length };
}
