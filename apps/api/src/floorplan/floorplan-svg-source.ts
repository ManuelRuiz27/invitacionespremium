import { SaxesParser, type SaxesTagNS } from 'saxes';
import pathBounds from 'svg-path-bounds';

const selectable = new Set(['g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline']);
type Matrix = [number, number, number, number, number, number];
type Box = { x: number; y: number; width: number; height: number };
type Node = { name: string; attrs: Record<string, string>; matrix: Matrix; children: Node[] };

export interface FloorplanSvgSourceDto {
  fileAssetId: string;
  viewBox: { minX: number; minY: number; width: number; height: number };
  aspectRatio: number;
  selectableElements: Array<{ sourceElementId: string; elementType: 'g' | 'path' | 'rect' | 'circle' | 'ellipse' | 'polygon' | 'polyline'; bbox: Box }>;
}

export function deriveFloorplanSvgSource(fileAssetId: string, bytes: Buffer): FloorplanSvgSourceDto {
  let root: Node | undefined;
  const stack: Node[] = [];
  let failed = false;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('error', () => { failed = true; });
  parser.on('opentag', (tag: SaxesTagNS) => {
    const attrs = Object.fromEntries(Object.values(tag.attributes).map((attribute) => [attribute.name, attribute.value]));
    const parent = stack.at(-1);
    const node: Node = {
      name: tag.local.toLowerCase(), attrs, matrix: multiply(parent?.matrix ?? identity(), transform(attrs.transform)), children: []
    };
    if (node.matrix.some((value) => !Number.isFinite(value))) throw new Error('Invalid SVG transform.');
    if (parent) parent.children.push(node); else root = node;
    stack.push(node);
  });
  parser.on('closetag', () => { stack.pop(); });
  try { parser.write(bytes.toString('utf8')).close(); } catch { failed = true; }
  if (failed || !root || root.name !== 'svg') throw new Error('Invalid canonical SVG source.');
  const values = (root.attrs.viewBox ?? '').trim().split(/[\s,]+/u).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) || values[2]! <= 0 || values[3]! <= 0) {
    throw new Error('SVG source requires a non-zero viewBox.');
  }
  const viewBox = { minX: values[0]!, minY: values[1]!, width: values[2]!, height: values[3]! };
  const elements: FloorplanSvgSourceDto['selectableElements'] = [];
  const visit = (node: Node): Box | undefined => {
    const childBoxes = node.children.map(visit).filter((box): box is Box => Boolean(box));
    const own = node.name === 'g' ? union(childBoxes) : geometry(node);
    if (selectable.has(node.name) && own) {
      const sourceElementId = node.attrs.id;
      if (!sourceElementId) throw new Error('Canonical selectable SVG element is missing its id.');
      elements.push({ sourceElementId, elementType: node.name as FloorplanSvgSourceDto['selectableElements'][number]['elementType'], bbox: normalize(own, viewBox) });
    }
    return own;
  };
  visit(root);
  return { fileAssetId, viewBox, aspectRatio: viewBox.width / viewBox.height, selectableElements: elements };
}

function geometry(node: Node): Box | undefined {
  const n = (name: string, fallback = 0) => Number(node.attrs[name] ?? fallback);
  let points: Array<{ x: number; y: number }>;
  switch (node.name) {
    case 'rect': points = corners(n('x'), n('y'), n('width'), n('height')); break;
    case 'circle': points = corners(n('cx') - n('r'), n('cy') - n('r'), n('r') * 2, n('r') * 2); break;
    case 'ellipse': points = corners(n('cx') - n('rx'), n('cy') - n('ry'), n('rx') * 2, n('ry') * 2); break;
    case 'polygon': case 'polyline': points = pairs(node.attrs.points ?? ''); break;
    case 'path': {
      try { const [minX, minY, maxX, maxY] = pathBounds(node.attrs.d ?? ''); points = corners(minX, minY, maxX - minX, maxY - minY); } catch { return undefined; }
      break;
    }
    default: return undefined;
  }
  if (!points.length || points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return undefined;
  const transformed = points.map((point) => apply(node.matrix, point));
  if (transformed.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error('Invalid SVG transformed geometry.');
  }
  return bounds(transformed);
}
function pairs(value: string) { const values = value.trim().split(/[\s,]+/u).map(Number); const points = []; for (let i = 0; i + 1 < values.length; i += 2) points.push({ x: values[i]!, y: values[i + 1]! }); return points; }
function corners(x: number, y: number, width: number, height: number) { return [{ x, y }, { x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height }]; }
function bounds(points: Array<{ x: number; y: number }>): Box { const xs = points.map((point) => point.x); const ys = points.map((point) => point.y); const x = Math.min(...xs); const y = Math.min(...ys); return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }; }
function union(boxes: Box[]): Box | undefined { return boxes.length ? bounds(boxes.flatMap((box) => corners(box.x, box.y, box.width, box.height))) : undefined; }
function normalize(box: Box, viewBox: FloorplanSvgSourceDto['viewBox']): Box { const clamp = (value: number) => Math.max(0, Math.min(1, value)); const x = clamp((box.x - viewBox.minX) / viewBox.width); const y = clamp((box.y - viewBox.minY) / viewBox.height); return { x, y, width: Math.max(0, clamp((box.x + box.width - viewBox.minX) / viewBox.width) - x), height: Math.max(0, clamp((box.y + box.height - viewBox.minY) / viewBox.height) - y) }; }
function identity(): Matrix { return [1, 0, 0, 1, 0, 0]; }
function multiply(left: Matrix, right: Matrix): Matrix { return [left[0]*right[0]+left[2]*right[1], left[1]*right[0]+left[3]*right[1], left[0]*right[2]+left[2]*right[3], left[1]*right[2]+left[3]*right[3], left[0]*right[4]+left[2]*right[5]+left[4], left[1]*right[4]+left[3]*right[5]+left[5]]; }
function apply(matrix: Matrix, point: { x: number; y: number }) { return { x: matrix[0]*point.x + matrix[2]*point.y + matrix[4], y: matrix[1]*point.x + matrix[3]*point.y + matrix[5] }; }
// Consume the entire list: ignoring syntax would persist geometry unlike the SVG.
function transform(value?: string): Matrix {
  if (value === undefined || value.trim() === '') return identity();
  const invalid = () => { throw new Error('Invalid SVG transform.'); };
  const number = '[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
  const argumentsPattern = new RegExp(`^${number}(?:(?:[ \\t\\r\\n]+,?[ \\t\\r\\n]*|,[ \\t\\r\\n]*)${number})*$`, 'u');
  let remaining = value.trim();
  let result = identity();
  while (remaining) {
    const match = /^([a-zA-Z]+)[ \t\r\n]*\(([^()]*)\)/u.exec(remaining);
    if (!match) return invalid();
    const args = match[2]!.trim();
    if (!argumentsPattern.test(args)) return invalid();
    const values = args.split(/[\s,]+/u).map(Number);
    if (values.some((item) => !Number.isFinite(item))) return invalid();
    let next: Matrix;
    switch (match[1]) {
      case 'matrix':
        if (values.length !== 6) return invalid();
        next = values as Matrix;
        break;
      case 'translate':
        if (values.length !== 1 && values.length !== 2) return invalid();
        next = [1, 0, 0, 1, values[0]!, values[1] ?? 0];
        break;
      case 'scale':
        if (values.length !== 1 && values.length !== 2) return invalid();
        next = [values[0]!, 0, 0, values[1] ?? values[0]!, 0, 0];
        break;
      case 'rotate': {
        if (values.length !== 1 && values.length !== 3) return invalid();
        const radians = (values[0]! % 360) * Math.PI / 180;
        const rotation: Matrix = [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
        const [cx, cy] = [values[1] ?? 0, values[2] ?? 0];
        next = multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
      case 'skewY': {
        if (values.length !== 1) return invalid();
        const tangent = Math.tan((values[0]! % 180) * Math.PI / 180);
        next = match[1] === 'skewX' ? [1, 0, tangent, 1, 0, 0] : [1, tangent, 0, 1, 0, 0];
        break;
      }
      default: return invalid();
    }
    result = multiply(result, next);
    if (result.some((item) => !Number.isFinite(item))) return invalid();
    remaining = remaining.slice(match[0].length).trimStart();
    if (remaining.startsWith(',')) {
      remaining = remaining.slice(1).trimStart();
      if (!remaining) return invalid();
    }
  }
  return result;
}
