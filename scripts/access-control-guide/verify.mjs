import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { secretPattern } from './safe-capture.mjs';
import { cropFor } from './crops.mjs';
import { adminGuide, salonGuide } from './content.mjs';
import { redactQaText } from '../../e2e/private-reporter.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireScanner = createRequire(join(root, 'apps/scanner/package.json'));
const decodeQr = requireScanner('jsqr');

export async function runtimeHash() {
  const hash = createHash('sha256');
  for (const directory of [
    'apps/admin/src',
    'apps/api/src',
    'apps/client/src',
    'apps/scanner/src',
    'packages/ui/src',
    'packages/api-client/src',
    'packages/floorplan/src'
  ]) {
    const files = (await readdir(join(root, directory), { recursive: true, withFileTypes: true }))
      .filter((file) => file.isFile() && /\.(?:ts|tsx)$/u.test(file.name))
      .map((file) => join(file.parentPath, file.name))
      .filter((file) => !/[\\/]generated[\\/]prisma[\\/]|[\\/](?:test|__tests__)[\\/]|\.(?:test|spec)\./u.test(file))
      .sort();
    for (const file of files) {
      hash.update(file.slice(root.length).replaceAll('\\', '/'));
      hash.update((await readFile(file, 'utf8')).replaceAll('\r\n', '\n'));
    }
  }
  return hash.digest('hex');
}

export const expectedImages = [
  'admin-00-entrar',
  'admin-01-clientes',
  'admin-02-crear-salon',
  'admin-03-preparar-salon',
  'admin-03b-responsable',
  'salon-00-entrar',
  'salon-01-eventos',
  'admin-07-pases-anonimos',
  'salon-03-invitados',
  'salon-04-importar',
  'salon-05-emitir',
  'salon-05b-credenciales',
  'salon-07-pases',
  ...['', '-numerados'].flatMap((suffix) =>
    [
      'admin-04-crear-evento',
      'admin-05-preparar-evento',
      'admin-06-requisitos',
      'admin-07b-listo',
      'admin-08-evento-activo',
      'admin-09-aforo',
      'salon-02-resumen',
      'salon-06-material',
      'salon-09-staff',
      'salon-09b-compartir',
      'salon-10-scanner',
      'salon-11-ingreso',
      'salon-12-aforo'
    ].map((name) => name + suffix)
  )
]
  .map((name) => `${name}.png`)
  .sort();

export async function verifyImages(directory, expected = expectedImages) {
  const raw = await readFile(join(directory, 'inventory.json'), 'utf8');
  assert(!secretPattern.test(raw), 'Secret or operational identifier in image inventory.');
  const inventory = JSON.parse(raw);
  assert.equal(inventory.version, 1);
  if (expected === expectedImages)
    assert.equal(
      inventory.runtimeSha256,
      await runtimeHash(),
      'Product sources changed since capture; regenerate the guide.'
    );
  const names = inventory.captures.map((entry) => entry.file).sort();
  assert.deepEqual(names, expected, 'Incomplete or duplicate image inventory.');
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name !== 'inventory.json').sort(),
    expected,
    'Unexpected publishable file.'
  );
  for (const entry of inventory.captures) {
    assert(/^(?:admin|salon)-[a-z0-9-]+\.png$/u.test(entry.file));
    assert(['admin', 'salon', 'scanner'].includes(entry.surface));
    assert(['NOMINAL', 'ANONYMOUS', 'AMBOS'].includes(entry.mode));
    assert(entry.anchor?.trim(), 'A screen needs an asserted real UI anchor.');
    if (expected === expectedImages) {
      assert(entry.focus && entry.focus.width > 0 && entry.focus.height > 0, 'Missing visible section anchor.');
      if (/admin-(?:02-crear-salon|03b-responsable)/u.test(entry.file))
        assert(entry.masks.length >= 1, 'Missing password mask.');
      if (entry.file.includes('09b-compartir')) assert(entry.masks.length >= 2, 'Missing Staff secret/link masks.');
      if (entry.file.includes('10-scanner'))
        assert(
          entry.masks.some((box) => box.width > 100 && box.height > 100),
          'Missing camera mask.'
        );
    }
    assert(entry.route.startsWith('/'), 'Expected a sanitized application route.');
    const bytes = await readFile(join(directory, entry.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, 'Image was edited after capture.');
    const image = sharp(bytes);
    const meta = await image.metadata();
    assert.equal(meta.format, 'png');
    assert.equal(meta.width, entry.width);
    assert.equal(meta.height, entry.height);
    assert((meta.width === 1440 && meta.height === 900) || (meta.width === 390 && meta.height === 844));
    assert(!meta.exif && !meta.xmp && !meta.iptc, 'Image metadata is forbidden.');
    const pixels = await image.ensureAlpha().raw().toBuffer();
    for (const box of entry.masks) {
      const left = Math.max(0, Math.ceil(box.x) + 2),
        top = Math.max(0, Math.ceil(box.y) + 2);
      const right = Math.min(meta.width, Math.floor(box.x + box.width) - 2);
      const bottom = Math.min(meta.height, Math.floor(box.y + box.height) - 2);
      for (let y = top; y < bottom; y += 7)
        for (let x = left; x < right; x += 7) {
          const at = (y * meta.width + x) * 4;
          assert.deepEqual([...pixels.subarray(at, at + 3)], [51, 65, 85], 'Sensitive area is not completely masked.');
        }
    }
    const decoded = decodeQr(new Uint8ClampedArray(pixels), meta.width, meta.height);
    assert(!decoded?.binaryData?.length, `A usable QR was found in ${entry.file}.`);
    // Also inspect overlapping tiles so a small QR cannot hide in a large desktop capture.
    for (let y = 0; y < meta.height; y += 320)
      for (let x = 0; x < meta.width; x += 320) {
        const width = Math.min(512, meta.width - x),
          height = Math.min(512, meta.height - y);
        const tile = await sharp(bytes).extract({ left: x, top: y, width, height }).ensureAlpha().raw().toBuffer();
        const decodedTile = decodeQr(new Uint8ClampedArray(tile), width, height);
        assert(!decodedTile?.binaryData?.length, `A usable QR tile was found in ${entry.file}.`);
      }
  }
  return inventory;
}

export async function verifyDocuments(inventory) {
  const output = join(root, 'docs/guias-usuario/control-de-acceso');
  const imageDir = join(output, 'imagenes');
  assert.deepEqual((await readdir(imageDir)).filter((file) => file !== 'crops.json').sort(), expectedImages);
  const crops = JSON.parse(await readFile(join(imageDir, 'crops.json'), 'utf8'));
  assert.equal(crops.length, inventory.captures.length);
  for (const image of inventory.captures) {
    const item = crops.find((crop) => crop.file === image.file);
    assert(item);
    assert.equal(item.sourceSha256, image.sha256);
    assert.deepEqual(item.crop, cropFor(image));
    if (image.focus) {
      const box = image.focus;
      assert(
        item.crop.left <= box.x + 4 &&
          item.crop.top <= box.y + 4 &&
          item.crop.left + item.crop.width >= box.x + box.width - 4 &&
          item.crop.top + item.crop.height >= box.y + box.height - 4,
        'A manual crop cuts off its target control.'
      );
    }
    const bytes = await sharp(join(root, 'docs/05-implementacion/evidence/m02-b01-ux02', image.file))
      .extract(item.crop)
      .png({ compressionLevel: 9 })
      .toBuffer();
    assert(bytes.equals(await readFile(join(imageDir, image.file))), 'A cropped image was changed.');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  }
  const requireClient = createRequire(join(root, 'apps/client/package.json'));
  const { PDFDocument } = requireClient('pdf-lib');
  for (const [file, pages] of [
    ...[adminGuide, salonGuide].map((guide) => [
      guide.file,
      1 + guide.sections.reduce((count, section) => count + section.steps.length, 0)
    ]),
    ['03_PRUEBA_USABILIDAD', 2]
  ]) {
    const html = await readFile(join(output, file + '.html'), 'utf8');
    assert(!secretPattern.test(html), 'Secret in editable manual.');
    assert(!/https?:\/\/|file:\/\//u.test(html), 'Nonportable document resource.');
    for (const match of html.matchAll(/<img src="([^"]+)"/gu)) {
      assert(/^imagenes\/[a-z0-9-]+\.png$/u.test(match[1]));
      await readFile(join(output, match[1]));
    }
    const document = await PDFDocument.load(await readFile(join(output, file + '.pdf')));
    assert.equal(document.getPageCount(), pages);
    for (const page of document.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyImages(join(root, 'docs/05-implementacion/evidence/m02-b01-ux02'))
    .then(async (inventory) => {
      await verifyDocuments(inventory);
      process.stdout.write(
        `UX02: ${inventory.captures.length} PNG verified; complete inventory, hashes, masks and no decodable QR.\n`
      );
    })
    .catch((error) => {
      process.stderr.write(`UX02 publication verification failed: ${redactQaText(error.message)}\n`);
      process.exitCode = 1;
    });
}
