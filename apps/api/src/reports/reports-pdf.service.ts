import { Inject, Injectable } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { AppConfigService } from '../config/app-config.service';
import { reportError } from './report-errors';

export interface UploadedPdf {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class ReportsPdfService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async validate(
    file: UploadedPdf | undefined,
    reportId: string,
    templateVersion: number,
    hash: string
  ): Promise<void> {
    if (
      !file ||
      file.mimetype !== 'application/pdf' ||
      file.buffer.length === 0 ||
      file.buffer.length > this.config.fileUploadMaxBytes ||
      !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))
    ) {
      throw reportError('REPORT_FILE_INVALID', 'A valid PDF file is required.');
    }
    try {
      const document = await PDFDocument.load(file.buffer, {
        ignoreEncryption: false,
        throwOnInvalidObject: true,
        updateMetadata: false
      });
      const pages = document.getPageCount();
      if (pages < 1 || pages > 200 || document.getSubject() !== `InvitacionesPremium Report ${reportId}`) {
        throw new Error('PDF binding mismatch');
      }
      const keywords = document.getKeywords() ?? '';
      if (!keywords.includes(`template:${templateVersion}`) || !keywords.includes(`dataset:${hash}`)) {
        throw new Error('PDF binding mismatch');
      }
    } catch {
      throw reportError('REPORT_FILE_BINDING_INVALID', 'PDF metadata does not match the authorized report.');
    }
  }
}
