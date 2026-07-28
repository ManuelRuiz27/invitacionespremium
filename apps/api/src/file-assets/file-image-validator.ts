import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { DomainError } from '../common/errors/domain-error';
import { AppConfigService } from '../config/app-config.service';

export interface ValidatedImage {
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  checksumSha256: string;
  width: number;
  height: number;
}

@Injectable()
export class FileImageValidator {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async validate(input: Buffer): Promise<ValidatedImage> {
    if (input.length > this.config.fileUploadMaxBytes) {
      throw fileError('FILE_SIZE_EXCEEDED', 'File size exceeds the configured limit.', HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const format = detectSignature(input);
    if (!format) {
      throw fileError('FILE_UNSUPPORTED_TYPE', 'Only valid JPEG and PNG images are accepted.');
    }

    try {
      const metadata = await sharp(input, { failOn: 'error', limitInputPixels: false }).metadata();
      if (metadata.format !== format || !metadata.width || !metadata.height) {
        throw fileError('FILE_IMAGE_INVALID', 'Image content is invalid.');
      }
      if (metadata.width * metadata.height > this.config.fileImageMaxPixels) {
        throw fileError('FILE_IMAGE_DIMENSIONS_EXCEEDED', 'Image dimensions exceed the configured limit.');
      }

      const pipeline = sharp(input, {
        failOn: 'error',
        limitInputPixels: this.config.fileImageMaxPixels
      }).rotate();
      const processed =
        format === 'jpeg'
          ? await pipeline.jpeg({ quality: 95 }).toBuffer({ resolveWithObject: true })
          : await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });

      if (processed.data.length > this.config.fileUploadMaxBytes) {
        throw fileError('FILE_SIZE_EXCEEDED', 'File size exceeds the configured limit.', HttpStatus.PAYLOAD_TOO_LARGE);
      }
      if (!processed.info.width || !processed.info.height) {
        throw fileError('FILE_IMAGE_INVALID', 'Image content is invalid.');
      }

      return {
        bytes: processed.data,
        mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        sizeBytes: processed.data.length,
        checksumSha256: createHash('sha256').update(processed.data).digest('hex'),
        width: processed.info.width,
        height: processed.info.height
      };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      throw fileError('FILE_IMAGE_INVALID', 'Image content is invalid.');
    }
  }
}

function detectSignature(input: Buffer): 'jpeg' | 'png' | null {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) {
    return 'jpeg';
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return input.length >= png.length && input.subarray(0, png.length).equals(png) ? 'png' : null;
}

function fileError(code: string, message: string, status = HttpStatus.BAD_REQUEST): DomainError {
  return new DomainError(code, message, status);
}
