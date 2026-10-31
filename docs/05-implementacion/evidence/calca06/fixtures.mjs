import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import sharp from 'sharp';

// Hand-authored fictitious plans. No client data, OCR, AI or image recognition.
export const evidence = resolve('docs/05-implementacion/evidence/calca06');
export const placements = Array.from({ length: 6 }, (_, index) => ({
  x: 0.24 + (index % 3) * 0.25,
  y: 0.35 + Math.floor(index / 3) * 0.3
}));
export function seatPosition(table, index) {
  return { x: table.x - 0.075 + (index % 5) * 0.0375, y: table.y - 0.065 + Math.floor(index / 5) * 0.0325 };
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function createFixtures() {
  await mkdir(`${evidence}/fixtures`, { recursive: true });
  const sources = [];
  for (const [key, width, height] of [
    ['landscape', 1600, 1000],
    ['portrait', 1000, 1500],
    ['square', 1200, 1200]
  ]) {
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="${width}" height="${height}" fill="#fffdf7"/>`,
      `<text x="${width * 0.07}" y="${height * 0.065}" font-family="Arial" font-size="${width * 0.022}" fill="#253541">SALÓN LOS OLIVOS · PLANO FICTICIO</text>`,
      `<text x="${width * 0.07}" y="${height * 0.1}" font-family="Arial" font-size="${width * 0.014}">Boda de Elena y Mateo · 150 personas · circulación libre</text>`,
      `<path d="M ${width * 0.06} ${height * 0.14} H ${width * 0.94} V ${height * 0.94} H ${width * 0.56} M ${width * 0.44} ${height * 0.94} H ${width * 0.06} Z" fill="none" stroke="#526570" stroke-width="5"/>`,
      `<rect x="${width * 0.39}" y="${height * 0.16}" width="${width * 0.22}" height="${height * 0.07}" fill="#ece6d8" stroke="#8c8a7d"/>`,
      `<text x="${width * 0.44}" y="${height * 0.2}" font-family="Arial" font-size="${width * 0.017}">ESCENARIO</text>`,
      `<text x="${width * 0.11}" y="${height * 0.2}" font-family="Arial" font-size="${width * 0.015}">BARRA / DJ</text>`,
      `<text x="${width * 0.75}" y="${height * 0.2}" font-family="Arial" font-size="${width * 0.015}">BAÑOS</text>`,
      `<text x="${width * 0.42}" y="${height * 0.5}" font-family="Arial" font-size="${width * 0.019}" fill="#727a73">PISTA / PASILLO</text>`,
      `<text x="${width * 0.46}" y="${height * 0.975}" font-family="Arial" font-size="${width * 0.016}">ACCESO</text>`
    ];
    placements.forEach((table, t) => {
      const x = width * table.x,
        y = height * table.y;
      parts.push(
        `<path d="M ${x - width * 0.06} ${y - height * 0.04} L ${x - width * 0.02} ${y - height * 0.06} L ${x + width * 0.06} ${y - height * 0.02} L ${x + width * 0.045} ${y + height * 0.045} L ${x - width * 0.045} ${y + height * 0.045} Z" fill="#f0ecdf" stroke="#a69a7d" stroke-width="2"/>`
      );
      parts.push(
        `<text x="${x - width * 0.037}" y="${y + height * 0.1}" font-family="Arial" font-size="${width * 0.016}">Mesa ${t + 1}</text>`
      );
      for (let i = 0; i < 25; i++) {
        const seat = seatPosition(table, i);
        parts.push(
          `<circle cx="${seat.x * width}" cy="${seat.y * height}" r="${Math.min(width, height) * 0.004}" fill="white" stroke="#8d958a"/>`
        );
      }
    });
    parts.push('</svg>');
    const bytes = await sharp(Buffer.from(parts.join('')))
      .png()
      .toBuffer();
    const file = `fixtures/${key}.png`;
    await writeFile(`${evidence}/${file}`, bytes);
    sources.push({ key, file, mime: 'image/png', sourceType: 'RASTER', width, height, sha256: digest(bytes) });
  }
  for (const count of [100, 200]) {
    const nodes = Array.from({ length: count }, (_, i) => {
      const x = 65 + (i % 20) * 74,
        y = 155 + Math.floor(i / 20) * 74;
      return `<path id="mueble-${i + 1}" d="M${x} ${y} l40 -8 l16 24 l-9 27 l-44 -7 Z" fill="#f2eddf" stroke="#7f897c" stroke-width="2"/>`;
    });
    const bytes = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><text x="65" y="65" font-family="Arial" font-size="28">SALÓN LOS OLIVOS · SVG IRREGULAR FICTICIO</text><text x="65" y="110" font-family="Arial" font-size="20">${count} muebles seleccionables · sin estado operacional</text>${nodes.join('')}</svg>`
    );
    const file = `fixtures/irregular-${count}.svg`;
    await writeFile(`${evidence}/${file}`, bytes);
    sources.push({
      key: `svg-${count}`,
      file,
      mime: 'image/svg+xml',
      sourceType: 'SVG',
      width: 1600,
      height: 1000,
      selectableElements: count,
      sha256: digest(bytes)
    });
  }
  await writeFile(`${evidence}/fixtures.json`, JSON.stringify(sources, null, 2) + '\n');
  return sources;
}
