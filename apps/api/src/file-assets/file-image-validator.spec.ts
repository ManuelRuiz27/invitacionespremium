import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { AppConfigService } from '../config/app-config.service';
import { FileImageValidator } from './file-image-validator';

describe('FileImageValidator', () => {
  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png']
  ] as const)('decodes, normalizes, strips metadata and checksums %s', async (format, mimeType) => {
    const source = sharp({
      create: { width: 2, height: 3, channels: 3, background: '#ff00aa' }
    }).withMetadata({ orientation: 6 });
    const input = format === 'jpeg' ? await source.jpeg().toBuffer() : await source.png().toBuffer();
    const result = await validator().validate(input);
    const metadata = await sharp(result.bytes).metadata();

    expect(result).toMatchObject({ mimeType, width: 3, height: 2, sizeBytes: result.bytes.length });
    expect(result.checksumSha256).toBe(createHash('sha256').update(result.bytes).digest('hex'));
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects false signatures, corrupt images, size overflow and pixel overflow', async () => {
    await expect(validator().validate(Buffer.from('%PDF-1.7'))).rejects.toMatchObject({
      response: { code: 'FILE_UNSUPPORTED_TYPE' }
    });
    await expect(validator().validate(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).rejects.toMatchObject({
      response: { code: 'FILE_IMAGE_INVALID' }
    });
    await expect(validator({ maxBytes: 3 }).validate(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).rejects.toMatchObject({
      status: 413,
      response: { code: 'FILE_SIZE_EXCEEDED' }
    });
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' }
    })
      .png()
      .toBuffer();
    await expect(validator({ maxPixels: 3 }).validate(image)).rejects.toMatchObject({
      response: { code: 'FILE_IMAGE_DIMENSIONS_EXCEEDED' }
    });
  });
});

function validator(options: { maxBytes?: number; maxPixels?: number } = {}): FileImageValidator {
  return new FileImageValidator({
    fileUploadMaxBytes: options.maxBytes ?? 1024 * 1024,
    fileImageMaxPixels: options.maxPixels ?? 100
  } as AppConfigService);
}
