import { describe, expect, it } from 'vitest';
import { PhysicalPassQrService, escapeXml } from './physical-pass-qr.service';

describe('PhysicalPassQrService', () => {
  it('renders deterministic private printable SVG without visible token or external content', async () => {
    const service = new PhysicalPassQrService();
    const input = {
      eventName: `Boda <Ana & José> "'`,
      passNumber: 17,
      tableName: 'Mesa & 4',
      qrToken:
        'pp1.00000000-0000-4000-8000-000000000001.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.signature'
    };
    const first = await service.render(input);
    const second = await service.render(input);
    const svg = first.bytes.toString('utf8');
    expect(first).toEqual(second);
    expect(svg).toContain('Boda &lt;Ana &amp; José&gt; &quot;&apos;');
    expect(svg).toContain('Mesa &amp; 4');
    expect(svg).toContain('Pase 17');
    expect(svg).not.toContain(input.qrToken);
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(
      /script|foreignObject|<image|href=|https?:\/\//iu
    );
    expect(first.etag).toMatch(/^"sha256-[0-9a-f]{64}"$/u);
  });

  it('escapes all XML metacharacters', () => {
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&apos;');
  });
});
