import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export function cropFor(image) {
  if (image.file.startsWith('admin-09-aforo') && image.focus) {
    const left = Math.max(0, Math.floor(image.focus.x) - 12),
      top = Math.max(0, Math.floor(image.focus.y) - 12);
    return {
      left,
      top,
      width: Math.min(image.width - left, Math.ceil(image.focus.width) + 24),
      height: Math.min(image.height - top, Math.ceil(image.focus.height) + 24)
    };
  }
  if (image.dialog) {
    const left = Math.max(0, Math.floor(image.dialog.x) - 20);
    const top = Math.max(0, Math.floor(image.dialog.y) - 20);
    return {
      left,
      top,
      width: Math.min(image.width - left, Math.ceil(image.dialog.width) + 40),
      height: Math.min(image.height - top, Math.ceil(image.dialog.height) + 40)
    };
  }
  if (image.file.startsWith('salon-11-ingreso')) return { left: 0, top: 0, width: 390, height: 240 };
  if (image.file.includes('00-entrar'))
    return {
      left: Math.floor(image.focus.x) - 55,
      top: Math.floor(image.focus.y) - 310,
      width: Math.ceil(image.focus.width) + 110,
      height: 460
    };
  if (image.width === 1440 && !/01-(?:clientes|eventos)/u.test(image.file))
    return { left: 240, top: 65, width: 1180, height: 835 };
  return { left: 0, top: 0, width: image.width, height: image.height };
}

export async function createCrops(inventory, evidence, target) {
  await mkdir(target, { recursive: true });
  const images = new Map();
  for (const image of inventory.captures) {
    const crop = cropFor(image);
    const bytes = await sharp(join(evidence, image.file)).extract(crop).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(join(target, image.file), bytes);
    images.set(image.file, { ...image, crop, croppedSha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(
    join(target, 'crops.json'),
    JSON.stringify(
      [...images.values()].map(({ file, sha256, crop, croppedSha256 }) => ({
        file,
        sourceSha256: sha256,
        crop,
        sha256: croppedSha256
      })),
      null,
      2
    ) + '\n'
  );
  return images;
}
