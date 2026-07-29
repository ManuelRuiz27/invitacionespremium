import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import QRCode from 'qrcode';

export interface PhysicalPassSvgInput {
  eventName: string;
  passNumber: number;
  tableName: string | null;
  qrToken: string;
}

export interface PhysicalPassSvgContent {
  bytes: Buffer;
  etag: string;
}

@Injectable()
export class PhysicalPassQrService {
  async render(input: PhysicalPassSvgInput): Promise<PhysicalPassSvgContent> {
    const qr = await QRCode.toString(input.qrToken, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 512,
      color: { dark: '#111827', light: '#FFFFFF' }
    });
    const paths = [...qr.matchAll(/<path ([^>]+)\/>/gu)].map((match) => `<path ${match[1]}/>`);
    const viewBox = qr.match(/viewBox="0 0 ([1-9]\d{0,2}) \1"/u);
    if (paths.length !== 2 || !viewBox || qr.includes(input.qrToken)) {
      throw new Error('Unsafe QR output.');
    }
    const eventName = escapeXml(input.eventName);
    const table =
      input.tableName === null
        ? ''
        : `<text x="350" y="292" font-family="sans-serif" font-size="28" font-weight="500" fill="#374151">${escapeXml(input.tableName)}</text>`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="360" viewBox="0 0 800 360">` +
      `<rect width="800" height="360" fill="#FFFFFF"/>` +
      `<svg x="24" y="24" width="312" height="312" viewBox="0 0 ${viewBox[1]} ${viewBox[1]}" shape-rendering="crispEdges">${paths.join('')}</svg>` +
      `<text x="350" y="90" font-family="sans-serif" font-size="30" font-weight="700" fill="#111827">${eventName}</text>` +
      `<text x="350" y="205" font-family="sans-serif" font-size="58" font-weight="700" fill="#111827">Pase ${input.passNumber}</text>` +
      table +
      `</svg>`;
    assertSafePhysicalPassSvg(svg, input.qrToken);
    const bytes = Buffer.from(svg, 'utf8');
    return { bytes, etag: `"sha256-${createHash('sha256').update(bytes).digest('hex')}"` };
  }
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    };
    return entities[character] ?? character;
  });
}

export function assertSafePhysicalPassSvg(svg: string, qrToken: string): void {
  if (
    svg.includes(qrToken) ||
    /<\?|<!DOCTYPE|<script|<foreignObject|<image|<metadata/iu.test(svg) ||
    /\s(?:href|xlink:href|src|on[a-z]+)\s*=/iu.test(svg) ||
    /url\s*\(/iu.test(svg) ||
    /https?:\/\//iu.test(svg.replace('http://www.w3.org/2000/svg', ''))
  ) {
    throw new Error('Unsafe physical pass SVG.');
  }
}
