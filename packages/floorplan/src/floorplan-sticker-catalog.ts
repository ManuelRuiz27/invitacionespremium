import type { FloorplanShape, FloorplanShapeInput } from '@invitaciones/api-client';
import { normalizeFloorplanShape } from './floorplan-geometry';

export type FloorplanStickerPresetId =
  | 'round-table'
  | 'rectangular-table'
  | 'imperial-table'
  | 'main-table'
  | 'dance-floor'
  | 'bar'
  | 'stage-dj'
  | 'entrance'
  | 'restrooms'
  | 'zone'
  | 'text-label';

export type FloorplanStickerGroup = 'TABLES' | 'ZONES';

export interface FloorplanStickerPreset {
  id: FloorplanStickerPresetId;
  label: string;
  group: FloorplanStickerGroup;
  preview: 'circle' | 'rectangle' | 'wide' | 'low';
  defaults: Pick<FloorplanShapeInput, 'kind' | 'geometry' | 'capacity' | 'width' | 'height'>;
  initialName: string;
}

export interface CreateStickerDraftContext {
  existingShapes?: ReadonlyArray<Pick<FloorplanShape, 'name'>>;
  existingNames?: readonly string[];
}

export const floorplanStickerPresets = [
  {
    id: 'round-table',
    label: 'Mesa redonda',
    group: 'TABLES',
    preview: 'circle',
    defaults: { kind: 'TABLE', geometry: 'CIRCLE', capacity: 10, width: 0.12, height: 0.12 },
    initialName: 'Mesa'
  },
  {
    id: 'rectangular-table',
    label: 'Mesa rectangular',
    group: 'TABLES',
    preview: 'rectangle',
    defaults: { kind: 'TABLE', geometry: 'RECTANGLE', capacity: 8, width: 0.16, height: 0.1 },
    initialName: 'Mesa'
  },
  {
    id: 'imperial-table',
    label: 'Mesa imperial',
    group: 'TABLES',
    preview: 'wide',
    defaults: { kind: 'TABLE', geometry: 'RECTANGLE', capacity: 12, width: 0.24, height: 0.08 },
    initialName: 'Mesa'
  },
  {
    id: 'main-table',
    label: 'Mesa principal',
    group: 'TABLES',
    preview: 'wide',
    defaults: { kind: 'TABLE', geometry: 'RECTANGLE', capacity: 10, width: 0.24, height: 0.1 },
    initialName: 'Mesa principal'
  },
  {
    id: 'dance-floor',
    label: 'Pista',
    group: 'ZONES',
    preview: 'rectangle',
    defaults: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.3, height: 0.2 },
    initialName: 'Pista'
  },
  {
    id: 'bar',
    label: 'Barra',
    group: 'ZONES',
    preview: 'low',
    defaults: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.22, height: 0.07 },
    initialName: 'Barra'
  },
  {
    id: 'stage-dj',
    label: 'Escenario / DJ',
    group: 'ZONES',
    preview: 'wide',
    defaults: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.26, height: 0.1 },
    initialName: 'Escenario / DJ'
  },
  {
    id: 'entrance',
    label: 'Entrada',
    group: 'ZONES',
    preview: 'low',
    defaults: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.12, height: 0.06 },
    initialName: 'Entrada'
  },
  {
    id: 'restrooms',
    label: 'Baños',
    group: 'ZONES',
    preview: 'rectangle',
    defaults: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.16, height: 0.08 },
    initialName: 'Baños'
  },
  {
    id: 'zone',
    label: 'Zona',
    group: 'ZONES',
    preview: 'rectangle',
    defaults: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.2, height: 0.14 },
    initialName: 'Zona'
  },
  {
    id: 'text-label',
    label: 'Texto / etiqueta',
    group: 'ZONES',
    preview: 'low',
    defaults: { kind: 'DECORATIVE_ZONE', geometry: 'RECTANGLE', capacity: 0, width: 0.18, height: 0.05 },
    initialName: 'Etiqueta'
  }
] as const satisfies readonly FloorplanStickerPreset[];

const normalizeName = (value: string) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-MX');

export function createUniqueFloorplanName(baseName: string, names: Iterable<string>) {
  const used = new Set(Array.from(names, normalizeName));
  if (!used.has(normalizeName(baseName))) return baseName;
  let suffix = 2;
  while (used.has(normalizeName(`${baseName} ${suffix}`))) suffix += 1;
  return `${baseName} ${suffix}`;
}

function nextTableName(names: readonly string[]) {
  const used = new Set(names.map(normalizeName));
  let sequence = 1;
  while (used.has(normalizeName(`Mesa ${sequence}`))) sequence += 1;
  return `Mesa ${sequence}`;
}

export function getFloorplanStickerPreset(presetId: FloorplanStickerPresetId) {
  return floorplanStickerPresets.find(({ id }) => id === presetId)!;
}

export function createStickerDraft(
  presetId: FloorplanStickerPresetId,
  context: CreateStickerDraftContext = {}
): FloorplanShapeInput {
  const preset = getFloorplanStickerPreset(presetId);
  const names = [...(context.existingNames ?? []), ...(context.existingShapes ?? []).map(({ name }) => name)];
  const name =
    preset.defaults.kind === 'TABLE' && preset.initialName === 'Mesa'
      ? nextTableName(names)
      : createUniqueFloorplanName(preset.initialName, names);
  return normalizeFloorplanShape({
    ...preset.defaults,
    name,
    x: 0.1,
    y: 0.1,
    rotation: 0,
    polygonPoints: null
  });
}

export function placeStickerDraft(shape: FloorplanShapeInput, point: { x: number; y: number }) {
  return normalizeFloorplanShape({
    ...shape,
    x: point.x - shape.width / 2,
    y: point.y - shape.height / 2
  });
}
