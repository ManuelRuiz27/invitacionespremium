/* global document, CSS, Node */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const decodeQr = createRequire(join(root, 'apps/scanner/package.json'))('jsqr');

export const secretPattern =
  /(?:st1\.[A-Za-z0-9_-]{43}|(?:ip|qr|pp|na)\d?\.[A-Za-z0-9_.-]{30,}|postgres(?:ql)?:\/\/|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})/iu;
export const maskColor = '#334155';

// Second, independent defense: inspect pixels in memory, before the first filesystem write.
export async function maskQrPixels(png) {
  const { width, height } = await sharp(png).metadata();
  const areas = [{ left: 0, top: 0, width, height }];
  for (let top = 0; top < height; top += 320)
    for (let left = 0; left < width; left += 320)
      areas.push({ left, top, width: Math.min(512, width - left), height: Math.min(512, height - top) });
  const masks = [];
  for (const area of areas) {
    const pixels = await sharp(png).extract(area).ensureAlpha().raw().toBuffer();
    const result = decodeQr(new Uint8ClampedArray(pixels), area.width, area.height);
    if (!result?.binaryData?.length) continue;
    const corners = [
      result.location.topLeftCorner,
      result.location.topRightCorner,
      result.location.bottomLeftCorner,
      result.location.bottomRightCorner
    ];
    const x = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x))) + area.left - 12);
    const y = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y))) + area.top - 12);
    const right = Math.min(width, Math.ceil(Math.max(...corners.map((point) => point.x))) + area.left + 12);
    const bottom = Math.min(height, Math.ceil(Math.max(...corners.map((point) => point.y))) + area.top + 12);
    masks.push({ x, y, width: right - x, height: bottom - y });
  }
  if (!masks.length) return { png, masks };
  const layers = await Promise.all(
    masks.map(async (box) => ({
      input: await sharp({ create: { width: box.width, height: box.height, channels: 3, background: maskColor } })
        .png()
        .toBuffer(),
      left: box.x,
      top: box.y
    }))
  );
  return { png: await sharp(png).composite(layers).png().toBuffer(), masks };
}

// Never write an unmasked image, DOM dump, network response, browser state or private URL.
export async function capture(page, directory, name, anchor, surface, mode, inventory) {
  if (!/^(?:admin|salon)-[a-z0-9-]+$/u.test(name)) throw new Error('Invalid guide image name.');
  await anchor.waitFor({ state: 'visible' });
  await anchor.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[role="progressbar"]').waitFor({ state: 'hidden' });
  const text = await page.locator('body').innerText();
  if (/Cargando|Procesando accesos|No pudimos|Internal Server Error|Este evento no está disponible/iu.test(text))
    throw new Error(`Unready guide screen: ${name}`);
  const route = new URL(page.url());
  const expectedPort = { admin: '5374', salon: '5373', scanner: '5375' }[surface];
  if (route.hostname !== 'localhost' || route.port !== expectedPort)
    throw new Error('Guide captured an unexpected runtime.');
  const masks = await page.evaluate((pattern) => {
    const sensitive = new RegExp(pattern, 'iu');
    const elements = new Set();
    for (const el of document.querySelectorAll('input, textarea')) {
      const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '';
      if (
        el.type === 'password' ||
        /password|contrase/iu.test(label ?? '') ||
        sensitive.test(el.value) ||
        /scanner\//iu.test(el.value)
      )
        elements.add(el);
    }
    for (const el of document.querySelectorAll('body *')) {
      // Mask text at its smallest containing element; leave surrounding controls legible.
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join('');
      if (sensitive.test(ownText)) elements.add(el);
    }
    for (const el of document.querySelectorAll('video, canvas, img, svg:not(.MuiSvgIcon-root)')) elements.add(el);
    const rectangles = [];
    let index = 0;
    for (const el of elements) {
      const box = el.getBoundingClientRect();
      if (box.width && box.height) {
        el.setAttribute('data-guide-mask', String(index++));
        rectangles.push({ x: box.x, y: box.y, width: box.width, height: box.height });
      }
    }
    return rectangles;
  }, secretPattern.source);
  const anchorText = await anchor.innerText();
  const focus = await anchor.boundingBox();
  const dialogs = page.getByRole('dialog');
  const dialog = (await dialogs.count()) === 1 ? await dialogs.boundingBox() : null;
  if (secretPattern.test(anchorText)) throw new Error('A guide anchor contained private data.');
  const png = await page.screenshot({
    animations: 'disabled',
    fullPage: false,
    mask: [page.locator('[data-guide-mask]')],
    maskColor
  });
  await page
    .locator('[data-guide-mask]')
    .evaluateAll((els) => els.forEach((el) => el.removeAttribute('data-guide-mask')));
  const safe = await maskQrPixels(png);
  masks.push(...safe.masks);
  const optimized = await sharp(safe.png).png({ compressionLevel: 9 }).toBuffer();
  const metadata = await sharp(optimized).metadata();
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}.png`), optimized);
  inventory.push({
    file: `${name}.png`,
    surface,
    mode,
    route: (route.pathname + route.search)
      .replace(/\/scanner\/[^/?]+/u, '/scanner/[oculto]')
      .replace(/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}/giu, '[referencia]'),
    anchor: anchorText.trim(),
    width: metadata.width,
    height: metadata.height,
    sha256: createHash('sha256').update(optimized).digest('hex'),
    masks,
    focus,
    dialog
  });
}
