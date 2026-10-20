import { createHash, randomUUID } from 'node:crypto';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { InvitationQrRenderer } from '../public-rsvp/invitation-qr.service';
import { NominalAccessQrService } from './nominal-access-qr.service';
import { NominalAccessTokenService } from './nominal-access-token.service';

describe('NominalAccessQrService', () => {
  const tokens = new NominalAccessTokenService({
    invitationTokenSigningSecret: 'nominal-qr-secret-at-least-32-bytes'
  } as AppConfigService);
  it('renders deterministic, independently decodable SVG and an ETag of its bytes', async () => {
    const service = new NominalAccessQrService(new InvitationQrRenderer());
    const token = tokens.issue(randomUUID(), tokens.createNonce());
    const content = await service.render(token);
    expect(await service.render(token)).toEqual(content);
    expect(content.etag).toBe(`"sha256-${createHash('sha256').update(content.bytes).digest('hex')}"`);
    const svg = content.bytes.toString('utf8');
    expect(svg).not.toContain(token);
    expect(svg).not.toMatch(/<text|<script|<metadata|href=|onload=|<!DOCTYPE|<\?/iu);
    const decoded = await sharp(content.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(decoded.data), decoded.info.width, decoded.info.height)?.data).toBe(token);
    expect((await service.render(tokens.issue(randomUUID(), tokens.createNonce()))).etag).not.toBe(content.etag);
  });
  it('rejects unsafe renderer output at the nominal boundary too', async () => {
    const renderer = new InvitationQrRenderer();
    vi.spyOn(renderer, 'render').mockResolvedValue(Buffer.from('<svg><script>alert(1)</script></svg>'));
    await expect(new NominalAccessQrService(renderer).render('internal-token')).rejects.toThrow(
      'Unsafe QR SVG output.'
    );
  });
});
