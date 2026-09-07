import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { FloorplanSvgValidator } from './floorplan-svg-validator';

describe('FloorplanSvgValidator', () => {
  it('parses UTF-8 SVG, removes comments and serializes deterministic canonical bytes', () => {
    const source = Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>\r\n<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><!-- discard --><g id="room"><rect height="10" width="10" fill="#fff"/></g></svg>'
    );

    const result = validator().validate(source);

    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.bytes.toString('utf8')).toBe(
      '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><g id="room"><rect fill="#fff" height="10" width="10"/></g></svg>\n'
    );
    expect(result.checksumSha256).toBe(createHash('sha256').update(result.bytes).digest('hex'));
    expect(result.sizeBytes).toBe(result.bytes.length);
  });

  it.each([
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.example/image.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://attacker.example/style.css)</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="//attacker.example/shape"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect clip-path="url(#missing)"/></svg>'
  ])('rejects active, external, unsupported or unresolved SVG content', (source) => {
    expect(() => validator().validate(Buffer.from(source))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'FILE_SVG_UNSAFE' }) })
    );
  });

  it('rejects malformed XML, incompatible encodings and malformed UTF-8', () => {
    expect(() => validator().validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>'))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'FILE_SVG_INVALID' }) })
    );
    expect(() =>
      validator().validate(Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><svg xmlns="http://www.w3.org/2000/svg"/>'))
    ).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'FILE_SVG_INVALID' }) }));
    expect(() => validator().validate(Buffer.from([0xff, 0xfe, 0xfd]))).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'FILE_SVG_INVALID' }) })
    );
  });

  it('enforces independent SVG byte, node and depth limits', () => {
    expect(() => validator({ maxBytes: 20 }).validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toThrow(
      expect.objectContaining({ status: 413, response: expect.objectContaining({ code: 'FILE_SVG_LIMIT_EXCEEDED' }) })
    );
    expect(() =>
      validator({ maxNodes: 2 }).validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g><path/></g></svg>'))
    ).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'FILE_SVG_LIMIT_EXCEEDED' }) }));
    expect(() =>
      validator({ maxDepth: 2 }).validate(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g><path/></g></svg>'))
    ).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'FILE_SVG_LIMIT_EXCEEDED' }) }));
  });
});

function validator(options: { maxBytes?: number; maxNodes?: number; maxDepth?: number } = {}): FloorplanSvgValidator {
  return new FloorplanSvgValidator({
    floorplanSvgMaxBytes: options.maxBytes ?? 1024 * 1024,
    floorplanSvgMaxNodes: options.maxNodes ?? 100,
    floorplanSvgMaxDepth: options.maxDepth ?? 10
  } as AppConfigService);
}
