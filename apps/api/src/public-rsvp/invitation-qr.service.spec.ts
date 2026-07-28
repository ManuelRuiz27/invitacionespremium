import { describe, expect, it } from 'vitest';
import { assertSafeInvitationQrSvg, InvitationQrRenderer } from './invitation-qr.service';

describe('InvitationQrRenderer', () => {
  it('generates deterministic, defensively validated SVG bytes without literal payload text', async () => {
    const renderer = new InvitationQrRenderer();
    const token = `qr1.00000000-0000-4000-8000-000000000000.${'a'.repeat(64)}.${'b'.repeat(43)}`;
    const first = await renderer.render(token);
    const second = await renderer.render(token);
    const svg = first.toString('utf8');

    expect(second).toEqual(first);
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="512" height="512" viewBox="0 0 \d+ \d+"/u
    );
    expect(svg).not.toContain(token);
    expect(svg).not.toMatch(/<script|<foreignObject|<image|<text|<metadata|<!DOCTYPE|href=|onload=/iu);
  });

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject /></svg>',
    '<svg><image href="https://example.com/a.png" /></svg>',
    '<svg><text>secret</text></svg>',
    '<!DOCTYPE svg><svg></svg>',
    '<svg onload="alert(1)"></svg>'
  ])('rejects unsafe or unexpected SVG output: %s', (svg) => {
    expect(() => assertSafeInvitationQrSvg(svg, 'secret-token')).toThrow();
  });
});
