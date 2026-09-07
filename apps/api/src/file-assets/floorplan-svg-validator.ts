import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { SaxesParser, type SaxesTagNS } from 'saxes';
import { DomainError } from '../common/errors/domain-error';
import { AppConfigService } from '../config/app-config.service';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';
const SAFE_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'text',
  'tspan',
  'title',
  'desc',
  'use'
]);
const CANONICAL_ELEMENT_NAMES = new Map<string, string>([
  ['svg', 'svg'],
  ['g', 'g'],
  ['path', 'path'],
  ['rect', 'rect'],
  ['circle', 'circle'],
  ['ellipse', 'ellipse'],
  ['polygon', 'polygon'],
  ['polyline', 'polyline'],
  ['defs', 'defs'],
  ['lineargradient', 'linearGradient'],
  ['radialgradient', 'radialGradient'],
  ['stop', 'stop'],
  ['clippath', 'clipPath'],
  ['text', 'text'],
  ['tspan', 'tspan'],
  ['title', 'title'],
  ['desc', 'desc'],
  ['use', 'use']
]);
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc']);
const REFERENCE_ATTRIBUTES = new Set(['clip-path', 'mask', 'filter']);
const COMMON_ATTRIBUTES = new Set([
  'id',
  'class',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'transform',
  'display',
  'visibility',
  'clip-path',
  'mask',
  'filter',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'text-anchor',
  'dominant-baseline'
]);
const ELEMENT_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  svg: ['viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'version'],
  path: ['d', 'pathLength'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  polygon: ['points'],
  polyline: ['points'],
  lineargradient: ['x1', 'y1', 'x2', 'y2', 'gradientUnits', 'gradientTransform', 'spreadMethod'],
  radialgradient: ['cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientUnits', 'gradientTransform', 'spreadMethod'],
  stop: ['offset', 'stop-color', 'stop-opacity'],
  clippath: ['clipPathUnits'],
  text: ['x', 'y', 'dx', 'dy', 'rotate', 'lengthAdjust', 'textLength'],
  tspan: ['x', 'y', 'dx', 'dy', 'rotate', 'lengthAdjust', 'textLength'],
  use: ['x', 'y', 'width', 'height', 'href', 'xlink:href']
};
const CANONICAL_ATTRIBUTE_NAMES = new Map<string, string>([
  ...COMMON_ATTRIBUTES,
  ...Object.values(ELEMENT_ATTRIBUTES).flat()
].map((name) => [name.toLowerCase(), name]));

interface CanonicalAttribute {
  name: string;
  value: string;
}

interface CanonicalElement {
  name: string;
  attributes: CanonicalAttribute[];
  children: Array<CanonicalElement | string>;
}

const SELECTABLE_ELEMENTS = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline']);

export interface ValidatedFloorplanSvg {
  bytes: Buffer;
  mimeType: 'image/svg+xml';
  sizeBytes: number;
  checksumSha256: string;
}

@Injectable()
export class FloorplanSvgValidator {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  validate(input: Buffer): ValidatedFloorplanSvg {
    if (input.length === 0) throw invalidSvg();
    if (input.length > this.config.floorplanSvgMaxBytes) {
      throw svgLimitExceeded('SVG content exceeds the configured byte limit.');
    }

    let source: string;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      throw invalidSvg();
    }

    const stack: CanonicalElement[] = [];
    const ids = new Set<string>();
    const references: string[] = [];
    let root: CanonicalElement | undefined;
    let nodeCount = 0;
    let usesXlink = false;
    let failure: DomainError | undefined;
    const fail = (error: DomainError) => {
      failure ??= error;
    };
    const parser = new SaxesParser({ xmlns: true, defaultXMLVersion: '1.0', forceXMLVersion: true });

    parser.on('xmldecl', (declaration) => {
      if (declaration.encoding !== undefined && declaration.encoding.toLowerCase() !== 'utf-8') fail(invalidSvg());
    });
    parser.on('doctype', () => fail(unsafeSvg()));
    parser.on('processinginstruction', () => fail(unsafeSvg()));
    parser.on('error', () => fail(invalidSvg()));
    parser.on('opentag', (tag) => {
      if (failure) return;
      nodeCount += 1;
      if (nodeCount > this.config.floorplanSvgMaxNodes) {
        fail(svgLimitExceeded('SVG content exceeds the configured node limit.'));
        return;
      }
      if (stack.length + 1 > this.config.floorplanSvgMaxDepth) {
        fail(svgLimitExceeded('SVG content exceeds the configured depth limit.'));
        return;
      }
      const element = this.toCanonicalElement(tag, stack.length === 0, references, (value) => {
        usesXlink ||= value;
      });
      if (!element) {
        fail(unsafeSvg());
        return;
      }
      if (stack.length === 0) {
        if (root) {
          fail(invalidSvg());
          return;
        }
        root = element;
      } else {
        stack.at(-1)?.children.push(element);
      }
      stack.push(element);
    });
    parser.on('text', (text) => {
      if (failure || stack.length === 0) {
        if (text.trim()) fail(invalidSvg());
        return;
      }
      const parent = stack.at(-1)!;
      if (!TEXT_ELEMENTS.has(parent.name)) {
        if (text.trim()) fail(unsafeSvg());
        return;
      }
      parent.children.push(normalizeLineEndings(text));
    });
    parser.on('cdata', (text) => {
      if (failure || stack.length === 0 || !TEXT_ELEMENTS.has(stack.at(-1)!.name)) {
        fail(unsafeSvg());
        return;
      }
      stack.at(-1)!.children.push(normalizeLineEndings(text));
    });
    parser.on('closetag', () => {
      if (stack.length === 0) {
        fail(invalidSvg());
        return;
      }
      stack.pop();
    });

    try {
      parser.write(source).close();
    } catch {
      fail(invalidSvg());
    }
    if (failure) throw failure;
    if (!root || stack.length !== 0 || root.name !== 'svg') throw invalidSvg();
    if (!canonicalizeSelectableIds(root, ids)) throw unsafeSvg();
    for (const reference of references) {
      if (!ids.has(reference)) throw unsafeSvg();
    }
    root.attributes.push({ name: 'xmlns', value: SVG_NAMESPACE });
    if (usesXlink) root.attributes.push({ name: 'xmlns:xlink', value: XLINK_NAMESPACE });
    const canonical = `${serialize(root)}\n`;
    const bytes = Buffer.from(canonical, 'utf8');
    if (bytes.length > this.config.floorplanSvgMaxBytes) {
      throw svgLimitExceeded('Canonical SVG content exceeds the configured byte limit.');
    }
    return {
      bytes,
      mimeType: 'image/svg+xml',
      sizeBytes: bytes.length,
      checksumSha256: createHash('sha256').update(bytes).digest('hex')
    };
  }

  private toCanonicalElement(
    tag: SaxesTagNS,
    isRoot: boolean,
    references: string[],
    markXlink: (used: boolean) => void
  ): CanonicalElement | undefined {
    const name = tag.local.toLowerCase();
    if (
      tag.prefix ||
      tag.uri !== SVG_NAMESPACE ||
      !SAFE_ELEMENTS.has(name) ||
      (isRoot ? name !== 'svg' : name === 'svg')
    ) {
      return undefined;
    }
    const allowed = new Set([...COMMON_ATTRIBUTES, ...(ELEMENT_ATTRIBUTES[name] ?? [])]);
    const attributes: CanonicalAttribute[] = [];
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.uri === XMLNS_NAMESPACE) {
        if (
          (!isRoot && attribute.name !== 'xmlns:xlink') ||
          (attribute.name === 'xmlns' && attribute.value !== SVG_NAMESPACE) ||
          (attribute.name === 'xmlns:xlink' && attribute.value !== XLINK_NAMESPACE) ||
          (attribute.name !== 'xmlns' && attribute.name !== 'xmlns:xlink')
        ) {
          return undefined;
        }
        continue;
      }
      const attributeName = attribute.name.toLowerCase();
      if (attributeName.startsWith('on') || attributeName === 'style') return undefined;
      const isXlinkHref = attribute.uri === XLINK_NAMESPACE && attribute.local === 'href';
      if (attribute.uri && attribute.uri !== SVG_NAMESPACE && !isXlinkHref) return undefined;
      const canonicalName = isXlinkHref ? 'xlink:href' : CANONICAL_ATTRIBUTE_NAMES.get(attributeName);
      if (!canonicalName || !allowed.has(canonicalName)) return undefined;
      const value = normalizeLineEndings(attribute.value);
      const reference = validateAttribute(canonicalName, value);
      if (reference === false) return undefined;
      if (canonicalName === 'id' && !isSafeId(value)) return undefined;
      if (reference) references.push(reference);
      if (isXlinkHref) markXlink(true);
      attributes.push({ name: canonicalName, value });
    }
    return { name: CANONICAL_ELEMENT_NAMES.get(name)!, attributes, children: [] };
  }
}

/**
 * Selectable nodes always get an identity in the canonical document.  The
 * fingerprint deliberately describes the XML tree (rather than a renderer
 * list position), so reloads of the same canonical source keep the same id.
 * References to an ambiguous original id are rejected before serialization.
 */
function canonicalizeSelectableIds(root: CanonicalElement, ids: Set<string>): boolean {
  const originals = new Map<string, CanonicalElement[]>();
  const walk = (element: CanonicalElement) => {
    const id = attribute(element, 'id');
    if (id) originals.set(id, [...(originals.get(id) ?? []), element]);
    for (const child of element.children) if (typeof child !== 'string') walk(child);
  };
  walk(root);
  for (const [id, elements] of originals) {
    if (elements.length === 1) ids.add(id);
  }
  const used = new Set(ids);
  const assign = (element: CanonicalElement, ancestry: string) => {
    const originalId = attribute(element, 'id');
    const isUniqueOriginal = Boolean(originalId && originals.get(originalId)?.length === 1);
    const signature = structuralSignature(element);
    const address = `${ancestry}/${element.name}:${createHash('sha256').update(signature).digest('hex').slice(0, 20)}`;
    if (SELECTABLE_ELEMENTS.has(element.name) && !isUniqueOriginal) {
      let candidate = `svg-${createHash('sha256').update(address).digest('hex').slice(0, 24)}`;
      let collision = 1;
      while (used.has(candidate)) candidate = `svg-${createHash('sha256').update(`${address}:${collision++}`).digest('hex').slice(0, 24)}`;
      setAttribute(element, 'id', candidate);
      used.add(candidate);
    }
    for (const child of element.children) if (typeof child !== 'string') assign(child, address);
  };
  assign(root, 'root');
  // A duplicate original reference cannot be safely reconciled to a node.
  for (const [id, elements] of originals) if (elements.length > 1) return !hasReference(root, id);
  return true;
}

function structuralSignature(element: CanonicalElement): string {
  const attributes = element.attributes.filter(({ name }) => name !== 'id').map(({ name, value }) => `${name}=${value}`).sort().join('|');
  const children = element.children.map((child) => typeof child === 'string' ? `#${child}` : structuralSignature(child)).join('');
  return `${element.name}[${attributes}]${children}`;
}

function attribute(element: CanonicalElement, name: string): string | undefined {
  return element.attributes.find((attribute) => attribute.name === name)?.value;
}

function setAttribute(element: CanonicalElement, name: string, value: string) {
  const current = element.attributes.find((attribute) => attribute.name === name);
  if (current) current.value = value;
  else element.attributes.push({ name, value });
}

function hasReference(element: CanonicalElement, id: string): boolean {
  return element.attributes.some(({ name, value }) => {
    const reference = validateAttribute(name, value);
    return reference === id;
  }) || element.children.some((child) => typeof child !== 'string' && hasReference(child, id));
}

function validateAttribute(name: string, value: string): string | false | undefined {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (hasDisallowedControlCharacter(value)) return false;
  if (name === 'href' || name === 'xlink:href') return fragmentReference(normalized);
  if (REFERENCE_ATTRIBUTES.has(name)) return urlFragmentReference(normalized);
  if (lower.includes('url(')) return false;
  if (
    lower.includes('javascript:') ||
    lower.includes('data:') ||
    lower.includes('file:') ||
    lower.includes('blob:') ||
    lower.includes('http:') ||
    lower.includes('https:') ||
    lower.includes('//') ||
    lower.includes('@import')
  ) {
    return false;
  }
  return undefined;
}

function fragmentReference(value: string): string | false {
  if (!value.startsWith('#')) return false;
  const id = value.slice(1);
  return isSafeId(id) ? id : false;
}

function urlFragmentReference(value: string): string | false {
  const match = /^url\(#([A-Za-z_][A-Za-z0-9_.:-]*)\)$/u.exec(value);
  return match?.[1] ?? false;
}

function isSafeId(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(value);
}

function hasDisallowedControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (codePoint < 32 && codePoint !== 9 && codePoint !== 10 && codePoint !== 13) || codePoint === 127;
  });
}

function serialize(element: CanonicalElement): string {
  const attributes = [...element.attributes]
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join('');
  if (element.children.length === 0) return `<${element.name}${attributes}/>`;
  return `<${element.name}${attributes}>${element.children
    .map((child) => (typeof child === 'string' ? escapeText(child) : serialize(child)))
    .join('')}</${element.name}>`;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/gu, '\n');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
}

function escapeText(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

function invalidSvg(): DomainError {
  return new DomainError('FILE_SVG_INVALID', 'SVG content is not valid UTF-8 SVG.', HttpStatus.BAD_REQUEST);
}

function unsafeSvg(): DomainError {
  return new DomainError('FILE_SVG_UNSAFE', 'SVG content contains an unsafe construct.', HttpStatus.BAD_REQUEST);
}

function svgLimitExceeded(message: string): DomainError {
  return new DomainError('FILE_SVG_LIMIT_EXCEEDED', message, HttpStatus.PAYLOAD_TOO_LARGE);
}
