import { createHash } from 'node:crypto';
import sharp from 'sharp';

export async function createStagingFloorplanBytes(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: '#f6f1e8' } })
    .png()
    .toBuffer();
}

export function stagingFloorplanChecksum(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
